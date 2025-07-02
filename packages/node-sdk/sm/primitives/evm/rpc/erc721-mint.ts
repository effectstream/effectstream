import type {
  ConfigPrimitivePayloadType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  PayloadOf,
  PrimitiveEvmRpcErc721MintAccounting,
} from "@paima/config";
import { insertPrimitiveAccounting } from "@paima/db";
import {
  StateMachineExecution,
  type StateUpdateStream,
  World,
} from "@paima/coroutine";
import {
  ConfigPrimitiveAccountingPayloadType,
  type ConfigPrimitiveType,
} from "@paima/config";
import type { BlockNumber } from "@paima/utils";

export default function* processErc721SyncProtocolResponse(
  paima_block_height: BlockNumber,
  response: FlattenSyncProtocolIOFor<
    | ConfigSyncProtocolType.EVM_RPC_MAIN
    | ConfigSyncProtocolType.EVM_RPC_PARALLEL,
    ConfigPrimitiveType.EvmRpcERC721,
    ConfigPrimitivePayloadType.Mint
  >,
): StateUpdateStream<void> {
  const primitiveName = response.output.syncProtocol.payload.primitiveName;
  const [_address, prefix] = [
    response.input.contractAddress,
    response.input.scheduledPrefix,
  ];

  yield* World.resolve(insertPrimitiveAccounting, {
    primitive_name: primitiveName,
    paima_block_height: paima_block_height,
    payload_type: ConfigPrimitiveAccountingPayloadType.MintOrBurn,
    payload: response.output.payload satisfies PayloadOf<
      typeof PrimitiveEvmRpcErc721MintAccounting
    >,
  });

  if (prefix) {
    yield* StateMachineExecution(
      paima_block_height,
      JSON.stringify([prefix, response.output.payload]),
      undefined,
      undefined,
      response.output.syncProtocol.payload.ownChain.blockNumber,
      response.output.syncProtocol.payload.transactionHash,
    );
  }
}
