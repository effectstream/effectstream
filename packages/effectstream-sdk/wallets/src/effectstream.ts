import { AddressType, type EvmAddress } from "@effectstream/utils";
import type { Wallet } from "./types.ts";
import type { IProvider } from "./IProvider.ts";
import { type Chain, numberToHex } from "viem";
import { utf8ToHex } from "web3-utils";
import type { EthersEvmProvider } from "./evm/ethers.ts";
import type { EvmInjectedProvider } from "./evm/injected.ts";
import type { AbiItem } from "web3-utils";
import { type TransactionReceipt, Web3 } from "web3";
import { createMessageForBatcher } from "@effectstream/concise";
import { BuiltinEvents, EventManager } from "@effectstream/event-client";

/**
 * This is main class used for setting up the Effectstream
 * communication. It sets up the location of the Effectstream L2 Contact.
 */
export class EffectstreamConfig {
  /**
   * Security namespace string the user wallet signs into every batched message.
   * Must match the server's `setSecurityNamespace(...)` (or, when the server uses
   * a transition object, one of its `read.prefixes`) for the primitive's
   * re-verification to admit the input. `undefined` / `""` means no namespace
   * (legacy null-prefixed signing).
   */
  public securityNamespace: string | null;
  public effectstreamL2SyncProtocolName: string;
  public effectstreamL2ContractAddress: EvmAddress;
  public effectstreamL2Abi: AbiItem[];
  public effectstreamL2Chain: Chain;
  public effectstreamL2CurrentFee: bigint = 0n;
  public web3: Web3 | undefined = undefined;
  public batcherURL: string | undefined = undefined;
  public preferBatchedMode: boolean = false;

  constructor(
    securityNamespace: string | undefined,
    effectstreamL2SyncProtocolName: string,
    effectstreamL2ContractAddress: EvmAddress,
    effectstreamL2Chain: Chain,
    effectstreamL2Abi: AbiItem[] | undefined,
    batcherURL: string | undefined,
    preferBatchedMode: boolean = false,
  ) {
    this.securityNamespace = securityNamespace && securityNamespace.length > 0
      ? securityNamespace
      : null;

    this.effectstreamL2SyncProtocolName = effectstreamL2SyncProtocolName;
    this.effectstreamL2ContractAddress = effectstreamL2ContractAddress;
    this.effectstreamL2Abi = effectstreamL2Abi ?? this.fallbackABI();
    this.effectstreamL2Chain = effectstreamL2Chain;

    this.batcherURL = batcherURL;
    if (!this.batcherURL && preferBatchedMode) {
      throw new Error("To enable batcher, you need to set the batcher URL.");
    }
    this.preferBatchedMode = preferBatchedMode;
  }

  /** Return a Web3 client for the EffectstreamL2 chain. */
  public async getWeb3Client(): Promise<Web3> {
    if (this.web3) {
      return this.web3;
    }
    this.web3 = new Web3(this.effectstreamL2Chain.rpcUrls.default.http[0]);
    await this.web3.eth.getNodeInfo();
    return this.web3;
  }

  /** Return a Effectstream L2 Contract Instance for the EffectstreamL2. */
  public async getEffectstreamL2Contract() {
    const web3 = await this.getWeb3Client();
    return new web3.eth.Contract(this.effectstreamL2Abi, this.effectstreamL2ContractAddress);
  }

  private fallbackABI(): AbiItem[] {
    return [
      {
        inputs: [{ name: "data", type: "bytes" }],
        name: "effectstreamSubmitGameInput",
        outputs: [],
        stateMutability: "payable",
        type: "function",
      },
    ] as const;
  }
}

/**
 * Effectstream Wallet Interface - Sign a message with a wallet.
 * @param wallet - The wallet to sign the message with.
 * @param message - The message to sign.
 * @returns
 */
export async function signMessage(wallet: Wallet, message: string) {
  const signature = await wallet.provider.signMessage(message);
  return signature;
}

/**
 * Main function to send a transaction to a Effectstream L2 contract.
 * It will decide whether to use the batcher or the self-sequenced transaction based on the preferBatchedMode flag.
 *
 * @param wallet - The wallet to send the transaction with.
 * @param conciseData - The concise data to send.
 * @param effectstreamConfig - The Effectstream configuration.
 * @param waitForConfirmation - The confirmation mode to use:
 *   no-wait: Do not wait for any confirmation.
 *   wait-receipt: Wait only for the chain transaction receipt.
 *   wait-effectstream-processed: Wait for the transaction to be processed by the Effectstream.
 * @returns
 */
export async function sendTransaction(
  wallet: Wallet,
  conciseData: any[],
  effectstreamConfig: EffectstreamConfig,
  waitForConfirmation: "wait-effectstream-processed" | "wait-receipt" | "no-wait" =
    "wait-effectstream-processed",
  batcherTarget: string | undefined = undefined,
): Promise<
  | ReturnType<typeof sendBatcherTransaction>
  | ReturnType<typeof sendSelfSequencedTransaction>
> {
  if (effectstreamConfig.preferBatchedMode) {
    return await sendBatcherTransaction(
      wallet,
      conciseData,
      effectstreamConfig,
      waitForConfirmation,
      batcherTarget,
    );
  }
  return await sendSelfSequencedTransaction(
    wallet,
    conciseData,
    effectstreamConfig,
    waitForConfirmation,
  );
}

/**
 * Effectstream Wallet Interface - Send a transaction to a Effectstream L2 contract with a wallet.
 * The concise data must match the grammar; if not the input will be rejected by Effectstream.
 * @param wallet - The wallet to send the transaction with.
 * @param conciseData - The concise data to send.
 * @param effectstreamConfig - The Effectstream configuration.
 * @param waitForConfirmation - The confirmation mode to use:
 *   no-wait: Do not wait for any confirmation.
 *   wait-receipt: Wait only for the chain transaction receipt.
 *   wait-effectstream-processed: Wait for the transaction to be processed by the Effectstream.
 ** @returns
 */
export async function sendSelfSequencedTransaction(
  wallet: Wallet,
  // TODO this should be any type of grammar.
  conciseData: any[],
  effectstreamConfig: EffectstreamConfig,
  waitForConfirmation: "wait-effectstream-processed" | "wait-receipt" | "no-wait" =
    "wait-effectstream-processed",
): Promise<
  & {
    success: boolean;
    type: "self-sequenced";
  }
  & (
    | {
      wait: "wait-effectstream-processed";
      hash: string;
      receipt: TransactionReceipt;
      rollup: number;
    }
    | {
      wait: "wait-receipt" | "no-wait";
      hash: string;
    }
  )
> {
  // TODO: Where to get this value from?
  const DEFAULT_GAS_PRICE = BigInt("61000000000");

  const provider: IProvider<unknown> = wallet.provider;
  const addressAndType = provider.getAddress();

  // NOTE: If the Effectstream L2 contract interface is implemented in other chains,
  //       we need to add support for them here. Effectstream L2 is EVM only for now.
  if (addressAndType.type !== AddressType.EVM) {
    throw new Error("Effectstream L2 is EVM contract.");
  }

  const evmProvider = wallet.provider as
    | EthersEvmProvider
    | EvmInjectedProvider;

  const hexData = utf8ToHex(JSON.stringify(conciseData));
  const effectstreamL2Contract = await effectstreamConfig.getEffectstreamL2Contract();

  const txData = effectstreamL2Contract.methods["effectstreamSubmitGameInput"](hexData)
    .encodeABI();
  const tx = {
    from: addressAndType.address,
    data: txData,
    to: effectstreamConfig.effectstreamL2ContractAddress,
    gasPrice: numberToHex(DEFAULT_GAS_PRICE),
    value: numberToHex(effectstreamConfig.effectstreamL2CurrentFee),
  };
  const tx_result = await evmProvider.sendTransaction(tx);

  if (
    waitForConfirmation === "no-wait" || waitForConfirmation === "wait-receipt"
  ) {
    return {
      success: true,
      type: "self-sequenced",
      wait: waitForConfirmation,
      hash: tx_result.txHash,
    };
  }

  // Wait for paima engine to process the transaction
  const receipt = await getTxReceipt(tx_result.txHash, effectstreamConfig);

  const response = await waitForEffectstreamBlockProcessed(
    Number(receipt.blockNumber),
    effectstreamConfig,
  );

  const rollup = response ? response.rollup : 0;

  return {
    success: true,
    type: "self-sequenced",
    hash: tx_result.txHash,
    wait: waitForConfirmation,
    receipt: serializeBigInts(receipt),
    rollup,
  };
}

// We return a json version of object for the frontend.
function serializeBigInts<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(
      value,
      (_, v) => typeof v === "bigint" ? v.toString() : v,
    ),
  );
}

// Wait for the transaction receipt for a given transaction hash.
async function getTxReceipt(
  txHash: string,
  effectstreamConfig: EffectstreamConfig,
): Promise<TransactionReceipt> {
  const web3 = await effectstreamConfig.getWeb3Client();
  return await web3.eth.getTransactionReceipt(txHash);
}

/**
 * Wait for specific block number to be processed by the Effectstream.
 * This guarantees that the block number is processed by the Effectstream.
 * @param blockNumber - The block number to wait for.
 * @param effectstreamConfig - The Effectstream configuration.
 * @param timeout (optional) - The timeout in milliseconds.
 * @returns
 */
export function waitForEffectstreamBlockProcessed(
  blockNumber: number,
  effectstreamConfig: EffectstreamConfig,
  timeout: number = 60000,
): Promise<{ latestBlock: number; rollup: number } | void> {
  let subscriptionReference: symbol | undefined = undefined;
  let latestBlock = 0;
  let timer: any = undefined; // node & deno differ in type of timer

  return Promise.race([
    new Promise<void>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Timeout")), timeout);
    }),
    new Promise<{ latestBlock: number; rollup: number }>((resolve, reject) => {
      if (!effectstreamConfig.effectstreamL2SyncProtocolName) {
        reject(new Error("Effectstream L2 Sync Protocol Name is not set"));
        return;
      }

      EventManager.Instance.subscribe(
        {
          topic: BuiltinEvents.SyncChains,
          filter: {
            chain: effectstreamConfig.effectstreamL2SyncProtocolName,
            block: undefined,
          },
        },
        (event) => {
          latestBlock = Math.max(event.block, latestBlock);
          if (latestBlock > blockNumber) {
            resolve({ latestBlock, rollup: event.rollup });
          }
        },
      )
        .then((subscription) => subscriptionReference = subscription)
        .catch(reject);
    }),
  ]).finally(() => {
    if (subscriptionReference) {
      EventManager.Instance.unsubscribe(subscriptionReference);
    }
    if (timer) {
      clearTimeout(timer);
    }
  });
}

/**
 * Effectstream Wallet Interface - Standard batcher communication for a Effectstream L2 contract.
 * This is only a default implementation, your own batcher might have different requirements.
 * @param wallet - The wallet to send the batched transaction with.
 * @param effectstreamL2Address - The address of the Effectstream L2 contract.
 * @param conciseData - The concise data to send.
 * @param waitForConfirmation - The confirmation mode to use:
 *   no-wait: Do not wait for any confirmation.
 *   wait-receipt: Wait only for the chain transaction receipt.
 *   wait-effectstream-processed: Wait for the transaction to be processed by the Effectstream.
 * @returns
 */
export async function sendBatcherTransaction(
  wallet: Wallet,
  // TODO we need to pass the batcher address here.
  conciseData: any[],
  effectstreamConfig: EffectstreamConfig,
  waitForConfirmation: "wait-effectstream-processed" | "wait-receipt" | "no-wait" =
    "wait-effectstream-processed",
  batcherTarget: string | undefined = undefined,
): Promise<{
  success: boolean;
  type: "batcher";
  message: string;
  blockNumber: number;
  blockHash: string;
  rollup: number;
}> {
  if (!effectstreamConfig.batcherURL) {
    throw new Error("Batcher URL is not set");
  }

  const conciseDataStr = JSON.stringify(conciseData);
  // Send a batched message.
  const timestamp = Date.now().toString();
  const signature = await wallet.provider.signMessage(
    createMessageForBatcher(
      effectstreamConfig.securityNamespace,
      timestamp,
      wallet.provider.getAddress().address,
      wallet.provider.getAddress().type,
      conciseDataStr,
      batcherTarget,
    ),
  );

  const response = await fetch(
    `${effectstreamConfig.batcherURL}/send-input`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          target: batcherTarget,
          addressType: wallet.provider.getAddress().type,
          address: wallet.provider.getAddress().address,
          signature,
          input: conciseDataStr,
          timestamp,
        },
        confirmationLevel: waitForConfirmation,
      }),
    },
  );

  return await {
    ...(await (response.json() as Promise<{
      success: boolean;
      message: string;
      blockNumber: number;
      blockHash: string;
      rollup: number;
    }>)),
    type: "batcher",
    success: response.ok,
  };
}
