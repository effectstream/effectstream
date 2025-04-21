import { createScheduledData } from "@paima/db";
import type { StateUpdateStream } from "@paima/coroutine";
import { BuiltinTransitions, generateRawStmInput } from "@paima/concise";
import {
  ConfigPrimitivePayloadType,
  ConfigPrimitiveType,
  ConfigSyncProtocolType,
  type FlattenSyncProtocolIOFor,
} from "@paima/config";

export default function* processMidnightContractStateSyncProtocolResponse(
  response: FlattenSyncProtocolIOFor<
    ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
    ConfigPrimitiveType.MidnightContractState,
    ConfigPrimitivePayloadType.Event
  >,
): StateUpdateStream<void> {
  const { scheduledPrefix } = response.input;
  const { payload } = response.output;

  const scheduledBlockHeight =
    response.output.syncProtocol.payload.mainchain.blockNumber;
  const scheduledInputData = generateRawStmInput(
    BuiltinTransitions[ConfigPrimitiveType.MidnightContractState]
      .scheduledPrefix,
    scheduledPrefix,
    { payload },
  );
  yield* createScheduledData(
    JSON.stringify(scheduledInputData),
    { blockHeight: scheduledBlockHeight },
    {
      primitiveName: response.output.syncProtocol.payload.primitiveName,
      txHash: response.output.syncProtocol.payload.transactionHash,
      caip2: response.output.syncProtocol.payload.caip2,
      fromAddress: "", // TODO: Midnight indexer doesn't serve this.
      contractAddress: response.input.contractAddress,
    },
  );
}
