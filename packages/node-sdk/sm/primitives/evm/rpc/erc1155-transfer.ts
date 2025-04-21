import { type EvmAddress } from "@paima/utils";
import type {
  ConfigPrimitivePayloadType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
} from "@paima/config";
import {
  createScheduledData,
  primitiveErc1155Burn,
  primitiveErc1155DeleteIfZero,
  primitiveErc1155ModifyBalance,
} from "@paima/db";
import type { StateUpdateStream } from "@paima/coroutine";
import { World } from "@paima/coroutine";
import { BuiltinTransitions, generateRawStmInput } from "@paima/concise";
import { ConfigPrimitiveType } from "@paima/config";

export default function* processErc1155TransferSyncProtocolResponse(
  response: FlattenSyncProtocolIOFor<
    | ConfigSyncProtocolType.EVM_RPC_MAIN
    | ConfigSyncProtocolType.EVM_RPC_PARALLEL,
    ConfigPrimitiveType.EvmRpcERC1155,
    ConfigPrimitivePayloadType.Transfer
  >,
): StateUpdateStream<void> {
  const { operator, from, to, ids, values } = response.output.payload;
  const isMint = from == "0x0000000000000000000000000000000000000000";
  const isBurn = /^0x0+(dead)?$/i.test(to);

  // Always schedule the plain old transfer event.
  const scheduledBlockHeight =
    response.output.syncProtocol.payload.mainchain.blockNumber;
  if (response.input.scheduledPrefix) {
    const scheduledInputData = generateRawStmInput(
      BuiltinTransitions[ConfigPrimitiveType.ERC1155].scheduledPrefix,
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
      { blockHeight: scheduledBlockHeight },
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
      BuiltinTransitions[ConfigPrimitiveType.ERC1155].burnScheduledPrefix,
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
      { blockHeight: scheduledBlockHeight },
      {
        primitiveName: response.output.syncProtocol.payload.primitiveName,
        txHash: response.output.syncProtocol.payload.transactionHash,
        caip2: response.output.syncProtocol.payload.caip2,
        fromAddress: from.toLowerCase(),
        contractAddress: response.input.contractAddress.toLowerCase(),
      },
    );
  }

  // Update balance + burn tables.
  for (let i = 0; i < ids.length; ++i) {
    let token_id = ids[i];
    let value = BigInt(values[i]);

    if (!isMint) {
      // if not a mint, reduce sender's balance
      yield* World.resolve(primitiveErc1155ModifyBalance, {
        primitive_name: response.output.syncProtocol.payload.primitiveName,
        token_id: token_id.toString(),
        wallet_address: from.toLowerCase(),
        value: (-value).toString(),
      });
      // And if it's zero, remove the row to keep table size down
      yield* World.resolve(primitiveErc1155DeleteIfZero, {
        primitive_name: response.output.syncProtocol.payload.primitiveName,
        token_id: token_id.toString(),
        wallet_address: from.toLowerCase(),
      });
    }

    if (!isBurn) {
      // if not a burn, increase recipient's balance
      yield* World.resolve(primitiveErc1155ModifyBalance, {
        primitive_name: response.output.syncProtocol.payload.primitiveName,
        token_id: token_id.toString(),
        wallet_address: to.toLowerCase(),
        value: value.toString(),
      });
    } else {
      // if a burn, increase sender's burn record
      yield* World.resolve(primitiveErc1155Burn, {
        primitive_name: response.output.syncProtocol.payload.primitiveName,
        token_id: token_id.toString(),
        wallet_address: from.toLowerCase(),
        value: value.toString(),
      });
    }
  }
}
