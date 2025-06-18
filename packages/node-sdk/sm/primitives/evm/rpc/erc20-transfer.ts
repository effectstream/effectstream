import {
  ConfigPrimitiveAccountingPayloadType,
  type ConfigPrimitivePayloadType,
  ConfigPrimitiveType,
  type ConfigSyncProtocolType,
  type FlattenSyncProtocolIOFor,
  type PayloadOf,
  type PrimitiveEvmRpcErc20TransferAccounting,
} from "@paima/config";
import { World } from "@paima/coroutine";
import type { StateUpdateStream } from "@paima/coroutine";
import type { BlockNumber } from "@paima/utils";
import {
  createScheduledData,
  insertPrimitiveAccounting,
} from "../../../../db/src/mod.ts";
import { BuiltinTransitions, generateRawStmInput } from "@paima/concise";
import { getScheduleBlockHeight } from "../../utils.ts";

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

  const payload = {
    from: response.output.payload.from,
    to: response.output.payload.to,
    value: response.output.payload.value.toString(),
  };

  const scheduledInputData = generateRawStmInput(
    BuiltinTransitions[ConfigPrimitiveType.EvmRpcERC20].transferScheduledPrefix,
    prefix,
    payload,
  );

  yield* createScheduledData(
    JSON.stringify(scheduledInputData),
    {
      blockHeight: getScheduleBlockHeight(
        response.output.syncProtocol.payload,
        paima_block_height,
      ),
    },
    {
      primitiveName: response.output.syncProtocol.payload.primitiveName,
      txHash: response.output.syncProtocol.payload.transactionHash,
      caip2: response.output.syncProtocol.payload.caip2,
      fromAddress: response.output.payload.from,
      contractAddress: response.input.contractAddress.toLowerCase(),
    },
  );

  yield* World.resolve(insertPrimitiveAccounting, {
    primitive_name: primitiveName,
    paima_block_height: paima_block_height,
    payload_type: ConfigPrimitiveAccountingPayloadType.Transfer,
    payload: payload satisfies PayloadOf<
      typeof PrimitiveEvmRpcErc20TransferAccounting
    >,
  });
}
