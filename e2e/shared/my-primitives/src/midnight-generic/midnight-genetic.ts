import { PaimaPrimitive } from "@paima/sm";
import type { MidnightAddress, PaimaBlockNumber } from "@paima/utils";
import { type StaticDecode, Type } from "@sinclair/typebox";
import {
  type CommandTuple,
  generateRawStmInput,
  type ParamToData,
} from "@paima/concise";
import type {
  ConfigSyncProtocolType,
  ProtocolPrimitiveMap,
} from "@paima/config";

export const midnightGenericGrammar = [
  [
    "payload",
    // As type is unknown, we use a recursive wrapper with a "payload" key.
    Type.Recursive((Self) =>
      Type.Union([
        Type.Object({
          tag: Type.Literal("null"),
        }),
        Type.Object({
          tag: Type.Literal("cell"),
          content: Self,
        }),
        Type.Object({
          tag: Type.Literal("array"),
          content: Type.Array(Self),
        }),
        Type.Object({
          tag: Type.Literal("map"),
          content: Type.Array(Type.Tuple([Type.Any(), Type.Any()])),
        }),
        Type.Object({
          value: Type.Array(Type.Record(Type.String(), Type.Number())),
          alignment: Type.Array(Self),
        }),
        Type.Object({
          tag: Type.Literal("atom"),
          value: Self,
        }),
        Type.Object({
          tag: Type.Literal("bytes"),
          length: Type.Number(),
        }),
      ])
    ),
  ],
] as const;

export class MidnightGenericPrimitive extends PaimaPrimitive<
  ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
  typeof midnightGenericGrammar
> {
  // Primitive defined
  readonly internalTypeName = "Midnight:Generic" as const;
  override readonly grammar = midnightGenericGrammar;

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
  }) {
    super(
      config.instanceName,
      config.startBlockHeight,
      config.contractAddress,
      config.stateMachinePrefix,
    );
  }

  override *getPayload(
    _: PaimaBlockNumber,
    primitiveTransactionData: { output: { payload: any } },
  ) {
    const payload = primitiveTransactionData.output.payload;
    try {
      const isBatched = false;
      const accountingPayload: ParamToData<typeof this.grammar> = { payload };
      // Value.Decode(
      //   this.grammar[0][1],
      //   payload,
      // );
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
    } as const;
  }
}
