import type { EvmAddress } from "@paima/utils";
import type {
  ConfigPrimitivePayloadType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  PayloadOf,
  PrimitiveEvmRpcErc1155TransferAccounting,
} from "@paima/config";
import { createScheduledData, insertPrimitiveAccounting } from "@paima/db";
import type { StateUpdateStream } from "@paima/coroutine";
import { World } from "@paima/coroutine";
import { BuiltinTransitions, generateRawStmInput } from "@paima/concise";
import {
  ConfigPrimitiveAccountingPayloadType,
  ConfigPrimitiveType,
} from "@paima/config";
import { getScheduleBlockHeight } from "../../utils.ts";
import type { BlockNumber } from "@paima/utils";

export default function* processErc1155TransferSyncProtocolResponse(
  paima_block_height: BlockNumber,
  response: FlattenSyncProtocolIOFor<
    | ConfigSyncProtocolType.EVM_RPC_MAIN
    | ConfigSyncProtocolType.EVM_RPC_PARALLEL,
    ConfigPrimitiveType.EvmRpcERC1155,
    ConfigPrimitivePayloadType.Transfer
  >,
): StateUpdateStream<void> {
  const primitiveName = response.output.syncProtocol.payload.primitiveName;
  const { operator, from, to, ids, values } = response.output.payload;
  const isBurn = /^0x0+(dead)?$/i.test(to);

  // Always schedule the plain old transfer event.
  if (response.input.scheduledPrefix) {
    const scheduledInputData = generateRawStmInput(
      BuiltinTransitions[ConfigPrimitiveType.EvmRpcERC1155].scheduledPrefix,
      response.input.scheduledPrefix,
      {
        operator,
        from: from.toLowerCase() as EvmAddress,
        to: to.toLowerCase() as EvmAddress,
        ids,
        values,
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
        txHash: response.output.syncProtocol.payload.transactionHash,
        caip2: response.output.syncProtocol.payload.caip2,
        fromAddress: from.toLowerCase(),
        contractAddress: response.input.contractAddress.toLowerCase(),
      },
    );
  }

  if (isBurn && response.input.burnScheduledPrefix) {
    const scheduledInputData = generateRawStmInput(
      BuiltinTransitions[ConfigPrimitiveType.EvmRpcERC1155].burnScheduledPrefix,
      response.input.burnScheduledPrefix,
      {
        operator,
        from: from.toLowerCase() as EvmAddress,
        // "to" is excluded because it's presumed 0
        ids,
        values,
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
        txHash: response.output.syncProtocol.payload.transactionHash,
        caip2: response.output.syncProtocol.payload.caip2,
        fromAddress: from.toLowerCase(),
        contractAddress: response.input.contractAddress.toLowerCase(),
      },
    );
  }

  // TODO: ivm to track balance

  yield* World.resolve(insertPrimitiveAccounting, {
    primitive_name: primitiveName,
    paima_block_height: paima_block_height,
    payload_type: ConfigPrimitiveAccountingPayloadType.Transfer,
    payload: response.output.payload satisfies PayloadOf<
      typeof PrimitiveEvmRpcErc1155TransferAccounting
    >,
  });
}
