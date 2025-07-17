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
  getAddressWithAddress,
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
} from "@paima/config";
import { ComponentNames, log, SeverityNumber } from "@paima/log";
import {
  account_createAccount,
  account_linkAddress,
  account_unlinkAddress,
} from "@paima/sm";
import { clearBigInts } from "../../utils.ts";
import { BuiltinGrammarPrefix } from "@paima/concise";
import { CryptoManager } from "@paima/crypto";

function* checkNonce(
  nonce: string | undefined,
  block_height: BlockNumber,
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
          `Skipping inputData with duplicate nonce: ${nonceData.nonce} at block height: ${nonceData.block_height}`,
        ),
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
}): StateUpdateStream<void> {
  // For EVM we use the lowercase address.
  const normalizedSignerAddress = input.signerAddress
    .toLocaleLowerCase() as `0x${string}`;
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

  let [signer_address] = yield* World.resolve(getAddressWithAddress, {
    address: normalizedSignerAddress,
  });

  if (!signer_address) {
    // Let's insert a new address.
    yield* World.resolve(newAddress, {
      address: normalizedSignerAddress,
    });
    [signer_address] = yield* World.resolve(getAddressWithAddress, {
      address: normalizedSignerAddress,
    });
  }

  // parseStmInput<typeof BuiltinGrammar>
  try {
    const delegateWallet = extractDelegateWallet(conciseCommandStr);
    let status = false;
    if (delegateWallet.prefix === BuiltinGrammarPrefix.createAccount) {
      status = yield* account_createAccount(
        signer_address,
        delegateWallet,
      );
    } else if (delegateWallet.prefix === BuiltinGrammarPrefix.linkAddress) {
      status =
        yield* (account_linkAddress(signer_address, delegateWallet)) as any;
    } else if (delegateWallet.prefix === BuiltinGrammarPrefix.unlinkAddress) {
      status =
        yield* (account_unlinkAddress(signer_address, delegateWallet)) as any;
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
    const message = hexToString(outerLayerPayload.data);
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
      // TODO: We need to setup & configure the namespace.
      const message = createMessageForBatcher(
        null,
        millisecondTimestamp,
        userAddress,
        gameInput,
      );
      // We yield the promise to the generator caller.
      // Sync Generators cannot resolve promises.
      const [validSignature] = (yield {
        promise: CryptoManager.Evm().verifySignature(
          // TODO This is only for EVM at the time.
          //      But the user can sign with other wallets.
          userAddress as `0x${string}`,
          message,
          userSignature as `0x${string}`,
        ),
      } as any) as [boolean];
      if (validSignature) {
        yield* executePaimaL2Input({
          paima_block_height,
          nonce: batchedMessage.parsed.userAddress + "-" +
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
          signerAddress: batchedMessage.parsed.userAddress as `0x${string}`,
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
