import { doLog } from "@paima/utils";
import type {
  ConfigPrimitivePayloadType,
  ConfigPrimitiveType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
} from "@paima/config";
import {
  primitiveErc20GetBalance,
  primitiveErc20InsertBalance,
  primitiveErc20UpdateBalance,
} from "@paima/db";
import { World } from "@paima/coroutine";
import type { StateUpdateStream } from "@paima/coroutine";

export default function* processErc20SyncProtocolResponse(
  response: FlattenSyncProtocolIOFor<
    | ConfigSyncProtocolType.EVM_RPC_MAIN
    | ConfigSyncProtocolType.EVM_RPC_PARALLEL,
    ConfigPrimitiveType.EvmRpcERC20,
    ConfigPrimitivePayloadType.Transfer
  >,
): StateUpdateStream<void> {
  const primitiveName = response.output.syncProtocol.payload.primitiveName;
  const { from, to, value } = response.output.payload;

  const fromAddr = from.toLowerCase();
  const toAddr = to.toLowerCase();

  const fromRow = yield* World.resolve(primitiveErc20GetBalance, {
    primitive_name: primitiveName,
    wallet_address: fromAddr,
  });
  const toRow = yield* World.resolve(primitiveErc20GetBalance, {
    primitive_name: primitiveName,
    wallet_address: toAddr,
  });

  const numValue = BigInt(value);

  try {
    if (fromRow.length > 0) {
      const fromOldBalance = BigInt(fromRow[0].balance);
      const fromNewBalance = fromOldBalance - numValue;
      yield* World.resolve(primitiveErc20UpdateBalance, {
        primitive_name: primitiveName,
        wallet_address: fromAddr,
        balance: fromNewBalance.toString(10),
      });
    }

    if (toRow.length > 0) {
      const toOldBalance = BigInt(toRow[0].balance);
      const toNewBalance = toOldBalance + numValue;
      yield* World.resolve(primitiveErc20UpdateBalance, {
        primitive_name: primitiveName,
        wallet_address: toAddr,
        balance: toNewBalance.toString(10),
      });
    } else {
      yield* World.resolve(primitiveErc20InsertBalance, {
        primitive_name: primitiveName,
        wallet_address: toAddr,
        balance: value.toString(),
      });
    }
  } catch (err) {
    doLog(`[paima-sm] error while processing erc20 datum: ${err}`);
  }
}
