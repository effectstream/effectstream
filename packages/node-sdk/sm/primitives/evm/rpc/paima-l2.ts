import {
  type BlockNumber,
  type PaimaBlockNumber,
  type TxHash,
  TypeboxHelpers,
  type WalletAddress,
} from "@paima/utils";
import { hexToString, stringToHex } from "viem";
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
import { Type } from "@sinclair/typebox";

function* checkNonce(
  nonce: string | undefined,
  block_height: BlockNumber
): StateUpdateStream<boolean> {
  // TODO This is only for batched messages?
  if (!nonce) return true;

  const [nonceData] = yield* World.resolve(findNonce, { nonce });
  if (nonceData) {
    log.remote(
      ComponentNames.PAIMA_SYNC,
      ["paima-l2"],
      SeverityNumber.INFO,
      (log) =>
        log(
          `Skipping inputData with duplicate nonce: ${nonceData.nonce} at block height: ${nonceData.block_height}`
        )
    );
    return false;
  }
  // guarantee we run this no matter if there is an error or a continue
  yield* World.resolve(insertNonce, {
    nonce,
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
  payload: PayloadOf<typeof PrimitiveEvmRpcPaimaL2Accounting>;
  primitiveName: string;
  signerAddress: WalletAddress;
}): StateUpdateStream<void> {
  const isNonceValid = yield* checkNonce(input.nonce, input.paima_block_height);
  if (!isNonceValid) return;

  try {
    const PaimaL2Payload = Type.Object({
      userAddress: Type.String(),
      data: Type.String(),
      value: Type.String({ default: "0" }),
    });

    const parsedPayload = Value.Decode(PaimaL2Payload, input.payload);

    yield* World.resolve(insertPrimitiveAccounting, {
      primitive_name: input.primitiveName,
      paima_block_height: input.paima_block_height,
      payload_type: ConfigPrimitiveAccountingPayloadType.Event,
      payload: parsedPayload,
    });
  } catch (e) {
    log.remote(
      ComponentNames.PAIMA_SYNC,
      ["paima-l2"],
      SeverityNumber.ERROR,
      (log) => log(`Invalid payload: ${e}`)
    );
  }

  // This is encoded in the event payload data.
  // NOTE: We cleanup the null 0x00 bytes, as Postgres does not allow them in strings.
  const conciseCommandStr = hexToString((input.payload as any).data).replace(
    /\0/g,
    ""
  );

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
      status = yield* account_createAccount(signer_address, delegateWallet);
    } else if (delegateWallet.prefix === BuiltinGrammarPrefix.linkAddress) {
      status = yield* account_linkAddress(signer_address, delegateWallet);
    } else if (delegateWallet.prefix === BuiltinGrammarPrefix.unlinkAddress) {
      status = yield* account_unlinkAddress(signer_address, delegateWallet);
    }

    if (!status) {
      log.remote(
        ComponentNames.PAIMA_SYNC,
        ["paima-l2"],
        SeverityNumber.ERROR,
        (log) =>
          log(`[paima-sm] Error on Delegate Wallet input STF call. Skipping`)
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
    }
  );
}

export default function* processPaimaL2SyncProtocolResponse(
  paima_block_height: PaimaBlockNumber,
  response: FlattenSyncProtocolIOFor<
    ConfigSyncProtocolType.EVM_RPC_PARALLEL,
    ConfigPrimitiveType.EvmRpcPaimaL2,
    ConfigPrimitivePayloadType.PaimaL2Event
  >
): StateUpdateStream<void> {
  // At this point we have the response from the fetcher, but the payload has not been decoded or transformed.
  const outerLayerData = Value.Decode(
    PrimitiveEvmRpcPaimaL2Payload,
    response.output.payload
  );
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
      const { addressType, userAddress, millisecondTimestamp, userSignature, gameInput } =
        parsed;
      // TODO: We need to setup & configure the namespace.
      const message = createMessageForBatcher(
        null,
        millisecondTimestamp,
        userAddress,
        gameInput
      );
      // We yield the promise to the generator caller.
      // Sync Generators cannot resolve promises.
      const validSignature = yield* verifySignature(
        addressType,
        userAddress,
        message,
        userSignature
      );
      if (validSignature) {
        yield* executePaimaL2Input({
          paima_block_height,
          nonce:
            batchedMessage.parsed.userAddress +
            "-" +
            batchedMessage.parsed.millisecondTimestamp,
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
                  batchedMessage.parsed.userAddress
                )
              : batchedMessage.parsed.userAddress,
        });
      } else {
        log.remote(
          ComponentNames.PAIMA_SYNC,
          ["paima-l2"],
          SeverityNumber.ERROR,
          (log) => log(`Invalid signature for batched message`)
        );
      }
    }
  } else {
    // !isBatched
    yield* executePaimaL2Input({
      paima_block_height,
      // TODO: where do we get the nonce from?
      nonce: undefined,
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
