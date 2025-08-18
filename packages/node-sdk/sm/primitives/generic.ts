import { ENV, SCHEDULED_DATA_ADDRESS } from "@paima/utils";
import { createScheduledData, primitiveGenericInsertData } from "@paima/db";
import type { StateUpdateStream } from "@paima/db";
import { PaimaSTM } from "@paima/db";
import { BuiltinTransitions, generateRawStmInput } from "@paima/concise";
import {
  ConfigPrimitivePayloadType,
  ConfigPrimitiveType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
} from "@paima/config";
import assertNever from "assert-never";

export default function* processGenericSyncProtocolResponse(
  response:
    | FlattenSyncProtocolIOFor<
      ConfigSyncProtocolType.EVM_RPC_PARALLEL,
      ConfigPrimitiveType.EvmRpcGeneric,
      ConfigPrimitivePayloadType.Event
    >
    | FlattenSyncProtocolIOFor<
      ConfigSyncProtocolType.MINA_PARALLEL,
      ConfigPrimitiveType.MinaEventGeneric,
      ConfigPrimitivePayloadType.Event
    >
    | FlattenSyncProtocolIOFor<
      ConfigSyncProtocolType.MINA_PARALLEL,
      ConfigPrimitiveType.MinaActionGeneric,
      ConfigPrimitivePayloadType.Event
    >,
): StateUpdateStream<void> {
  const primitiveName = response.output.syncProtocol.payload.primitiveName;
  const blockHeight = response.output.syncProtocol.payload.ownChain.blockNumber;
  const payload = response.output.payload;
  const prefix = response.input.scheduledPrefix;

  const scheduledBlockHeight =
    response.output.syncProtocol.payload.mainchain.blockNumber;

  const scheduledInputData = (() => {
    switch (response.primitiveType) {
      case ConfigPrimitiveType.EvmRpcGeneric:
        return generateRawStmInput(
          BuiltinTransitions[ConfigPrimitiveType.EvmRpcGeneric].scheduledPrefix,
          prefix,
          {
            payload: response.output.payload,
          },
        );
      case ConfigPrimitiveType.MinaActionGeneric:
        return generateRawStmInput(
          BuiltinTransitions[ConfigPrimitiveType.MinaActionGeneric]
            .scheduledPrefix,
          prefix,
          {
            payload: response.output.payload,
          },
        );
      case ConfigPrimitiveType.MinaEventGeneric:
        return generateRawStmInput(
          BuiltinTransitions[ConfigPrimitiveType.MinaEventGeneric]
            .scheduledPrefix,
          prefix,
          {
            payload: response.output.payload,
          },
        );
      default:
        assertNever.default(response);
    }
  })();

  yield* createScheduledData(
    JSON.stringify(scheduledInputData),
    { blockHeight: scheduledBlockHeight },
    {
      primitiveName: response.output.syncProtocol.payload.primitiveName,
      txHash: response.output.syncProtocol.payload.transactionHash,
      caip2: response.output.syncProtocol.payload.caip2,
      // TODO: what to set this to?
      //       - sender address (requires a eth_getTransactionByHash call)
      //       - some standard (ex: some way to specify which field in the ABI is the from address)
      //       - contract address
      fromAddress: SCHEDULED_DATA_ADDRESS,
      contractAddress: "contractAddress" in response.input
        ? response.input.contractAddress
        : undefined,
    },
  );

  yield* World.resolve(primitiveGenericInsertData, {
    primitive_name: primitiveName,
    block_height: blockHeight,
    event_data: payload,
  });
}
