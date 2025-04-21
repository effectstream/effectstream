import { doLog, type EvmAddress } from "@paima/utils";
import type {
  ConfigPrimitivePayloadType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
} from "@paima/config";
import type { StateUpdateStream } from "@paima/coroutine";
import { findNonce, mainAddressGenerator } from "@paima/db";
import { World } from "@paima/coroutine";
import {
  createScheduledData,
  primitiveErc20DepositGetTotalDeposited,
  primitiveErc20DepositInsertTotalDeposited,
  primitiveErc20DepositUpdateTotalDeposited,
} from "@paima/db";
import { BuiltinTransitions, generateRawStmInput } from "@paima/concise";
import { ConfigPrimitiveType } from "@paima/config";
import { DelegateWallet } from "../../../delegate-wallet.ts";

export default function* processPaimaL2SyncProtocolResponse(
  response: FlattenSyncProtocolIOFor<
    | ConfigSyncProtocolType.EVM_RPC_MAIN
    | ConfigSyncProtocolType.EVM_RPC_PARALLEL,
    ConfigPrimitiveType.EvmRpcPaimaL2,
    ConfigPrimitivePayloadType.Event
  >,
): StateUpdateStream<void> {
  // Check nonce is valid
  const nonceData = yield* World.resolve(findNonce, {
    nonce: response.output.payload.inputNonce,
  });
  if (nonceData.length > 0) {
    doLog(
      `Skipping inputData with duplicate nonce: ${
        JSON.stringify(response.output.payload.inputData)
      }`,
    );
    return;
  }
  const address = yield* mainAddressGenerator(
    response.output.payload.realAddress.address,
  );

  // const txHash = hashRollupInput.hash({
  //   caip2Prefix: submittedData.origin.caip2!,
  //   txHash: submittedData.origin.txHash!,
  //   indexInBlock: indexForEvent(submittedData.origin.txHash!),
  // });
  // const inputData: STFSubmittedData = {
  //   ...submittedData,
  //   userAddress: address.address,
  //   userId: address.id,
  //   paimaTxHash: txHash,
  // };
  let success: boolean | undefined = false;
  try {
    // Check if internal Concise Command
    // Internal Concise Commands are prefixed with an ampersand (&)
    const delegateWallet = new DelegateWallet(DBConn);
    if (inputData.inputData.startsWith(INTERNAL_COMMAND_PREFIX)) {
      const status = await delegateWallet.process(
        inputData.realAddress,
        inputData.userAddress,
        inputData.inputData,
      );
      if (!status) continue;
    } else if (inputData.userId === NO_USER_ID) {
      // If wallet does not exist in address table: create it.
      const newAddress = await delegateWallet.createAddress(
        inputData.userAddress,
      );
      inputData.userId = newAddress.id;
    }

    // Trigger STF
    let sqlQueries: QueuedUpdate[] = [];
    let eventsToEmit: EventsToEmit<Events[string][number]> = [];

    try {
    } catch (err) {
      // skip inputs where the STF fails
      doLog(`[paima-sm] Error on user input STF call. Skipping`, err);
      continue;
    }
    if (sqlQueries.length !== 0) {
      success = await tryOrRollback(DBConn, async () => {
        for (const [query, params] of sqlQueries) {
          await query.run(params, DBConn);
        }

        return true;
      });

      if (success) {
        await sendEventsToBroker<Events[string][number]>(eventsToEmit);
        resultingHashes.successTxHashes.push(txHash);
      } else {
        resultingHashes.failedTxHashes.push(txHash);
      }
    }
  } catch (e) {
    resultingHashes.failedTxHashes.push(txHash);
    throw e;
  } finally {
    // guarantee we run this no matter if there is an error or a continue
    await insertNonce.run(
      {
        nonce: inputData.inputNonce,
        block_height: latestChainData.blockNumber,
      },
      DBConn,
    );
    if (ENV.STORE_HISTORICAL_GAME_INPUTS) {
      await newGameInput.run(
        {
          block_height: latestChainData.blockNumber,
          input_data: inputData.inputData,
          from_address: inputData.userAddress,
          success: success ?? false,
          paima_tx_hash: Buffer.from(txHash, "hex"),
          index_in_block: txIndexInBlock,
          origin_tx_hash: Buffer.from(strip0x(inputData.origin.txHash!), "hex"),
          caip2: inputData.origin.caip2!,
          primitive_name: inputData.origin.primitiveName ?? "",
          origin_contract_address: inputData.origin.contractAddress,
        },
        DBConn,
      );
    }
    txIndexInBlock += 1;
  }

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
      BuiltinTransitions[ConfigPrimitiveType.ERC20Deposit].scheduledPrefix,
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
