import type { BlockNumber } from "@paima/utils";
import { createScheduledData, insertPrimitiveAccounting } from "@paima/db";
import type { StateUpdateStream } from "@paima/coroutine";
import { World } from "@paima/coroutine";
import type {
  ConfigPrimitivePayloadType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  PayloadOf,
  PrimitiveCardanoCarpMintOrBurnAccounting,
} from "@paima/config";
import {
  BuiltinTransitions,
  CardanoCarpMintBurnPrecompile,
  generateRawStmInput,
} from "@paima/concise";
import {
  ConfigPrimitiveAccountingPayloadType,
  ConfigPrimitiveType,
} from "@paima/config";
import { getScheduleBlockHeight } from "../../utils.ts";

export default function* processCardanoMintBurnSyncProtocolResponse(
  paima_block_height: BlockNumber,
  response: FlattenSyncProtocolIOFor<
    ConfigSyncProtocolType.CARDANO_CARP_PARALLEL,
    ConfigPrimitiveType.CardanoCarpMintBurn,
    ConfigPrimitivePayloadType.MintOrBurn
  >,
): StateUpdateStream<void> {
  const primitiveName = response.output.syncProtocol.payload.primitiveName;
  const prefix = response.input.scheduledPrefix;
  const txId = response.output.payload.txId;
  const assets = response.output.payload.assets;
  const metadata = response.output.payload.metadata;
  const inputAddresses = response.output.payload.inputAddresses;
  const outputAddresses = response.output.payload.outputAddresses;

  if (prefix != null) {
    const scheduledInputData = generateRawStmInput(
      BuiltinTransitions[ConfigPrimitiveType.CardanoCarpMintBurn]
        .scheduledPrefix,
      prefix,
      {
        txId,
        metadata,
        assets,
        inputAddresses,
        outputAddresses,
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
        fromAddress: CardanoCarpMintBurnPrecompile,
        contractAddress: undefined,
      },
    );
  }

  // TODO: register a current supply ivm

  yield* World.resolve(insertPrimitiveAccounting, {
    primitive_name: primitiveName,
    paima_block_height: paima_block_height,
    payload_type: ConfigPrimitiveAccountingPayloadType.MintOrBurn,
    payload: response.output.payload satisfies PayloadOf<
      typeof PrimitiveCardanoCarpMintOrBurnAccounting
    >,
  });
}
