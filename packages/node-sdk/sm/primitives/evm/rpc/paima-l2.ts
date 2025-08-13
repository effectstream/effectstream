import {
  type BlockNumber,
  type PaimaBlockNumber,
  type TxHash,
  TypeboxHelpers,
  type WalletAddress,
} from "@paima/utils";
import { hexToString, keccak256, stringToHex } from "viem";
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
  getAddressByAddress,
  getBlockHeights,
  insertNonce,
  insertPrimitiveAccounting,
  newAddress,
  // newDelegation,
} from "@paima/db";
import { World } from "@paima/coroutine";
import {
  createMessageForBatcher,
  extractBatches,
  extractDelegateWallet,
  type ExtractedBatchSubunit,
  hashBatchSubunit,
} from "@paima/concise";
import {
  ConfigPrimitiveAccountingPayloadType,
  type ConfigPrimitiveType,
  PrimitiveEvmRpcPaimaL2Payload,
} from "@paima/config";
import { ComponentNames, log, SeverityNumber } from "@paima/log";
import {
  account_createAccount,
  account_linkAddress,
  account_unlinkAddress,
  verifySignature,
} from "@paima/sm";
import { clearBigInts } from "../../utils.ts";
import { BuiltinGrammarPrefix } from "@paima/concise";
import { Value } from "@sinclair/typebox/value";
import { CryptoManager } from "@paima/crypto";

function* checkNonce(
  nonce: string | undefined,
  block_height: BlockNumber,
): StateUpdateStream<boolean> {
  const [nonceData] = yield* World.resolve(findNonce, { nonce });
  if (nonceData) {
    log.remote(
      ComponentNames.PAIMA_SYNC,
      ["paima-l2"],
      SeverityNumber.INFO,
      (log) =>
        log(
          `Skipping inputData with duplicate nonce: ${nonceData.nonce} at block height: ${nonceData.block_height}`,
        ),
    );
    return false;
  }
  // guarantee we run this no matter if there is an error or a continue
  yield* World.resolve(insertNonce, {
    nonce: nonce ?? "",
    block_height,
  });

  return true;
}

function* executePaimaL2Input(input: {
  paima_block_height: PaimaBlockNumber;
  nonce: string | undefined;
  ownChain: {
    blockNumber: BlockNumber;
    transactionHash: TxHash;
  };
  payload: PayloadOf<
    typeof PrimitiveEvmRpcPaimaL2Accounting
  >;
  primitiveName: string;
  signerAddress: WalletAddress;
}): StateUpdateStream<void> {
  const isNonceValid = yield* checkNonce(input.nonce, input.paima_block_height);
  if (!isNonceValid) return;

  // This is encoded in the event payload data.
  const conciseCommandStr = hexToString((input.payload as any).data);

  const safePayload = clearBigInts(input.payload);
  yield* World.resolve(insertPrimitiveAccounting, {
    primitive_name: input.primitiveName,
    paima_block_height: input.paima_block_height,
    payload_type: ConfigPrimitiveAccountingPayloadType.Event,
    payload: safePayload,
  });

  let [signer_address] = yield* World.resolve(getAddressByAddress, {
    address: input.signerAddress,
  });

  if (!signer_address) {
    // Let's insert a new address.
    yield* World.resolve(newAddress, {
      address: input.signerAddress,
    });
    [signer_address] = yield* World.resolve(getAddressByAddress, {
      address: input.signerAddress,
    });
  }

  try {
    const delegateWallet = extractDelegateWallet(conciseCommandStr);
    let status = false;
    if (delegateWallet.prefix === BuiltinGrammarPrefix.createAccount) {
      status = yield* account_createAccount(
        signer_address,
        delegateWallet,
      );
    } else if (delegateWallet.prefix === BuiltinGrammarPrefix.linkAddress) {
      status = yield* (account_linkAddress(
        signer_address,
        delegateWallet,
      ));
    } else if (delegateWallet.prefix === BuiltinGrammarPrefix.unlinkAddress) {
      status = yield* (account_unlinkAddress(
        signer_address,
        delegateWallet,
      ));
    }

    if (!status) {
      log.remote(
        ComponentNames.PAIMA_SYNC,
        ["paima-l2"],
        SeverityNumber.ERROR,
        (log) =>
          log(`[paima-sm] Error on Delegate Wallet input STF call. Skipping`),
      );
      // Do not continue.
      // Unwind is not needed.
      return;
    }
  } catch {
    // This is not an error, it's not just a delegate wallet message type.
  }

  yield* createScheduledData(
    conciseCommandStr,
    {
      blockHeight: input.paima_block_height,
    },
    {
      primitiveName: input.primitiveName,
      txHash: input.ownChain.transactionHash,
      // TODO: Where to get this from, we can asume its eip155:{chainId}
      caip2: "eip155", // input.ownChain.caip2,
      fromAddress: signer_address.address,
      // fromAccount: signer_address.account_id,
      // TODO Where to get this from?
      contractAddress: "0x0", // response.input.contractAddress.toLowerCase(),
    },
  );
}

export default function* processPaimaL2SyncProtocolResponse(
  paima_block_height: PaimaBlockNumber,
  response: FlattenSyncProtocolIOFor<
    | ConfigSyncProtocolType.EVM_RPC_MAIN
    | ConfigSyncProtocolType.EVM_RPC_PARALLEL,
    ConfigPrimitiveType.EvmRpcPaimaL2,
    ConfigPrimitivePayloadType.PaimaL2Event
  >,
): StateUpdateStream<void> {
  // At this point we have the response from the fetcher, but the payload has not been decoded or transformed.
  const outerLayerData = Value.Decode(
    PrimitiveEvmRpcPaimaL2Payload,
    response.output.payload,
  );
  // Fetch the block timestamp (ms) for 24h validation
  const [blockInfo] = yield* World.resolve(getBlockHeights, {
    block_heights: [paima_block_height],
  });
  const blockTimestampMs = blockInfo!.ms_timestamp.getTime();
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  let isBatched = false;
  let batchedMessages: ExtractedBatchSubunit[] = [];
  try {
    const message = hexToString(outerLayerData.data);
    batchedMessages = extractBatches(message);
    isBatched = true;
  } catch {
    // Not batched message
  }
  if (isBatched) {
    for (const batchedMessage of batchedMessages) {
      const { parsed } = batchedMessage;
      const { userAddress, millisecondTimestamp, userSignature, gameInput } =
        parsed;
      // 24h timestamp validation for batched inputs
      if (blockTimestampMs !== undefined) {
        const signedTs = Number(millisecondTimestamp);
        if (
          !Number.isFinite(signedTs) ||
          Math.abs(blockTimestampMs - signedTs) > TWENTY_FOUR_HOURS_MS
        ) {
          log.remote(
            ComponentNames.PAIMA_SYNC,
            ["paima-l2"],
            SeverityNumber.INFO,
            (log) =>
              log(
                `Skipping inputData due to timestamp outside 24h window. user=${userAddress} ts=${millisecondTimestamp} blockTs=${blockTimestampMs}`,
              ),
          );
          continue;
        }
      }
      // TODO: We need to setup & configure the namespace.
      const message = createMessageForBatcher(
        null,
        millisecondTimestamp,
        userAddress,
        gameInput,
      );
      // We yield the promise to the generator caller.
      // Sync Generators cannot resolve promises.
      const validSignature = yield* verifySignature(
        userAddress,
        message,
        userSignature,
      );
      if (validSignature) {
        yield* executePaimaL2Input({
          paima_block_height,
          // Use hash-based nonce for batched inputs
          nonce: hashBatchSubunit(batchedMessage.parsed),
          ownChain: {
            blockNumber:
              response.output.syncProtocol.payload.ownChain.blockNumber,
            transactionHash:
              response.output.syncProtocol.payload.transactionHash,
          },
          payload: {
            data: stringToHex(batchedMessage.parsed.gameInput),
            inputData: batchedMessage.parsed.gameInput,
          } as any,
          primitiveName: response.output.syncProtocol.payload.primitiveName,
          signerAddress:
            // TODO: This is only for EVM at the time.
            //       How should we handle this?
            //       Just guess the chain by the format?
            //       We need to format this, as it's not parsed or validated before.
            CryptoManager.Evm().verifyAddress(batchedMessage.parsed.userAddress)
              ? Value.Decode(
                TypeboxHelpers.Evm.Address,
                batchedMessage.parsed.userAddress,
              )
              : batchedMessage.parsed.userAddress,
        });
      } else {
        log.remote(
          ComponentNames.PAIMA_SYNC,
          ["paima-l2"],
          SeverityNumber.ERROR,
          (log) => log(`Invalid signature for batched message`),
        );
      }
    }
  } else { // !isBatched
    // Direct (non-batched) nonce as hash of [blockHeight, userAddress, game input]
    let directNonce: string | undefined = undefined;
    try {
      const gameInputStr = hexToString(outerLayerData.data);
      const userAddress =
        CryptoManager.Evm().verifyAddress(outerLayerData.userAddress)
          ? Value.Decode(
            TypeboxHelpers.Evm.Address,
            outerLayerData.userAddress,
          )
          : outerLayerData.userAddress;
      const toHash = String(paima_block_height) + userAddress + gameInputStr;
      directNonce = keccak256(stringToHex(toHash));
    } catch {
      /* ignore decode failure; skip dedup for this input */
    }

    yield* executePaimaL2Input({
      paima_block_height,
      nonce: directNonce,
      ownChain: {
        blockNumber: response.output.syncProtocol.payload.ownChain.blockNumber,
        transactionHash: response.output.syncProtocol.payload.transactionHash,
      },
      payload: outerLayerData,
      primitiveName: response.output.syncProtocol.payload.primitiveName,
      signerAddress: outerLayerData.userAddress,
    });
  }
}
