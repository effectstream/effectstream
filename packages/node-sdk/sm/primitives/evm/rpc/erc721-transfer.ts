import type {
  ConfigPrimitivePayloadType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  PayloadOf,
  PrimitiveEvmRpcErc721TransferAccounting,
} from "@paima/config";
import { createScheduledData, insertPrimitiveAccounting } from "@paima/db";
import type { StateUpdateStream } from "@paima/coroutine";
import { StateMachineExecution, World } from "@paima/coroutine";
import { BuiltinTransitions, generateRawStmInput } from "@paima/concise";
import {
  ConfigPrimitiveAccountingPayloadType,
  ConfigPrimitiveType,
} from "@paima/config";
import { clearBigInts, getScheduleBlockHeight } from "../../utils.ts";
import type { BlockNumber } from "@paima/utils";

export default function* processErc721SyncProtocolResponse(
  paima_block_height: BlockNumber,
  response: FlattenSyncProtocolIOFor<
    | ConfigSyncProtocolType.EVM_RPC_MAIN
    | ConfigSyncProtocolType.EVM_RPC_PARALLEL,
    ConfigPrimitiveType.EvmRpcERC721,
    ConfigPrimitivePayloadType.Transfer
  >,
): StateUpdateStream<void> {
  const primitiveName = response.output.syncProtocol.payload.primitiveName;
  const { to } = response.output.payload;
  const toAddr = to.toLowerCase();
  const isBurn = Boolean(toAddr.toLocaleLowerCase().match(/^0x0+(dead)?$/g));
  const payload = clearBigInts({ ...response.output.payload, isBurn });

  // TODO: ivm to track owner

  const prefix = response.input.scheduledPrefix;
  if (!prefix) {
    yield* StateMachineExecution(
      paima_block_height,
      JSON.stringify([prefix, payload]),
      undefined,
      undefined,
      response.output.syncProtocol.payload.ownChain.blockNumber,
      response.output.syncProtocol.payload.transactionHash,
    );
  }

  // if (isBurn) {
  //   if (response.input.burnScheduledPrefix) {
  // const scheduledInputData = generateRawStmInput(
  //   BuiltinTransitions[ConfigPrimitiveType.EvmRpcERC721]
  //     .burnScheduledPrefix,
  //   response.input.burnScheduledPrefix,
  //   {
  //     owner: from,
  //     tokenId,
  //   },
  // );

  // yield* createScheduledData(
  //   JSON.stringify(scheduledInputData),
  //   {
  //     blockHeight: getScheduleBlockHeight(
  //       response.output.syncProtocol.payload,
  //       paima_block_height,
  //     ),
  //   },
  //   {
  //     primitiveName: response.output.syncProtocol.payload.primitiveName,
  //     txHash: response.output.syncProtocol.payload.transactionHash,
  //     caip2: response.output.syncProtocol.payload.caip2,
  //     fromAddress: from.toLowerCase(),
  //     contractAddress: response.input.contractAddress.toLowerCase(),
  //   },
  // );
  //   }
  // }

  yield* World.resolve(insertPrimitiveAccounting, {
    primitive_name: primitiveName,
    paima_block_height: paima_block_height,
    payload_type: ConfigPrimitiveAccountingPayloadType.Transfer,
    payload: payload satisfies PayloadOf<
      typeof PrimitiveEvmRpcErc721TransferAccounting
    >,
  });
}
