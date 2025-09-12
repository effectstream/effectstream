import { createScheduledData, insertPrimitiveAccounting } from "@paima/db";
import { BuiltinTransitions, generateRawStmInput } from "@paima/concise";
import {
  ConfigPrimitiveAccountingPayloadType,
  type ConfigPrimitivePayloadType,
  ConfigPrimitiveType,
  type ConfigSyncProtocolType,
  type FlattenSyncProtocolIOFor,
} from "@paima/config";
import { type StateUpdateStream, World } from "@paima/coroutine";

import type { PaimaBlockNumber } from "@paima/utils";

export default function* processAvailPaimaL2Datum(
  paima_block_height: PaimaBlockNumber,
  response: FlattenSyncProtocolIOFor<
    ConfigSyncProtocolType.AVAIL_PARALLEL,
    ConfigPrimitiveType.AvailPaimaL2,
    ConfigPrimitivePayloadType.Event
  >,
): StateUpdateStream<void> {
  const { scheduledPrefix, contractAddress } = response.input;
  const { payload, syncProtocol } = response.output;
  const scheduledInputData = generateRawStmInput(
    BuiltinTransitions[ConfigPrimitiveType.AvailPaimaL2]
      .scheduledPrefix,
    scheduledPrefix,
    { payload },
  );
  yield* World.resolve(insertPrimitiveAccounting, {
    primitive_name: syncProtocol.payload.primitiveName,
    paima_block_height: paima_block_height,
    payload_type: ConfigPrimitiveAccountingPayloadType.Event,
    payload: JSON.stringify(payload) as any,
  });
  if (scheduledPrefix) {
    yield* createScheduledData(
      JSON.stringify(scheduledInputData),
      {
        blockHeight: paima_block_height,
      },
      {
        primitiveName: syncProtocol.payload.primitiveName,
        txHash: syncProtocol.internal.transactionHash,
        caip2: syncProtocol.payload.caip2,
        fromAddress: contractAddress,
        contractAddress: contractAddress,
      },
    );
  }
}
