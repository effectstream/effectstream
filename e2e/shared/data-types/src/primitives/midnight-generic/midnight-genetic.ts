import {
  ConfigPrimitiveAccountingPayloadType,
  ConfigPrimitiveType,
} from "@paima/config";
import { PaimaPrimitive } from "../PaimaPrimitive.ts";
import type { MidnightAddress } from "@paima/utils";
import { type StaticDecode, type TSchema, Type } from "@sinclair/typebox";
import { type CommandTuple, generateRawStmInput, ParamToData } from "@paima/concise";
import { PaimaPrimitiveRegistry } from "../PrimitiveRegistry.ts";
import { Value } from "@sinclair/typebox/value";

export class MidnightGenericPrimitive extends PaimaPrimitive {
  // Instance defined
  override readonly instanceName: string;
  override readonly startBlockHeight: number;
  override readonly contractAddress: string; // How are midnight contracts addresses?
  // TODO This should be optional.
  override readonly stateMachinePrefix: string;

  // Primitive defined
  readonly internalName = "Midnight:Generic" as const;
  readonly internalType = ConfigPrimitiveType.MidnightContractState as const;
  readonly internalEvent = ConfigPrimitiveAccountingPayloadType.Event as const;

  override readonly grammar: readonly Readonly<[string, TSchema]>[] = [
    [
      "payload",
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
            value: Type.Array(Type.Object({})),
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
    super();
    this.instanceName = config.instanceName;
    this.startBlockHeight = config.startBlockHeight;
    this.contractAddress = config.contractAddress;
    this.stateMachinePrefix = config.stateMachinePrefix;
    PaimaPrimitiveRegistry.addPrimitive(this);
  }

  override getStateMachinePayload(primitiveTransactionData: any): StaticDecode<
    CommandTuple<
      typeof this.stateMachinePrefix,
      typeof this.grammar
    >
  > {
    return generateRawStmInput(
      this.grammar,
      this.stateMachinePrefix,
      this.getPayload(primitiveTransactionData),
    );
  }

  override getPayload(primitiveTransactionData: { output: { payload: any } }): 
    ParamToData<typeof this.grammar> {
    const { payload } = primitiveTransactionData.output;
    try {
      return {
        payload: Value.Decode(
          this.grammar[0][1],
          payload,
        ),
      };
    } catch (error) {
      // Midnight initial triggers tbe parsing of the payload.
      // {"tag":"array","content":[{"tag":"cell","content":{"value":[{}],"alignment":[{"tag":"atom","value":{"tag":"bytes","length":8}}]}}]}
      console.error("Error decoding payload:", JSON.stringify(payload));
      return { payload: {} };
    }
  }

  override getConfig() {
    return {
      name: this.instanceName,
      type: this.internalType,
      startBlockHeight: this.startBlockHeight,
      contractAddress: this.contractAddress,
      scheduledPrefix: this.stateMachinePrefix,
    } as const;
  }
}
