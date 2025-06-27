import type { BlockNumber, EvmAddress } from "@paima/utils";
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
import { StateMachineExecution, World } from "@paima/coroutine";
import { createScheduledData } from "@paima/db";
import { BuiltinTransitions, generateRawStmInput } from "@paima/concise";
import {
  ConfigPrimitiveAccountingPayloadType,
  ConfigPrimitiveType,
} from "@paima/config";
import { ComponentNames, log, SeverityNumber } from "@paima/log";
import { mainAddressGenerator, NO_USER_ID } from "@paima/sm";
import { call, Channel, Operation } from "npm:effection@^3.5.0";
import { clearBigInts } from "../../utils.ts";

export default function* processPaimaL2SyncProtocolResponse(
  paima_block_height: BlockNumber,
  response: FlattenSyncProtocolIOFor<
    | ConfigSyncProtocolType.EVM_RPC_MAIN
    | ConfigSyncProtocolType.EVM_RPC_PARALLEL,
    ConfigPrimitiveType.EvmRpcPaimaL2,
    ConfigPrimitivePayloadType.Event
  >,
): StateUpdateStream<void> {
  const [nonceData] = yield* World.resolve(findNonce, {
    nonce: response.output.payload.inputNonce,
  });
  if (nonceData) {
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

  // TODO Where does the nonce come from?
  const [lastNonceData] = yield* World.resolve(getLastNonce, undefined);
  const nextNouce = lastNonceData
    ? Number((lastNonceData as any).nonce) + 1
    : 0;

  // guarantee we run this no matter if there is an error or a continue
  yield* World.resolve(insertNonce, {
    nonce: String(nextNouce),
    block_height: paima_block_height,
  });

  // We cannot insert bigints into the database, or be serialized to JSON.
  const payload = clearBigInts(response.output.payload);

  const primitiveName = response.output.syncProtocol.payload.primitiveName;
  yield* World.resolve(insertPrimitiveAccounting, {
    primitive_name: primitiveName,
    paima_block_height: paima_block_height,
    payload_type: ConfigPrimitiveAccountingPayloadType.Event,
    payload: payload satisfies PayloadOf<
      typeof PrimitiveEvmRpcPaimaL2Accounting
    >,
  });

  const address = yield* mainAddressGenerator(
    response.output.payload.realAddress.address,
  );

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

  yield* StateMachineExecution(
    paima_block_height,
    hexToString((response.output.payload as any).data),
    address.address as `0x${string}`,
    address.id,
    response.output.syncProtocol.payload.ownChain.blockNumber,
    response.output.syncProtocol.payload.transactionHash,
  );
}
