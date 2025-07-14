import type {
  ConfigPrimitivePayloadType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  PayloadOf,
  PrimitiveEvmRpcErc721TransferAccounting,
} from "@paima/config";
import { insertPrimitiveAccounting } from "@paima/db";
import type { StateUpdateStream } from "@paima/coroutine";
import { StateMachineExecution, World } from "@paima/coroutine";
import {
  ConfigPrimitiveAccountingPayloadType,
  type ConfigPrimitiveType,
} from "@paima/config";
import { clearBigInts } from "../../utils.ts";
import type { BlockNumber } from "@paima/utils";

export default function* processErc721SyncProtocolResponse(
  paima_block_height: BlockNumber,
  response: FlattenSyncProtocolIOFor<
    | ConfigSyncProtocolType.EVM_RPC_MAIN
    | ConfigSyncProtocolType.EVM_RPC_PARALLEL,
    ConfigPrimitiveType.EvmRpcERC721,
    ConfigPrimitivePayloadType.Transfer
  >,
): StateUpdateStream<void> {
  const primitiveName = response.output.syncProtocol.payload.primitiveName;
  const { to } = response.output.payload;
  const toAddr = to.toLowerCase();
  const isBurn = Boolean(toAddr.toLocaleLowerCase().match(/^0x0+(dead)?$/g));
  const payload = clearBigInts({ ...response.output.payload, isBurn });

  const prefix = response.input.scheduledPrefix;

  yield* World.resolve(insertPrimitiveAccounting, {
    primitive_name: primitiveName,
    paima_block_height: paima_block_height,
    payload_type: ConfigPrimitiveAccountingPayloadType.Transfer,
    payload: payload satisfies PayloadOf<
      typeof PrimitiveEvmRpcErc721TransferAccounting
    >,
  });

  if (prefix) {
    yield* StateMachineExecution(
      paima_block_height,
      JSON.stringify([prefix, payload]),
      undefined,
      undefined,
      response.output.syncProtocol.payload.ownChain.blockNumber,
      response.output.syncProtocol.payload.transactionHash,
    );
  }
}
