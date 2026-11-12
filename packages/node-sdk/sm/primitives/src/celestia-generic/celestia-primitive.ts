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
 *
 * The accounting row in `effectstream.primitive_accounting` holds only a
 * reference to the blob, `{ payload: { namespace, commitment, blobIndex,
 * height } }`, unless `persistBody` is set. A namespace is permissionless, so a
 * stored body would let anyone grow the node's database without limit. The
 * state machine still receives the full body and keeps what it needs.
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
  /** Also store the blob body in the accounting row, as base64 `bodyBase64`. */
  readonly persistBody: boolean;

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    namespace: string;
    stateMachinePrefix: string | undefined;
    persistBody?: boolean;
  }) {
    super(config);
    this.namespace = config.namespace;
    this.stateMachinePrefix = config.stateMachinePrefix;
    this.persistBody = config.persistBody ?? false;
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

    // `height` is the Celestia block height, not the rollup block height, so
    // the row is the `blob.Get(height, namespace, commitment)` key and blobs
    // re-posted at different Celestia heights keep distinct rows.
    const reference = {
      namespace: payload.namespace,
      commitment: payload.commitment,
      blobIndex: payload.blobIndex,
      height: primitiveTransactionData.syncProtocol.blockNumber,
    };

    return {
      isBatched: false,
      data: [
        {
          fromAddressAndType: {
            type: AddressType.NONE,
            address: "0x0",
          },
          // `suppliedValue` is a binary string (one char per byte). Stored as
          // is, a 0x00 byte becomes `\u0000` in the `json` column, on which
          // Postgres JSON operators fail. Base64 cannot contain it and is the
          // encoding `blob.Get` returns.
          accountingPayload: {
            payload: this.persistBody
              ? { ...reference, bodyBase64: btoa(payload.suppliedValue) }
              : reference,
          },
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
      persistBody: this.persistBody,
    } as const;
  }
}
