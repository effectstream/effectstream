import {
  ConfigPrimitiveAccountingPayloadType,
  type ConfigPrimitivePayloadType,
  ConfigPrimitiveType,
  type ConfigSyncProtocolType,
  type FlattenSyncProtocolIOFor,
  type PayloadOf,
  type PrimitiveEvmRpcErc20TransferAccounting,
} from "@paima/config";
import { StateMachineExecution, World } from "@paima/coroutine";
import type { StateUpdateStream } from "@paima/coroutine";
import type { BlockNumber } from "@paima/utils";
import {
  createScheduledData,
  insertPrimitiveAccounting,
} from "../../../../db/src/mod.ts";
import { BuiltinTransitions, generateRawStmInput } from "@paima/concise";
import { clearBigInts, getScheduleBlockHeight } from "../../utils.ts";
import type { AppEvents, BaseStfInput, BaseStfOutput } from "../../../types.ts";

export default function* processErc20SyncProtocolResponse(
  paima_block_height: BlockNumber,
  response: FlattenSyncProtocolIOFor<
    | ConfigSyncProtocolType.EVM_RPC_MAIN
    | ConfigSyncProtocolType.EVM_RPC_PARALLEL,
    ConfigPrimitiveType.EvmRpcERC20,
    ConfigPrimitivePayloadType.Transfer
  >,
): StateUpdateStream<void> {
  const prefix = response.input.scheduledPrefix;
  if (!prefix) {
    return;
  }

  const primitiveName = response.output.syncProtocol.payload.primitiveName;

  // We cannot insert bigints into the database, or be serialized to JSON.
  // payload.value is a bigint
  const payload = clearBigInts(response.output.payload);

  yield* World.resolve(insertPrimitiveAccounting, {
    primitive_name: primitiveName,
    paima_block_height: paima_block_height,
    payload_type: ConfigPrimitiveAccountingPayloadType.Transfer,
    payload: payload satisfies PayloadOf<
      typeof PrimitiveEvmRpcErc20TransferAccounting
    >,
  });

  yield* StateMachineExecution(
    paima_block_height,
    JSON.stringify([prefix, payload]),
    undefined,
    undefined,
    response.output.syncProtocol.payload.ownChain.blockNumber,
    response.output.syncProtocol.payload.transactionHash,
  );
}
