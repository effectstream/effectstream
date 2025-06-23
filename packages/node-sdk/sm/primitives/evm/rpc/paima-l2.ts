import type { EvmAddress } from "@paima/utils";
import { hexToString } from "npm:viem";
import type {
  ConfigPrimitivePayloadType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  PayloadOf,
  PrimitiveEvmRpcPaimaL2Accounting,
} from "@paima/config";
import type { QueuedUpdate, StateUpdateStream } from "@paima/coroutine";
import {
  findNonce,
  getLastNonce,
  insertNonce,
  insertPrimitiveAccounting,
  newAddress,
} from "@paima/db";
import { World } from "@paima/coroutine";
import { createScheduledData } from "@paima/db";
import { BuiltinTransitions, generateRawStmInput } from "@paima/concise";
import {
  ConfigPrimitiveAccountingPayloadType,
  ConfigPrimitiveType,
} from "@paima/config";
import { ComponentNames, log, SeverityNumber } from "@paima/log";
import {
  type BaseStfInput,
  type BaseStfOutput,
  mainAddressGenerator,
  NO_USER_ID,
} from "@paima/sm";
import { call, Channel, Operation } from "npm:effection@^3.5.0";
import type { AppEvents } from "@paima/sm";

export default function* processPaimaL2SyncProtocolResponse(
  response: FlattenSyncProtocolIOFor<
    | ConfigSyncProtocolType.EVM_RPC_MAIN
    | ConfigSyncProtocolType.EVM_RPC_PARALLEL,
    ConfigPrimitiveType.EvmRpcPaimaL2,
    ConfigPrimitivePayloadType.Event
  >,
  gameStateTransitionRouter: (
    blockHeight: number,
    input: BaseStfInput,
  ) => Promise<BaseStfOutput<AppEvents>>,
): Generator<any, any, any> {
  const nonceData = yield* World.resolve(findNonce, {
    nonce: response.output.payload.inputNonce,
  });
  if (nonceData && nonceData.length > 0) {
    log.remote(
      ComponentNames.PAIMA_SYNC,
      ["paima-l2"],
      SeverityNumber.INFO,
      (log) =>
        log(
          `Skipping inputData with duplicate nonce: ${
            JSON.stringify(response.output.payload.inputData)
          }`,
        ),
    );
    return;
  }
  const [lastNonceData] = yield* World.resolve(getLastNonce, undefined);
  const nextNouce = lastNonceData
    ? Number((lastNonceData as any).nonce) + 1
    : 0;

  const address = yield* mainAddressGenerator(
    response.output.payload.realAddress.address,
  );

  const blockHeight = response.output.syncProtocol.payload.ownChain.blockNumber;

  // let success: boolean | undefined = false;
  try {
    // Check if internal Concise Command
    // Internal Concise Commands are prefixed with an ampersand (&)
    // const delegateWallet = new DelegateWallet(DBConn);
    // if (response.output.payload.inputData.startsWith("&")) {
    // const status = await delegateWallet.process(
    //   inputData.realAddress,
    //   inputData.userAddress,
    //   inputData.inputData,
    // );
    // if (!status) continue;
    // } else
    if (address.id === NO_USER_ID) {
      // If wallet does not exist in address table: create it.
      const [newAddressResult] = yield* World.resolve(newAddress, {
        address: address.address,
      });
      address.id = (newAddressResult as any).id;
    }
  } catch (err) {
    log.remote(
      ComponentNames.PAIMA_SYNC,
      ["paima-l2"],
      SeverityNumber.ERROR,
      (log) => log(`[paima-sm] Error on user input STF call. Skipping`, err),
    );
  }

  const inputData = {
    ...response.output.payload,
    userAddress: address.address,
    userId: address.id,
    paimaTxHash: "", // txHash,
  };

  // Trigger STF
  // let sqlQueries: QueuedUpdate[] = [];
  // let eventsToEmit: EventsToEmit<Events[string][number]> = [];

  try {
    console.log("inputData", inputData);
  } catch (err) {
    // skip inputs where the STF fails
    log.remote(
      ComponentNames.PAIMA_SYNC,
      ["paima-l2"],
      SeverityNumber.ERROR,
      (log) => log(`[paima-sm] Error on user input STF call. Skipping`, err),
    );
  }
  // if (sqlQueries.length !== 0) {
  //   // success = await tryOrRollback(DBConn, async () => {
  //     for (const [query, params] of sqlQueries) {
  //       await query.run(params, DBConn);
  //     }

  //     return true;
  //   // });

  //   if (success) {
  //     // await sendEventsToBroker<Events[string][number]>(eventsToEmit);
  //     resultingHashes.successTxHashes.push(txHash);
  //   } else {
  //     resultingHashes.failedTxHashes.push(txHash);
  //   }
  // }
  // } catch (e) {
  //   resultingHashes.failedTxHashes.push(txHash);
  //   throw e;
  // } finally {
  // guarantee we run this no matter if there is an error or a continue
  yield {
    type: "nounce",
    promise: [insertNonce, {
      nonce: nextNouce,
      block_height: blockHeight,
    }],
  };

  //   if (ENV.STORE_HISTORICAL_GAME_INPUTS) {
  //     await newGameInput.run(
  //       {
  //         block_height: latestChainData.blockNumber,
  //         input_data: inputData.inputData,
  //         from_address: inputData.userAddress,
  //         success: success ?? false,
  //         paima_tx_hash: Buffer.from(txHash, "hex"),
  //         index_in_block: txIndexInBlock,
  //         origin_tx_hash: Buffer.from(strip0x(inputData.origin.txHash!), "hex"),
  //         caip2: inputData.origin.caip2!,
  //         primitive_name: inputData.origin.primitiveName ?? "",
  //         origin_contract_address: inputData.origin.contractAddress,
  //       },
  //       DBConn,
  //     );
  //   }
  //   txIndexInBlock += 1;
  // }

  // const primitiveName = response.output.syncProtocol.payload.primitiveName;
  // const { from, value } = response.output.payload;

  // const fromAddr = from.toLowerCase() as EvmAddress;

  // const fromRow = yield* World.resolve(
  //   primitiveErc20DepositGetTotalDeposited,
  //   {
  //     primitive_name: primitiveName,
  //     wallet_address: fromAddr,
  //   },
  // );

  // const numValue = BigInt(value);
  // const prefix = response.input.scheduledPrefix;

  // try {
  //   const scheduledInputData = generateRawStmInput(
  //     BuiltinTransitions[ConfigPrimitiveType.ERC20Deposit].scheduledPrefix,
  //     prefix,
  //     {
  //       from: fromAddr,
  //       value,
  //     },
  //   );
  //   const scheduledBlockHeight =
  //     response.output.syncProtocol.payload.mainchain.blockNumber;
  // yield* createScheduledData(
  //   JSON.stringify(scheduledInputData),
  //   { blockHeight: scheduledBlockHeight },
  //   {
  //     primitiveName: response.output.syncProtocol.payload.primitiveName,
  //     txHash: response.output.syncProtocol.payload.transactionHash,
  //     caip2: response.output.syncProtocol.payload.caip2,
  //     fromAddress: fromAddr,
  //     contractAddress: response.input.contractAddress.toLowerCase(),
  //   },
  // );

  //   if (fromRow.length > 0) {
  //     const oldTotal = BigInt(fromRow[0].total_deposited);
  //     const newTotal = oldTotal + numValue;
  //     yield* World.resolve(primitiveErc20DepositUpdateTotalDeposited, {
  //       primitive_name: primitiveName,
  //       wallet_address: fromAddr,
  //       total_deposited: newTotal.toString(10),
  //     });
  //   } else {
  //     yield* World.resolve(primitiveErc20DepositInsertTotalDeposited, {
  //       primitive_name: primitiveName,
  //       wallet_address: fromAddr,
  //       total_deposited: value.toString(),
  //     });
  //   }
  // } catch (err) {
  //   doLog(`[paima-sm] error while processing erc20 datum: ${err}`);
  // }
  (inputData as any).tx = JSON.parse(hexToString((inputData as any).data));
  (inputData as any).value = Number((inputData as any).value);
  const primitiveName = response.output.syncProtocol.payload.primitiveName;
  const paima_block_height = blockHeight;
  yield* World.resolve(insertPrimitiveAccounting, {
    primitive_name: primitiveName,
    paima_block_height: paima_block_height,
    payload_type: ConfigPrimitiveAccountingPayloadType.Event,
    payload: inputData satisfies PayloadOf<
      typeof PrimitiveEvmRpcPaimaL2Accounting
    >,
  });

  yield {
    type: "promise",
    promise: gameStateTransitionRouter(blockHeight, {
      rawInput: {
        inputData: hexToString(
          (response.output.payload as any).data,
        ) as any,
      },
      parsedInput: {
        payload: {
          ...response.output.payload,
        },
      },
    }),
  };
}
