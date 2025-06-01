import {
  ConfigPrimitiveAccountingPayloadType,
  type ConfigPrimitivePayloadType,
  type ConfigPrimitiveType,
  type ConfigSyncProtocolType,
  type FlattenSyncProtocolIOFor,
  type PayloadOf,
  type PrimitiveEvmRpcErc6551RegistryAccounting,
} from "@paima/config";
import type { StateUpdateStream } from "@paima/coroutine";
import { World } from "@paima/coroutine";
import { insertPrimitiveAccounting } from "@paima/db";
import type { BlockNumber } from "@paima/utils";

export default function* processErc6551SyncProtocolResponse(
  paima_block_height: BlockNumber,
  response: FlattenSyncProtocolIOFor<
    | ConfigSyncProtocolType.EVM_RPC_MAIN
    | ConfigSyncProtocolType.EVM_RPC_PARALLEL,
    ConfigPrimitiveType.EvmRpcERC6551Registry,
    ConfigPrimitivePayloadType.Registry
  >,
): StateUpdateStream<void> {
  const primitiveName = response.output.syncProtocol.payload.primitiveName;
  yield* World.resolve(insertPrimitiveAccounting, {
    primitive_name: primitiveName,
    paima_block_height: paima_block_height,
    payload_type: ConfigPrimitiveAccountingPayloadType.Transfer,
    payload: response.output.payload satisfies PayloadOf<
      typeof PrimitiveEvmRpcErc6551RegistryAccounting
    >,
  });
}
