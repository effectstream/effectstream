import type {
  ConfigPrimitivePayloadType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  PayloadOf,
  PrimitiveEvmRpcErc721MintAccounting,
} from "@paima/config";
import { createScheduledData, insertPrimitiveAccounting } from "@paima/db";
import { type StateUpdateStream, World } from "@paima/coroutine";
import {
  ConfigPrimitiveAccountingPayloadType,
  type ConfigPrimitiveType,
} from "@paima/config";
import type { BlockNumber } from "@paima/utils";
import { clearBigInts } from "../../utils.ts";

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

  // We cannot insert bigints into the database, or be serialized to JSON.
  // payload.value is a bigint
  const payload = clearBigInts(response.output.payload);

  yield* World.resolve(insertPrimitiveAccounting, {
    primitive_name: primitiveName,
    paima_block_height: paima_block_height,
    payload_type: ConfigPrimitiveAccountingPayloadType.MintOrBurn,
    payload: payload satisfies PayloadOf<
      typeof PrimitiveEvmRpcErc721MintAccounting
    >,
  });

  if (prefix) {
    yield* createScheduledData(
      JSON.stringify([prefix, payload]),
      {
        blockHeight: paima_block_height,
      },
      {
        primitiveName: response.output.syncProtocol.payload.primitiveName,
        txHash: response.output.syncProtocol.payload.transactionHash,
        caip2: response.output.syncProtocol.payload.caip2,
        // TODO: Should we try to infer from the payload contents?
        fromAddress: "0x0",
        contractAddress: response.input.contractAddress.toLowerCase(),
      },
    );
  }
}
