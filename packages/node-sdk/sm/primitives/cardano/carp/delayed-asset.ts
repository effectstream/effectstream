import { insertPrimitiveAccounting } from "@paima/db";
import type { StateUpdateStream } from "@paima/coroutine";
import { World } from "@paima/coroutine";
import {
  ConfigPrimitiveAccountingPayloadType,
  type ConfigPrimitivePayloadType,
  type ConfigPrimitiveType,
  type ConfigSyncProtocolType,
  type FlattenSyncProtocolIOFor,
  type PayloadOf,
  type PrimitiveCardanoCarpAssetUtxoAccounting,
} from "@paima/config";
import type { BlockNumber } from "@paima/utils";

export default function* processCardanoAssetUtxoSyncProtocolResponse(
  paima_block_height: BlockNumber,
  response: FlattenSyncProtocolIOFor<
    ConfigSyncProtocolType.CARDANO_CARP_PARALLEL,
    ConfigPrimitiveType.CardanoCarpDelayedAsset,
    ConfigPrimitivePayloadType.Transfer
  >,
): StateUpdateStream<void> {
  const primitiveName = response.output.syncProtocol.payload.primitiveName;

  // TODO: we should register indices for this
  // TODO: register a current balance ivm

  yield* World.resolve(insertPrimitiveAccounting, {
    primitive_name: primitiveName,
    paima_block_height: paima_block_height,
    payload_type: ConfigPrimitiveAccountingPayloadType.Transfer,
    payload: response.output.payload satisfies PayloadOf<
      typeof PrimitiveCardanoCarpAssetUtxoAccounting
    >,
  });
}
