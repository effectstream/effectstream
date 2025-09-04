import { AddressType, type EvmAddress } from "@paima/utils";
import type { Wallet } from "./types.ts";
import type { IProvider } from "./IProvider.ts";
import { type Chain, numberToHex } from "viem";
import { utf8ToHex } from "web3-utils";
import type { EthersEvmProvider } from "./evm/ethers.ts";
import type { EvmInjectedProvider } from "./evm/injected.ts";
import type { AbiItem } from "web3-utils";
import { type TransactionReceipt, Web3 } from "web3";
import { createMessageForBatcher } from "@paima/concise";
import { BuiltinEvents, PaimaEventManager } from "@paima/event-client";

/**
 * This is main class used for setting up the Paima Engine
 * communication. It sets up the location of the Paima L2 Contact.
 */
export class PaimaEngineConfig {
  public appName: string;
  public paimaL2SyncProtocolName: string;
  public paimaL2ContractAddress: EvmAddress;
  public paimaL2Abi: AbiItem[];
  public paimaL2Chain: Chain;
  public paimaL2CurrentFee: bigint = 0n;
  public web3: Web3 | undefined = undefined;
  public batcherURL: string | undefined = undefined;

  constructor(
    appName: string | undefined,
    paimaL2SyncProtocolName: string,
    paimaL2ContractAddress: EvmAddress,
    paimaL2Chain: Chain,
    paimaL2Abi: AbiItem[] | undefined,
    batcherURL: string | undefined,
  ) {
    this.appName = appName ?? "";
    this.paimaL2SyncProtocolName = paimaL2SyncProtocolName;
    this.paimaL2ContractAddress = paimaL2ContractAddress;
    this.paimaL2Abi = paimaL2Abi ?? this.fallbackABI();
    this.paimaL2Chain = paimaL2Chain;
    this.batcherURL = batcherURL;
  }

  /** Return a Web3 client for the PaimaL2 chain. */
  public async getWeb3Client(): Promise<Web3> {
    if (this.web3) {
      return this.web3;
    }
    this.web3 = new Web3(this.paimaL2Chain.rpcUrls.default.http[0]);
    await this.web3.eth.getNodeInfo();
    return this.web3;
  }

  /** Return a Paima L2 Contract Instance for the PaimaL2. */
  public async getPaimaL2Contract() {
    const web3 = await this.getWeb3Client();
    return new web3.eth.Contract(this.paimaL2Abi, this.paimaL2ContractAddress);
  }

  private fallbackABI(): AbiItem[] {
    return [
      {
        inputs: [{ name: "data", type: "bytes" }],
        name: "paimaSubmitGameInput",
        outputs: [],
        stateMutability: "payable",
        type: "function",
      },
    ] as const;
  }
}

/**
 * Paima Wallet Interface - Sign a message with a wallet.
 * @param wallet - The wallet to sign the message with.
 * @param message - The message to sign.
 * @returns
 */
export async function signMessage(wallet: Wallet, message: string) {
  const signature = await wallet.provider.signMessage(message);
  return signature;
}

/**
 * Paima Wallet Interface - Send a transaction to a Paima L2 contract with a wallet.
 * The concise data must match the grammar; if not the input will be rejected by Paima Engine.
 * @param wallet - The wallet to send the transaction with.
 * @param conciseData - The concise data to send.
 * @param paimaEngineConfig - The Paima Engine configuration.
 * @param waitForConfirmation - The confirmation mode to use:
 *   no-wait: Do not wait for any confirmation.
 *   wait-receipt: Wait only for the chain transaction receipt.
 *   wait-paima-processed: Wait for the transaction to be processed by the Paima Engine.
 ** @returns
 */
export async function sendTransaction(
  wallet: Wallet,
  // TODO this should be any type of grammar.
  conciseData: any[],
  paimaEngineConfig: PaimaEngineConfig,
  waitForConfirmation: "wait-paima-processed" | "wait-receipt" | "no-wait" =
    "wait-paima-processed",
) {
  // TODO: Where to get this value from?
  const DEFAULT_GAS_PRICE = BigInt("61000000000");

  const provider: IProvider<unknown> = wallet.provider;
  const addressAndType = provider.getAddress();

  // NOTE: If the Paima L2 contract interface is implemented in other chains,
  //       we need to add support for them here. Paima L2 is EVM only for now.
  if (addressAndType.type !== AddressType.EVM) {
    throw new Error("Paima L2 is EVM contract.");
  }

  const evmProvider = wallet.provider as
    | EthersEvmProvider
    | EvmInjectedProvider;

  const hexData = utf8ToHex(JSON.stringify(conciseData));
  const paimaL2Contract = await paimaEngineConfig.getPaimaL2Contract();

  const txData = paimaL2Contract.methods["paimaSubmitGameInput"](hexData)
    .encodeABI();
  const tx = {
    from: addressAndType.address,
    data: txData,
    to: paimaEngineConfig.paimaL2ContractAddress,
    gasPrice: numberToHex(DEFAULT_GAS_PRICE),
    value: numberToHex(paimaEngineConfig.paimaL2CurrentFee),
  };
  const tx_result = await evmProvider.sendTransaction(tx);

  if (
    waitForConfirmation === "no-wait" || waitForConfirmation === "wait-receipt"
  ) {
    return tx_result;
  }

  // Wait for paima engine to process the transaction
  const receipt = await getTxReceipt(tx_result.txHash, paimaEngineConfig);

  await waitForPaimaEngineBlockProcessed(
    Number(receipt.blockNumber),
    paimaEngineConfig,
  );
  return serializeBigInts(receipt);
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
  paimaEngineConfig: PaimaEngineConfig,
): Promise<TransactionReceipt> {
  const web3 = await paimaEngineConfig.getWeb3Client();
  return await web3.eth.getTransactionReceipt(txHash);
}

/** 
 * Wait for specific block number to be processed by the Paima Engine.
 * This guarantees that the block number is processed by the Paima Engine.
 * @param blockNumber - The block number to wait for.
 * @param paimaEngineConfig - The Paima Engine configuration.
 * @param timeout (optional) - The timeout in milliseconds.
 * @returns
 */
export function waitForPaimaEngineBlockProcessed(
  blockNumber: number,
  paimaEngineConfig: PaimaEngineConfig,
  timeout: number = 60000,
): Promise<void> {
  let subscriptionReference: symbol | undefined = undefined;
  let latestBlock = 0;
  let timer: number | undefined = undefined;

  return Promise.race([
    new Promise<void>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Timeout")), timeout);
    }),
    new Promise<void>((resolve, reject) => {
      if (!paimaEngineConfig.paimaL2SyncProtocolName) {
        reject(new Error("Paima L2 Sync Protocol Name is not set"));
        return;
      }

      PaimaEventManager.Instance.subscribe(
        {
          topic: BuiltinEvents.SyncChains,
          filter: { chain: paimaEngineConfig.paimaL2SyncProtocolName, block: undefined },
        },
        (event) => {
          latestBlock = Math.max(event.block, latestBlock);
          if (latestBlock > blockNumber) {
            resolve(void 0);
          }
        },
      )
        .then((subscription) => subscriptionReference = subscription)
        .catch(reject);
    }),
  ]).finally(() => {
    if (subscriptionReference) {
      PaimaEventManager.Instance.unsubscribe(subscriptionReference);
    }
    if (timer) {
      clearTimeout(timer);
    }
  });
}

/**
 * Paima Wallet Interface - Standard batcher communication for a Paima L2 contract.
 * This is only a default implementation, your own batcher might have different requirements.
 * @param wallet - The wallet to send the batched transaction with.
 * @param paimaL2Address - The address of the Paima L2 contract.
 * @param conciseData - The concise data to send.
 * @param waitForConfirmation - The confirmation mode to use:
 *   no-wait: Do not wait for any confirmation.
 *   wait-receipt: Wait only for the chain transaction receipt.
 *   wait-paima-processed: Wait for the transaction to be processed by the Paima Engine.
 * @returns
 */
export async function sendBatcherTransaction(
  wallet: Wallet,
  // TODO we need to pass the batcher address here.
  conciseData: any[],
  paimaEngineConfig: PaimaEngineConfig,
  waitForConfirmation: "wait-paima-processed" | "wait-receipt" | "no-wait" =
    "wait-paima-processed",
) {
  if (!paimaEngineConfig.batcherURL) {
    throw new Error("Batcher URL is not set");
  }

  const conciseDataStr = JSON.stringify(conciseData);
  // Send a batched message.
  const timestamp = Date.now().toString();
  const signature = await wallet.provider.signMessage(
    createMessageForBatcher(
      paimaEngineConfig.appName,
      timestamp,
      wallet.provider.getAddress().address,
      wallet.provider.getAddress().type,
      conciseDataStr,
    ),
  );

  const response = await fetch(
    `${paimaEngineConfig.batcherURL}/send-input`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          addressType: wallet.provider.getAddress().type,
          userAddress: wallet.provider.getAddress().address,
          userSignature: signature,
          conciseInput: conciseDataStr,
          millisecondTimestamp: timestamp,
        },
        waitForConfirmation,
      }),
    },
  );
  return await response.json();
}
