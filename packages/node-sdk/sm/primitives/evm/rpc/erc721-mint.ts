import type {
  ConfigPrimitivePayloadType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
} from "@paima/config";
import { createScheduledData } from "@paima/db";
import type { StateUpdateStream } from "@paima/coroutine";
import { BuiltinTransitions, generateRawStmInput } from "@paima/concise";
import { ConfigPrimitiveType } from "@paima/config";

export default function* processErc721SyncProtocolResponse(
  response: FlattenSyncProtocolIOFor<
    | ConfigSyncProtocolType.EVM_RPC_MAIN
    | ConfigSyncProtocolType.EVM_RPC_PARALLEL,
    ConfigPrimitiveType.EvmRpcERC721,
    ConfigPrimitivePayloadType.Mint
  >,
): StateUpdateStream<void> {
  const [_address, prefix] = [
    response.input.contractAddress,
    response.input.scheduledPrefix,
  ];
  if (!prefix) {
    return;
  }
  const { tokenId, mintData } = response.output.payload;
  const scheduledBlockHeight =
    response.output.syncProtocol.payload.mainchain.blockNumber;
  const scheduledInputData = generateRawStmInput(
    BuiltinTransitions[ConfigPrimitiveType.EvmRpcERC721].mintScheduledPrefix,
    prefix,
    {
      from: response.output.payload.from,
      tokenId,
      mintData,
    },
  );
  yield* createScheduledData(
    JSON.stringify(scheduledInputData),
    { blockHeight: scheduledBlockHeight },
    {
      primitiveName: response.output.syncProtocol.payload.primitiveName,
      txHash: response.output.syncProtocol.payload.transactionHash,
      caip2: response.output.syncProtocol.payload.caip2,
      fromAddress: response.output.payload.from,
      contractAddress: response.input.contractAddress.toLowerCase(),
    },
  );
}
