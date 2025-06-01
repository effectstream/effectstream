import {
  ConfigPrimitiveAccountingPayloadType,
  type ConfigPrimitivePayloadType,
  type ConfigPrimitiveType,
  type ConfigSyncProtocolType,
  type FlattenSyncProtocolIOFor,
  type PayloadOf,
  type PrimitiveEvmRpcErc20TransferAccounting,
} from "@paima/config";
import { World } from "@paima/coroutine";
import type { StateUpdateStream } from "@paima/coroutine";
import type { BlockNumber } from "@paima/utils";
import { insertPrimitiveAccounting } from "../../../../db/src/mod.ts";

export default function* processErc20SyncProtocolResponse(
  paima_block_height: BlockNumber,
  response: FlattenSyncProtocolIOFor<
    | ConfigSyncProtocolType.EVM_RPC_MAIN
    | ConfigSyncProtocolType.EVM_RPC_PARALLEL,
    ConfigPrimitiveType.EvmRpcERC20,
    ConfigPrimitivePayloadType.Transfer
  >,
): StateUpdateStream<void> {
  const primitiveName = response.output.syncProtocol.payload.primitiveName;

  // TODO: register a current balance ivm
  // TODO: register indicies

  // TODO: register a createScheduledData to listen to transfers?

  yield* World.resolve(insertPrimitiveAccounting, {
    primitive_name: primitiveName,
    paima_block_height: paima_block_height,
    payload_type: ConfigPrimitiveAccountingPayloadType.Transfer,
    payload: response.output.payload satisfies PayloadOf<
      typeof PrimitiveEvmRpcErc20TransferAccounting
    >,
  });
}
