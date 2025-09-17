import {
  ConfigPrimitiveAccountingPayloadType,
  // ConfigPrimitiveType,
} from "@paima/config";
import { PaimaPrimitive } from "../PaimaPrimitive.ts";
import type { MidnightAddress } from "@paima/utils";
import { type StaticDecode, type TSchema, Type } from "@sinclair/typebox";
import { type CommandTuple, generateRawStmInput, type ParamToData } from "@paima/concise";

export const midnightGenericGrammar /* : readonly Readonly<[string, TSchema]>[] */ = [
  [
    "payload",
    // As type is unknown, we use a recursive wrapper with a "payload" key.
    Type.Recursive((Self) =>
      Type.Union([
        Type.Object({
          tag: Type.Literal('null'),
        }),
        Type.Object({
          tag: Type.Literal('cell'),
          content: Self,
        }),
        Type.Object({
          tag: Type.Literal('array'),
          content: Type.Array(Self),
        }),
        Type.Object({
          tag: Type.Literal('map'),
          content: Type.Array(Type.Tuple([Type.Any(), Type.Any()])),
        }),
        Type.Object({
          value: Type.Array(Type.Record(Type.String(), Type.Number())),
          alignment: Type.Array(Self),
        }),
        Type.Object({
          tag: Type.Literal('atom'),
          value: Self,
        }),
        Type.Object({
          tag: Type.Literal('bytes'),
          length: Type.Number(),
        }),
      ])
    )
  ],
] as const;

export class MidnightGenericPrimitive extends PaimaPrimitive<typeof midnightGenericGrammar> {
  // Primitive defined
  readonly internalName = "Midnight:Generic" as const;
  readonly internalType = "midnight-contract-state" as any; // ConfigPrimitiveType.MidnightContractState as const;
  readonly internalEvent = ConfigPrimitiveAccountingPayloadType.Event as const;
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

  override getStateMachinePayload(primitiveTransactionData: any): StaticDecode<
    CommandTuple<
      string,
      typeof this.grammar
    >
  > {
    if (!this.stateMachinePrefix) {
      throw new Error("State machine prefix is not set");
    }
    
    return generateRawStmInput(
      this.grammar,
      this.stateMachinePrefix,
      this.getPayload(primitiveTransactionData),
    );
  }

  override getPayload(primitiveTransactionData: { output: { payload: any } }): 
    ParamToData<typeof this.grammar> {
    const payload = primitiveTransactionData.output.payload
    try {
      return {
        payload: payload,
        // payload: Value.Decode(
        //   this.grammar[0][1],
        //   payload,
        // ),
      };
    } catch (error) {
      console.error("[ERROR] Decoding Midnight Generic Payload:", JSON.stringify(payload));
      throw error;
    }
  }

  override getConfig() {
    return {
      name: this.instanceName,
      type: this.internalType,
      startBlockHeight: this.startBlockHeight,
      contractAddress: this.contractAddress,
      // TODO This should be optional
      scheduledPrefix: this.stateMachinePrefix ?? '',
    } as const;
  }
}
