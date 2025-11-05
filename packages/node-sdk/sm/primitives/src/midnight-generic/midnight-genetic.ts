import { PaimaPrimitive } from "@effectstream/sm";
import {
  type AddressAndType,
  AddressType,
  type MidnightAddress,
  type PaimaBlockNumber,
} from "@effectstream/utils";
import type { StaticDecode } from "@sinclair/typebox";
import {
  type CommandTuple,
  generateRawStmInput,
  type ParamToData,
} from "@effectstream/concise";
import type {
  ConfigSyncProtocolType,
  EncodedStateValue,
  FlattenSyncProtocolIOFor,
  ProtocolPrimitiveMap,
} from "@effectstream/config";
import type { SyncStateUpdateStream } from "@effectstream/coroutine";
import { PrimitiveTypeMidnightGeneric } from "../builtin.ts";
import { midnightGenericGrammar } from "./midnight-genetic-grammar.ts"


export class MidnightGenericPrimitive extends PaimaPrimitive<
  ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
  typeof midnightGenericGrammar
> {
  // Primitive defined
  readonly internalTypeName = PrimitiveTypeMidnightGeneric;
  override readonly grammar = midnightGenericGrammar;
  readonly contractAddress: string;
  readonly contract: {
    ledger: (data: EncodedStateValue) => any;
  };
  readonly networkId: number;
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
      ledger: (data: EncodedStateValue) => any;
    }
    networkId?: number;
    genesisHash?: string;
  }) {
    super(config);
    this.contractAddress = config.contractAddress;
    this.contract = config.contract;
    this.networkId = config.networkId || 0;
    this.genesisHash = config.genesisHash || "";
  }

  override *getPayload(
    _: PaimaBlockNumber,
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
        payload,
      } as unknown as ParamToData<typeof this.grammar>;
     
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
      // TODO Using "NetworkId.Undeployed" generated issues in 
      // runtime with the onchain-runtime wasm.
      networkId: this.networkId || 0, 
      // TODO This is unused for now.
      genesisHash: this.genesisHash || "", 
    } as const;
  }
}

// declare module "@effectstream/sm" {
//   interface PrimitiveGlobalDefinitions {
//     MidnightGenericPrimitive: typeof MidnightGenericPrimitive;
//   }
// }
