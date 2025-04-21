import type {
  ConfigPrimitivePayloadType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
} from "@paima/config";
import {
  createScheduledData,
  primitiveCardanoProjectedNftInsertData,
  primitiveCardanoProjectedNftUpdateData,
} from "@paima/db";
import type { StateUpdateStream } from "@paima/coroutine";
import { World } from "@paima/coroutine";
import { BuiltinTransitions, generateRawStmInput } from "@paima/concise";
import { ConfigPrimitiveType } from "@paima/config";

export default function* processCardanoProjectedNftSyncProtocolResponse(
  response: FlattenSyncProtocolIOFor<
    ConfigSyncProtocolType.CARDANO_CARP_PARALLEL,
    ConfigPrimitiveType.CardanoCarpProjectedNFT,
    ConfigPrimitivePayloadType.Projection
  >,
): StateUpdateStream<void> {
  const primitiveName = response.output.syncProtocol.payload.primitiveName;
  const prefix = response.input.scheduledPrefix;
  const ownerAddress = response.output.payload.ownerAddress;
  const previousTxHash = response.output.payload.previousTxHash;
  const previousTxOutputIndex = response.output.payload.previousTxOutputIndex;
  const currentTxHash = response.output.payload.actionTxId;
  const currentOutputIndex = response.output.payload.actionOutputIndex;
  const amount = response.output.payload.amount;
  const policyId = response.output.payload.policyId;
  const assetName = response.output.payload.assetName;
  const status = response.output.payload.status;
  const datum = response.output.payload.plutusDatum;
  const forHowLong = response.output.payload.forHowLong;

  const scheduledBlockHeight =
    response.output.syncProtocol.payload.mainchain.blockNumber;

  if (prefix != null) {
    const scheduledInputData = generateRawStmInput(
      BuiltinTransitions[ConfigPrimitiveType.CardanoCarpProjectedNFT]
        .scheduledPrefix,
      prefix,
      {
        ownerAddress,
        previousTxHash,
        previousTxOutputIndex,
        policyId,
        assetName,
        amount,
        status,
        forHowLong,
        currentTxHash,
        currentOutputIndex,
      },
    );

    yield* createScheduledData(
      JSON.stringify(scheduledInputData),
      { blockHeight: scheduledBlockHeight },
      {
        primitiveName: response.output.syncProtocol.payload.primitiveName,
        txHash: response.output.syncProtocol.payload.transactionHash,
        caip2: response.output.syncProtocol.payload.caip2,
        fromAddress: ownerAddress,
        contractAddress: undefined, // TODO: we should be able to know this
      },
    );
  }

  if (previousTxHash === undefined || previousTxOutputIndex === undefined) {
    yield* World.resolve(primitiveCardanoProjectedNftInsertData, {
      primitive_name: primitiveName,
      owner_address: ownerAddress,
      current_tx_hash: currentTxHash,
      current_tx_output_index: currentOutputIndex,
      policy_id: policyId,
      asset_name: assetName,
      amount: amount,
      status: status,
      plutus_datum: datum,
      for_how_long: forHowLong,
    });
    return;
  }
  yield* World.resolve(primitiveCardanoProjectedNftUpdateData, {
    primitive_name: primitiveName,
    owner_address: ownerAddress,
    new_tx_hash: currentTxHash,
    new_tx_output_index: currentOutputIndex,
    previous_tx_hash: previousTxHash,
    previous_tx_output_index: previousTxOutputIndex,
    policy_id: policyId,
    asset_name: assetName,
    amount: amount,
    status: status,
    plutus_datum: datum,
    for_how_long: forHowLong,
  });
}
