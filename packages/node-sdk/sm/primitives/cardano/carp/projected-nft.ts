import type {
  ConfigPrimitivePayloadType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  PayloadOf,
  PrimitiveCardanoCarpProjectedNFTAccounting,
} from "@paima/config";
import type { BlockNumber } from "@paima/utils";
import { createScheduledData, insertPrimitiveAccounting } from "@paima/db";
import type { StateUpdateStream } from "@paima/coroutine";
import { World } from "@paima/coroutine";
import { BuiltinTransitions, generateRawStmInput } from "@paima/concise";
import {
  ConfigPrimitiveAccountingPayloadType,
  ConfigPrimitiveType,
} from "@paima/config";
import { getScheduleBlockHeight } from "../../utils.ts";

export default function* processCardanoProjectedNftSyncProtocolResponse(
  paima_block_height: BlockNumber,
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
  const forHowLong = response.output.payload.forHowLong;

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
        // TODO: include datum?
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
        fromAddress: ownerAddress,
        contractAddress: undefined, // TODO: we should be able to know this
      },
    );
  }

  yield* World.resolve(insertPrimitiveAccounting, {
    primitive_name: primitiveName,
    paima_block_height: paima_block_height,
    payload_type: ConfigPrimitiveAccountingPayloadType.ProjectedNft,
    payload: response.output.payload satisfies PayloadOf<
      typeof PrimitiveCardanoCarpProjectedNFTAccounting
    >,
  });
}
