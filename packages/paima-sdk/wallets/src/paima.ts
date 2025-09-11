import { AddressType, ENV } from "@paima/utils";
import type { Wallet } from "./types.ts";
import type { IProvider } from "./IProvider.ts";
import { numberToHex } from "npm:viem@^2.36.0";
import { utf8ToHex } from "web3-utils";
import type { EthersEvmProvider } from "./evm/ethers.ts";
import type { EvmInjectedProvider } from "./evm/injected.ts";
import type { AbiItem } from "web3-utils";
import { Web3 } from "web3";
import { createMessageForBatcher } from "@paima/concise";

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
 * @param paimaL2Address - The address of the Paima L2 contract.
 * @param conciseData - The concise data to send.
 * @returns 
 */
export async function sendTransaction(
  wallet: Wallet,
  // TODO we need to pass the chain as well.
  paimaL2Address: string,
  conciseData: any[]
) {
  async function initWeb3(nodeUrl: string): Promise<Web3> {
    const web3 = new Web3(nodeUrl);
    try {
      await web3.eth.getNodeInfo();
    } catch (e) {
      throw new Error(`Error connecting to node at ${nodeUrl}:\n${e}`);
    }
    return web3;
  }

  // TODO: Import this from the actual ABI package when available
  const paimaL2Abi: AbiItem[] = [
    {
      inputs: [{ name: "data", type: "bytes" }],
      name: "paimaSubmitGameInput",
      outputs: [],
      stateMutability: "payable",
      type: "function",
    },
  ] as const;

  // TODO:
  // We need to pass the correct chain here for the Paima L2 contract.
  async function getPaimaL2Contract(address: string) {  
    const web3 = await initWeb3("http://localhost:8545");
    return new web3.eth.Contract(paimaL2Abi, address);
  }

  // TODO: Where to get this value from?
  const DEFAULT_GAS_PRICE = BigInt("61000000000");

  const provider: IProvider<unknown> = wallet.provider;
  const addressAndType = provider.getAddress();

  // NOTE: If the Paima L2 interface is implemented in other chains, we need to add support for them here.
  if (addressAndType.type !== AddressType.EVM) {
    throw new Error("Paima L2 is EVM contract.");
  }

  const evmProvider: EthersEvmProvider | EvmInjectedProvider = wallet.provider as EthersEvmProvider | EvmInjectedProvider;
  const dataUtf8 = JSON.stringify(conciseData);
  const hexData = utf8ToHex(dataUtf8);

  const storage = await getPaimaL2Contract(paimaL2Address);
  const txData = storage.methods["paimaSubmitGameInput"](hexData).encodeABI();
  const tx = {
    from: addressAndType.address,
    data: txData,
    to: paimaL2Address,
    gasPrice: numberToHex(DEFAULT_GAS_PRICE),
    // We need to read the value from the Paima L2 contract.
    value: numberToHex(0),
  };
  const tx_result = await evmProvider.sendTransaction(tx);

  console.log("transaction result", tx_result);
  return tx_result;
}

/**
 * Paima Wallet Interface - Standard batcher communication for a Paima L2 contract.
 * This is only a default implementation, your own batcher might have different requirements.
 * @param wallet - The wallet to send the batched transaction with.
 * @param paimaL2Address - The address of the Paima L2 contract.
 * @param conciseData - The concise data to send.
 * @returns 
 */
export async function sendBatcherTransaction(
  wallet: Wallet,
  // TODO we need to pass the batcher address here.
  conciseData: any[]
) {

   // Send a batched message.
   const timestamp = Date.now().toString();
   const signature = await wallet.provider.signMessage(
    createMessageForBatcher(
      null,
      timestamp,
      wallet.provider.getAddress().address,
      wallet.provider.getAddress().type,
      JSON.stringify(conciseData),
    ),
  );
  await fetch(`http://localhost:${ENV.BATCHER_PORT}/send-input`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      addressType: wallet.provider.getAddress().type,
      userAddress: wallet.provider.getAddress().address,
      userSignature: signature,
      gameInput: JSON.stringify(conciseData),
      millisecondTimestamp: timestamp,
    }),
  });
}
