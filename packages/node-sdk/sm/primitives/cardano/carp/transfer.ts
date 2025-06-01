import { createScheduledData, insertPrimitiveAccounting } from "@paima/db";
import type { StateUpdateStream } from "@paima/coroutine";
import { World } from "@paima/coroutine";
import type {
  ConfigPrimitivePayloadType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  PayloadOf,
  PrimitiveCardanoCarpTransferAccounting,
} from "@paima/config";
import {
  BuiltinTransitions,
  CardanoCarpTransferPrecompile,
  generateRawStmInput,
} from "@paima/concise";
import {
  ConfigPrimitiveAccountingPayloadType,
  ConfigPrimitiveType,
} from "@paima/config";
import type { BlockNumber } from "@paima/utils";
import { getScheduleBlockHeight } from "../../utils.ts";

export default function* processCardanoTransferSyncProtocolResponse(
  paima_block_height: BlockNumber,
  response: FlattenSyncProtocolIOFor<
    ConfigSyncProtocolType.CARDANO_CARP_PARALLEL,
    ConfigPrimitiveType.CardanoCarpTransfer,
    ConfigPrimitivePayloadType.Transfer
  >,
): StateUpdateStream<void> {
  const primitiveName = response.output.syncProtocol.payload.primitiveName;
  const prefix = response.input.scheduledPrefix;
  const txId = response.output.payload.txId;
  const rawTx = response.output.payload.rawTx;
  const inputCredentials = response.output.payload.inputCredentials;
  const outputs = response.output.payload.outputs;
  const metadata = response.output.payload.metadata;

  if (prefix != null) {
    const scheduledInputData = generateRawStmInput(
      BuiltinTransitions[ConfigPrimitiveType.CardanoCarpTransfer]
        .scheduledPrefix,
      prefix,
      {
        txId,
        rawTx,
        inputCredentials,
        outputs,
        metadata,
      },
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
        txHash: response.output.syncProtocol.payload
          .transactionHash as string,
        caip2: response.output.syncProtocol.payload.caip2,
        // TODO: a metadata standard could be used to refine this to something better
        fromAddress: CardanoCarpTransferPrecompile,
        contractAddress: undefined,
      },
    );
  }

  yield* World.resolve(insertPrimitiveAccounting, {
    primitive_name: primitiveName,
    paima_block_height: paima_block_height,
    payload_type: ConfigPrimitiveAccountingPayloadType.Transfer,
    payload: response.output.payload satisfies PayloadOf<
      typeof PrimitiveCardanoCarpTransferAccounting
    >,
  });
}
