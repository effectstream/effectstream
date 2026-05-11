import { Primitive } from "@effectstream/sm";
import {
  type AddressAndType,
  AddressType,
  type MidnightAddress,
  type EffectstreamBlockNumber,
  uint8ArrayToHexString,
} from "@effectstream/utils";
import type { StaticDecode } from "@sinclair/typebox";
import {
  type CommandTuple,
  generateRawStmInput,
  type ParamToData,
} from "@effectstream/concise";
import type {
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  LedgerFieldType,
  LedgerSchema,
  ProtocolPrimitiveMap,
  StateValue,
} from "@effectstream/config";
import type { SyncStateUpdateStream } from "@effectstream/coroutine";
import { PrimitiveTypeMidnightGeneric } from "../builtin.ts";
import { midnightGenericGrammar } from "./midnight-genetic-grammar.ts"


export class MidnightGenericPrimitive extends Primitive<
  ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
  typeof midnightGenericGrammar
> {
  // Primitive defined
  readonly internalTypeName = PrimitiveTypeMidnightGeneric;
  override readonly grammar = midnightGenericGrammar;
  readonly contractAddress: string;
  readonly contract: {
    ledger: (data: StateValue) => any;
  };
  readonly ledgerSchema?: LedgerSchema;
  readonly networkId: string;
  readonly genesisHash: string;
  // No dynamic tables for midnight generic primitive
  override dynamicTables = undefined;
  override getIntermediatePrefix(): string[] {
    return [];
  }
  override getViewPrefix(): string[] {
    return [];
  }

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    contractAddress: MidnightAddress;
    stateMachinePrefix: string;
    contract: {
      ledger: (data: StateValue) => any;
    };
    ledgerSchema?: LedgerSchema;
    networkId?: string;
    genesisHash?: string;
  }) {
    super(config);
    this.contractAddress = config.contractAddress;
    this.contract = config.contract;
    this.ledgerSchema = config.ledgerSchema;
    this.networkId = config.networkId ?? "undeployed";
    this.genesisHash = config.genesisHash || "";
  }

  /**
   * Parses ledger fields from the raw Midnight StateValue using the `ledgerSchema`.
   * The schema keys must be in Compact declaration order — the parser maps each key
   * to the corresponding positional index in the state array.
   */
  parseAdditionalLedgerFields(stateValue: StateValue): Record<string, any> {
    if (!this.ledgerSchema) return {};

    const stateArray: StateValue[] = stateValue.asArray?.() ?? [];
    const result: Record<string, any> = {};
    const schemaEntries = Object.entries(this.ledgerSchema);

    for (let i = 0; i < schemaEntries.length && i < stateArray.length; i++) {
      const [fieldName, fieldType] = schemaEntries[i];
      result[fieldName] = parseLedgerField(stateArray[i], fieldType);
    }

    return result;
  }

  override *getPayload(
    _: EffectstreamBlockNumber,
    primitiveTransactionData: FlattenSyncProtocolIOFor<
      ConfigSyncProtocolType.MIDNIGHT_PARALLEL
    >,
  ): SyncStateUpdateStream<{
    isBatched: boolean;
    data: {
      fromAddressAndType: AddressAndType;
      stateMachinePayload:
        | StaticDecode<CommandTuple<string, typeof midnightGenericGrammar>>
        | null;
      accountingPayload: ParamToData<typeof midnightGenericGrammar>;
    }[];
  }> {
    const payload = primitiveTransactionData.output.payload;
    try {
      const isBatched = false;
     
      const accountingPayload: ParamToData<typeof this.grammar> = {
        payload: makeJsonSafe(payload),
      };
     
      const stateMachinePayload:
        | StaticDecode<
          CommandTuple<string, typeof this.grammar>
        >
        | null = this.stateMachinePrefix
          ? generateRawStmInput(
            this.grammar,
            this.stateMachinePrefix,
            accountingPayload,
          )
          : null;

      return {
        isBatched,
        data: [
          {
            fromAddressAndType: {
              type: AddressType.NONE,
              address: "0x0",
            },
            accountingPayload,
            stateMachinePayload,
          },
        ],
      };
    } catch (error) {
      console.error(
        "[ERROR] Decoding Midnight Generic Payload:",
        JSON.stringify(payload),
      );
      throw error;
    }
  }

  override getConfig(): ProtocolPrimitiveMap[
    ConfigSyncProtocolType.MIDNIGHT_PARALLEL
  ] {
    return {
      name: this.instanceName,
      type: this.internalTypeName,
      startBlockHeight: this.startBlockHeight,
      contractAddress: this.contractAddress,
      // TODO This should be optional
      scheduledPrefix: this.stateMachinePrefix ?? "",
      contract: this.contract,
      parseAdditionalLedgerFields: this.ledgerSchema
        ? this.parseAdditionalLedgerFields.bind(this)
        : undefined,
      // FIXME: historically we relied on NetworkId enum values, but
      // the v1 runtime expects canonical string identifiers instead.
      networkId: this.networkId,
      // TODO This is unused for now.
      genesisHash: this.genesisHash || "",
    } as const;
  }
}

function alignedValueToHex(value: { value: Uint8Array[] }): string {
  return (
    "0x" +
    value.value
      .map((chunk: Uint8Array) =>
        Array.from(chunk)
          .map((b: number) => b.toString(16).padStart(2, "0"))
          .join("")
      )
      .join("")
  );
}

function parseUintCellLittleEndian(chunks: Uint8Array[]): string {
  let result = 0n;
  let shift = 0n;
  for (const chunk of chunks) {
    for (const byte of chunk) {
      result |= BigInt(byte) << shift;
      shift += 8n;
    }
  }
  return result.toString();
}

function parseLedgerField(sv: StateValue, type: LedgerFieldType): any {
  if (typeof type === "object" && type.type === "option") {
    if (sv.type() === "null") return null;
    return parseLedgerField(sv, type.value);
  }

  if (typeof type === "object" && type.type === "map") {
    const map = sv.asMap();
    if (!map) return {};

    const result: Record<string, any> = {};
    for (const key of map.keys()) {
      const val = map.get(key);
      if (val !== undefined) {
        result[alignedValueToHex(key as { value: Uint8Array[] })] = parseLedgerField(
          val,
          type.value,
        );
      }
    }
    return result;
  }

  if (sv.type() !== "cell") return null;
  const cell = sv.asCell();

  if (
    type === "uint8" ||
    type === "uint16" ||
    type === "uint32" ||
    type === "uint64" ||
    type === "uint128"
  ) {
    return parseUintCellLittleEndian(cell.value as Uint8Array[]);
  }

  if (type === "bytes") {
    return alignedValueToHex(cell as { value: Uint8Array[] });
  }

  if (type === "boolean") {
    return (cell.value as Uint8Array[]).some((chunk: Uint8Array) =>
      chunk.some((b: number) => b !== 0)
    );
  }

  return null;
}

function isCompactMap(data: object): data is Iterable<[unknown, unknown]> {
  return (
    typeof (data as any).member === 'function' &&
    typeof (data as any).lookup === 'function' &&
    Symbol.iterator in data
  );
}

function makeJsonSafe(data: unknown): any {
  if (typeof data === 'boolean' || typeof data === 'number' || typeof data === 'string') {
    return data;
  }
  if (typeof data === 'bigint') {
    return data.toString();
  }
  if (data === null || data === undefined) {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(makeJsonSafe);
  }
  if (data instanceof Uint8Array) {
    return uint8ArrayToHexString(data);
  }
  if (typeof data === 'object') {
    if (isCompactMap(data)) {
      const entries: [string, any][] = [];
      for (const [k, v] of data) {
        entries.push([String(makeJsonSafe(k)), makeJsonSafe(v)]);
      }
      return Object.fromEntries(entries);
    }
    return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, makeJsonSafe(v)]));
  }
  return data;
}

// declare module "@effectstream/sm" {
//   interface PrimitiveGlobalDefinitions {
//     MidnightGenericPrimitive: typeof MidnightGenericPrimitive;
//   }
// }
