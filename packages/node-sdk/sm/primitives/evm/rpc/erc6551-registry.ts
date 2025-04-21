import type {
  ConfigPrimitivePayloadType,
  ConfigPrimitiveType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
} from "@paima/config";
import { primitiveErc6551InsertRegistry } from "@paima/db";
import type { StateUpdateStream } from "@paima/coroutine";
import { World } from "@paima/coroutine";

export default function* processErc6551SyncProtocolResponse(
  response: FlattenSyncProtocolIOFor<
    | ConfigSyncProtocolType.EVM_RPC_MAIN
    | ConfigSyncProtocolType.EVM_RPC_PARALLEL,
    ConfigPrimitiveType.EvmRpcERC6551Registry,
    ConfigPrimitivePayloadType.Registry
  >,
): StateUpdateStream<void> {
  yield* World.resolve(primitiveErc6551InsertRegistry, {
    primitive_name: response.output.syncProtocol.payload.primitiveName,
    block_height: response.output.syncProtocol.payload.ownChain.blockNumber,
    account_created: response.output.payload.accountCreated,
    implementation: response.output.payload.implementation,
    token_contract: response.output.payload.tokenContract,
    token_id: response.output.payload.tokenId.toString(),
    chain_id: response.output.payload.chainId.toString(),
    salt: response.output.payload.salt.toString(),
  });
}
