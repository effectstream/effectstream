import type { BlockNumber, EvmAddress } from "@paima/utils";
import { hexToString, stringToHex } from "npm:viem";
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
import {
  BuiltinGrammar,
  BuiltinGrammarPrefix,
  BuiltinTransitions,
  extractBatches,
  generateRawStmInput,
  KeyedBuiltinGrammar,
  parseRawStmInput,
} from "@paima/concise";
import {
  ConfigPrimitiveAccountingPayloadType,
  ConfigPrimitiveType,
} from "@paima/config";
import { ComponentNames, log, SeverityNumber } from "@paima/log";
import { mainAddressGenerator, NO_USER_ID } from "@paima/sm";
import { call, Channel, Operation } from "npm:effection@^3.5.0";
import { clearBigInts } from "../../utils.ts";

function* executePaimaL2Input(input: {
  paima_block_height: BlockNumber;
  nonce: string;
  // inputData: {};
  ownChain: {
    blockNumber: number;
    transactionHash: `0x${string}`;
  };
  payload: PayloadOf<
    typeof PrimitiveEvmRpcPaimaL2Accounting
  >;
  primitiveName: string;
  signerAddress: `0x${string}`;
}) {
  const [nonceData] = yield* World.resolve(findNonce, {
    nonce: input.nonce,
  });
  if (nonceData) {
    log.remote(
      ComponentNames.PAIMA_SYNC,
      ["paima-l2"],
      SeverityNumber.INFO,
      (log) =>
        log(
          `Skipping inputData with duplicate nonce: ${
            JSON.stringify(input.payload)
          }`,
        ),
    );
    return;
  }

  // TODO Where does the nonce come from?
  const [lastNonceData] = yield* World.resolve(getLastNonce, undefined);
  const nextNonce = lastNonceData
    ? Number((lastNonceData as any).nonce) + 1
    : 0;

  // guarantee we run this no matter if there is an error or a continue
  // yield* World.resolve(insertNonce, {
  //   nonce: String(nextNonce),
  //   block_height: input.paima_block_height,
  // });

  // We cannot insert bigints into the database, or be serialized to JSON.
  // const payload = clearBigInts(payload);

  // const primitiveName = response.output.syncProtocol.payload.primitiveName;
  yield* World.resolve(insertPrimitiveAccounting, {
    primitive_name: input.primitiveName,
    paima_block_height: input.paima_block_height,
    payload_type: ConfigPrimitiveAccountingPayloadType.Event,
    payload: input.payload satisfies PayloadOf<
      typeof PrimitiveEvmRpcPaimaL2Accounting
    >,
  });

  const address = yield* mainAddressGenerator(
    input.signerAddress,
    // response.output.payload.realAddress.address,
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
    input.paima_block_height,
    hexToString((input.payload as any).data),
    address.address as `0x${string}`,
    address.id,
    input.ownChain.blockNumber,
    input.ownChain.transactionHash,
  );
}

export default function* processPaimaL2SyncProtocolResponse(
  paima_block_height: BlockNumber,
  response: FlattenSyncProtocolIOFor<
    | ConfigSyncProtocolType.EVM_RPC_MAIN
    | ConfigSyncProtocolType.EVM_RPC_PARALLEL,
    ConfigPrimitiveType.EvmRpcPaimaL2,
    ConfigPrimitivePayloadType.Event
  >,
): StateUpdateStream<void> {
  const outerLayerPayload = clearBigInts(response.output.payload);

  let isBatched = false;
  try {
    const message = hexToString((outerLayerPayload as any).data);
    const batchedMessages = extractBatches(message);
    isBatched = true;
    for (const batchedMessage of batchedMessages) {
      // TODO we need to verify the signature of the batched messages
      yield* executePaimaL2Input({
        paima_block_height,
        nonce: batchedMessage.parsed.userAddress + "-" +
          batchedMessage.parsed.millisecondTimestamp,
        ownChain: {
          blockNumber:
            response.output.syncProtocol.payload.ownChain.blockNumber,
          transactionHash: response.output.syncProtocol.payload.transactionHash,
        },
        payload: {
          data: stringToHex(batchedMessage.parsed.gameInput),
          inputData: batchedMessage.parsed.gameInput,
        } as any,
        primitiveName: response.output.syncProtocol.payload.primitiveName,
        signerAddress: response.output.payload.realAddress
          .address as `0x${string}`,
      });
    }
  } catch {
    // Not batched message
  }

  if (!isBatched) {
    yield* executePaimaL2Input({
      paima_block_height,
      // TODO: where do we get the nonce from?
      nonce: response.output.payload.inputNonce,
      ownChain: {
        blockNumber: response.output.syncProtocol.payload.ownChain.blockNumber,
        transactionHash: response.output.syncProtocol.payload.transactionHash,
      },
      payload: outerLayerPayload,
      primitiveName: response.output.syncProtocol.payload.primitiveName,
      signerAddress: response.output.payload.realAddress
        .address as `0x${string}`,
    });
  }
}
