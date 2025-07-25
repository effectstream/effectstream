import { createScheduledData, insertPrimitiveAccounting } from "@paima/db";
import { type StateUpdateStream, World } from "@paima/coroutine";
import { BuiltinTransitions, generateRawStmInput } from "@paima/concise";
import {
  ConfigPrimitiveAccountingPayloadType,
  type ConfigPrimitivePayloadType,
  ConfigPrimitiveType,
  type ConfigSyncProtocolType,
  type FlattenSyncProtocolIOFor,
  type PayloadOf,
  type PrimitiveMidnightGraphqlContractStateAccounting,
} from "@paima/config";
import type { BlockNumber } from "@paima/utils";
import { getScheduleBlockHeight } from "../utils.ts";

export default function* processMidnightContractStateSyncProtocolResponse(
  paima_block_height: BlockNumber,
  response: FlattenSyncProtocolIOFor<
    ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
    ConfigPrimitiveType.MidnightContractState,
    ConfigPrimitivePayloadType.Event
  >,
): StateUpdateStream<void> {
  const { scheduledPrefix } = response.input;
  const { payload } = response.output;

  const scheduledInputData = generateRawStmInput(
    BuiltinTransitions[ConfigPrimitiveType.MidnightContractState]
      .scheduledPrefix,
    scheduledPrefix,
    { payload },
  );
  yield* World.resolve(insertPrimitiveAccounting, {
    primitive_name: response.output.syncProtocol.payload.primitiveName,
    paima_block_height: paima_block_height,
    payload_type: ConfigPrimitiveAccountingPayloadType.Event,
    payload: JSON.stringify(response.output.payload) as any,
  });
  if (scheduledPrefix) {
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
        fromAddress: "", // TODO: Midnight indexer doesn't serve this.
        contractAddress: response.input.contractAddress,
      },
    );
  }
}
