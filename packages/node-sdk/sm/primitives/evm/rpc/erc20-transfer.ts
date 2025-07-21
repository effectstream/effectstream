import {
  ConfigPrimitiveAccountingPayloadType,
  type ConfigPrimitivePayloadType,
  type ConfigPrimitiveType,
  type ConfigSyncProtocolType,
  type FlattenSyncProtocolIOFor,
  type PayloadOf,
  type PrimitiveEvmRpcErc20TransferAccounting,
} from "@paima/config";
import { World } from "@paima/coroutine";
import type { StateUpdateStream } from "@paima/coroutine";
import type { BlockNumber } from "@paima/utils";
import { createScheduledData, insertPrimitiveAccounting } from "@paima/db";
import { clearBigInts } from "../../utils.ts";

export default function* processErc20SyncProtocolResponse(
  paima_block_height: BlockNumber,
  response: FlattenSyncProtocolIOFor<
    | ConfigSyncProtocolType.EVM_RPC_MAIN
    | ConfigSyncProtocolType.EVM_RPC_PARALLEL,
    ConfigPrimitiveType.EvmRpcERC20,
    ConfigPrimitivePayloadType.Transfer
  >,
): StateUpdateStream<void> {
  const prefix = response.input.scheduledPrefix;

  const primitiveName = response.output.syncProtocol.payload.primitiveName;

  // We cannot insert bigints into the database, or be serialized to JSON.
  // payload.value is a bigint
  const payload = clearBigInts(response.output.payload);

  yield* World.resolve(insertPrimitiveAccounting, {
    primitive_name: primitiveName,
    paima_block_height: paima_block_height,
    payload_type: ConfigPrimitiveAccountingPayloadType.Transfer,
    payload: payload satisfies PayloadOf<
      typeof PrimitiveEvmRpcErc20TransferAccounting
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
