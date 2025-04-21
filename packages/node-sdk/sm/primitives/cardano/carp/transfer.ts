import { SCHEDULED_DATA_ADDRESS } from "@paima/utils";
import { createScheduledData, primitiveCardanoTransferInsert } from "@paima/db";
import type { StateUpdateStream } from "@paima/coroutine";
import { World } from "@paima/coroutine";
import type {
  ConfigPrimitivePayloadType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
} from "@paima/config";
import { BuiltinTransitions, generateRawStmInput } from "@paima/concise";
import { ConfigPrimitiveType } from "@paima/config";

export default function* processCardanoTransferSyncProtocolResponse(
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

  const scheduledBlockHeight =
    response.output.syncProtocol.payload.mainchain.blockNumber;

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
      { blockHeight: scheduledBlockHeight },
      {
        primitiveName: response.output.syncProtocol.payload.primitiveName,
        txHash: response.output.syncProtocol.payload.transactionHash,
        caip2: response.output.syncProtocol.payload.caip2,
        // TODO: this could either be inputCredentials.join(), a built-in precompile or a metadata standard
        fromAddress: SCHEDULED_DATA_ADDRESS,
        contractAddress: undefined,
      },
    );
  }

  yield* World.resolve(primitiveCardanoTransferInsert, {
    primitive_name: primitiveName,
    tx_id: txId,
    raw_tx: rawTx,
    metadata: metadata,
  });
}
