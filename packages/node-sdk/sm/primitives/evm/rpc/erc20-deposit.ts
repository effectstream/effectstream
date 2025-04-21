import { doLog, type EvmAddress } from "@paima/utils";
import type {
  ConfigPrimitivePayloadType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
} from "@paima/config";
import type { StateUpdateStream } from "@paima/coroutine";
import { World } from "@paima/coroutine";
import {
  createScheduledData,
  primitiveErc20DepositGetTotalDeposited,
  primitiveErc20DepositInsertTotalDeposited,
  primitiveErc20DepositUpdateTotalDeposited,
} from "@paima/db";
import { BuiltinTransitions, generateRawStmInput } from "@paima/concise";
import { ConfigPrimitiveType } from "@paima/config";

export default function* processErc20DepositSyncProtocolResponse(
  response: FlattenSyncProtocolIOFor<
    | ConfigSyncProtocolType.EVM_RPC_MAIN
    | ConfigSyncProtocolType.EVM_RPC_PARALLEL,
    ConfigPrimitiveType.EvmRpcERC20Deposit,
    ConfigPrimitivePayloadType.Deposit
  >,
): StateUpdateStream<void> {
  const primitiveName = response.output.syncProtocol.payload.primitiveName;
  const { from, value } = response.output.payload;

  const fromAddr = from.toLowerCase() as EvmAddress;

  const fromRow = yield* World.resolve(
    primitiveErc20DepositGetTotalDeposited,
    {
      primitive_name: primitiveName,
      wallet_address: fromAddr,
    },
  );

  const numValue = BigInt(value);
  const prefix = response.input.scheduledPrefix;

  try {
    const scheduledInputData = generateRawStmInput(
      BuiltinTransitions[ConfigPrimitiveType.EvmRpcERC20Deposit]
        .scheduledPrefix,
      prefix,
      {
        from: fromAddr,
        value,
      },
    );
    const scheduledBlockHeight =
      response.output.syncProtocol.payload.mainchain.blockNumber;
    yield* createScheduledData(
      JSON.stringify(scheduledInputData),
      { blockHeight: scheduledBlockHeight },
      {
        primitiveName: response.output.syncProtocol.payload.primitiveName,
        txHash: response.output.syncProtocol.payload.transactionHash,
        caip2: response.output.syncProtocol.payload.caip2,
        fromAddress: fromAddr,
        contractAddress: response.input.contractAddress.toLowerCase(),
      },
    );

    if (fromRow.length > 0) {
      const oldTotal = BigInt(fromRow[0].total_deposited);
      const newTotal = oldTotal + numValue;
      yield* World.resolve(primitiveErc20DepositUpdateTotalDeposited, {
        primitive_name: primitiveName,
        wallet_address: fromAddr,
        total_deposited: newTotal.toString(10),
      });
    } else {
      yield* World.resolve(primitiveErc20DepositInsertTotalDeposited, {
        primitive_name: primitiveName,
        wallet_address: fromAddr,
        total_deposited: value.toString(),
      });
    }
  } catch (err) {
    doLog(`[paima-sm] error while processing erc20 datum: ${err}`);
  }
}
