import type {
  ConfigPrimitivePayloadType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  PayloadOf,
  PrimitiveEvmRpcErc721MintAccounting,
} from "@paima/config";
import { createScheduledData, insertPrimitiveAccounting } from "@paima/db";
import {
  StateMachineExecution,
  type StateUpdateStream,
  World,
} from "@paima/coroutine";
import { BuiltinTransitions, generateRawStmInput } from "@paima/concise";
import {
  ConfigPrimitiveAccountingPayloadType,
  ConfigPrimitiveType,
} from "@paima/config";
import type { BlockNumber } from "@paima/utils";
import { getScheduleBlockHeight } from "../../utils.ts";

export default function* processErc721SyncProtocolResponse(
  paima_block_height: BlockNumber,
  response: FlattenSyncProtocolIOFor<
    | ConfigSyncProtocolType.EVM_RPC_MAIN
    | ConfigSyncProtocolType.EVM_RPC_PARALLEL,
    ConfigPrimitiveType.EvmRpcERC721,
    ConfigPrimitivePayloadType.Mint
  >,
): StateUpdateStream<void> {
  const primitiveName = response.output.syncProtocol.payload.primitiveName;
  const [_address, prefix] = [
    response.input.contractAddress,
    response.input.scheduledPrefix,
  ];
  if (!prefix) {
    return;
  }
  const { tokenId, mintData } = response.output.payload;
  const scheduledInputData = generateRawStmInput(
    BuiltinTransitions[ConfigPrimitiveType.EvmRpcERC721].mintScheduledPrefix,
    prefix,
    {
      from: response.output.payload.from,
      tokenId,
      mintData,
    },
  );
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
  //     fromAddress: response.output.payload.from,
  //     contractAddress: response.input.contractAddress.toLowerCase(),
  //   },
  // );

  yield* StateMachineExecution(
    paima_block_height,
    JSON.stringify([prefix, response.output.payload]),
    undefined,
    undefined,
    response.output.syncProtocol.payload.ownChain.blockNumber,
    response.output.syncProtocol.payload.transactionHash,
  );

  yield* World.resolve(insertPrimitiveAccounting, {
    primitive_name: primitiveName,
    paima_block_height: paima_block_height,
    payload_type: ConfigPrimitiveAccountingPayloadType.MintOrBurn,
    payload: response.output.payload satisfies PayloadOf<
      typeof PrimitiveEvmRpcErc721MintAccounting
    >,
  });
}
