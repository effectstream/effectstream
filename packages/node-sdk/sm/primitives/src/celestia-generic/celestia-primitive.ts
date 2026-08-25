import { Primitive } from "../../Primitive.ts";
import type { JsonObject } from "../../types.ts";
import type { StaticDecode } from "@sinclair/typebox";
import { type CommandTuple, generateRawStmInput } from "@effectstream/concise";
import type {
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  ProtocolPrimitiveMap,
} from "@effectstream/config";
import type { StateUpdateStream } from "@effectstream/coroutine";
import {
  type AddressAndType,
  AddressType,
  type EffectstreamBlockNumber,
} from "@effectstream/utils";
import { celestiaGenericGrammar } from "./celestia-generic-grammar.ts";
import { PrimitiveTypeCelestiaGeneric } from "../builtin.ts";

/**
 * Celestia Generic Primitive
 *
 * Watches a Celestia namespace for Data Availability blobs and feeds
 * the decoded blob content into the state machine as a scheduled input.
 */
export class CelestiaGenericPrimitive extends Primitive<
  ConfigSyncProtocolType.CELESTIA_PARALLEL,
  typeof celestiaGenericGrammar
> {
  readonly internalTypeName = PrimitiveTypeCelestiaGeneric;
  override grammar = celestiaGenericGrammar;
  /** Hex-encoded Celestia namespace to watch (e.g. "000000000000deadbeef") */
  readonly namespace: string;
  override readonly stateMachinePrefix: string | undefined;

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    namespace: string;
    stateMachinePrefix: string | undefined;
  }) {
    super(config);
    this.namespace = config.namespace;
    this.stateMachinePrefix = config.stateMachinePrefix;
  }

  override *getPayload(
    _: EffectstreamBlockNumber,
    primitiveTransactionData: FlattenSyncProtocolIOFor<
      ConfigSyncProtocolType.CELESTIA_PARALLEL
    >,
  ): StateUpdateStream<{
    isBatched: boolean;
    data: {
      fromAddressAndType: AddressAndType;
      stateMachinePayload:
        | StaticDecode<
          CommandTuple<string, typeof celestiaGenericGrammar>
        >
        | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const { payload } = primitiveTransactionData.output;
    const scheduledInputData = this.stateMachinePrefix
      ? generateRawStmInput(
        this.grammar,
        this.stateMachinePrefix,
        { payload },
      )
      : null;

    return {
      isBatched: false,
      data: [
        {
          fromAddressAndType: {
            type: AddressType.NONE,
            address: "0x0",
          },
          accountingPayload: { payload },
          stateMachinePayload: scheduledInputData,
        },
      ],
    };
  }

  override getConfig(): ProtocolPrimitiveMap[
    ConfigSyncProtocolType.CELESTIA_PARALLEL
  ] {
    return {
      name: this.instanceName,
      type: this.internalTypeName,
      startBlockHeight: this.startBlockHeight,
      scheduledPrefix: this.stateMachinePrefix,
      namespace: this.namespace,
    } as const;
  }
}
