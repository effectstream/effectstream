import type { BlockNumber, EvmAddress } from "@paima/utils";
import { hexToString, stringToHex } from "npm:viem";
import type {
  ConfigPrimitivePayloadType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  PayloadOf,
  PrimitiveEvmRpcPaimaL2Accounting,
} from "@paima/config";
import type { StateUpdateStream } from "@paima/coroutine";
import {
  createScheduledData,
  findNonce,
  insertNonce,
  insertPrimitiveAccounting,
  newAddress,
} from "@paima/db";
import { World } from "@paima/coroutine";
import { extractBatches, type ExtractedBatchSubunit } from "@paima/concise";
import {
  ConfigPrimitiveAccountingPayloadType,
  type ConfigPrimitiveType,
} from "@paima/config";
import { ComponentNames, log, SeverityNumber } from "@paima/log";
import { mainAddressGenerator, NO_USER_ID } from "@paima/sm";
import { clearBigInts } from "../../utils.ts";

function* executePaimaL2Input(input: {
  paima_block_height: BlockNumber;
  nonce: string | undefined;
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
  // TODO This is only for batched messages?
  if (input.nonce) {
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
    // guarantee we run this no matter if there is an error or a continue
    yield* World.resolve(insertNonce, {
      nonce: input.nonce,
      block_height: input.paima_block_height,
    });
  }
  // const primitiveName = response.output.syncProtocol.payload.primitiveName;
  yield* World.resolve(insertPrimitiveAccounting, {
    primitive_name: input.primitiveName,
    paima_block_height: input.paima_block_height,
    payload_type: ConfigPrimitiveAccountingPayloadType.Event,
    payload: input.payload,
  });

  const address = yield* mainAddressGenerator(
    input.signerAddress,
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

  yield* createScheduledData(
    hexToString((input.payload as any).data),
    {
      blockHeight: input.paima_block_height,
    },
    {
      primitiveName: input.primitiveName,
      txHash: input.ownChain.transactionHash,
      // TODO: Where to get this from, we can asume its eip155:{chainId}
      caip2: "eip155", // input.ownChain.caip2,
      fromAddress: address.address,
      // TODO Where to get this from?
      contractAddress: "0x0", // response.input.contractAddress.toLowerCase(),
    },
  );
}

export default function* processPaimaL2SyncProtocolResponse(
  paima_block_height: BlockNumber,
  response: FlattenSyncProtocolIOFor<
    | ConfigSyncProtocolType.EVM_RPC_MAIN
    | ConfigSyncProtocolType.EVM_RPC_PARALLEL,
    ConfigPrimitiveType.EvmRpcPaimaL2,
    ConfigPrimitivePayloadType.PaimaL2Event
  >,
): StateUpdateStream<void> {
  const outerLayerPayload = clearBigInts(response.output.payload);

  let isBatched = false;
  let batchedMessages: ExtractedBatchSubunit[] = [];
  try {
    const message = hexToString((outerLayerPayload as any).data);
    batchedMessages = extractBatches(message);
    isBatched = true;
  } catch {
    // Not batched message
  }
  if (isBatched) {
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
        signerAddress: batchedMessage.parsed.userAddress as `0x${string}`,
      });
    }
  } else { // !isBatched
    yield* executePaimaL2Input({
      paima_block_height,
      // TODO: where do we get the nonce from?
      nonce: undefined,
      ownChain: {
        blockNumber: response.output.syncProtocol.payload.ownChain.blockNumber,
        transactionHash: response.output.syncProtocol.payload.transactionHash,
      },
      payload: outerLayerPayload,
      primitiveName: response.output.syncProtocol.payload.primitiveName,
      signerAddress: response.output.payload.userAddress,
    });
  }
}
