import { walletLogin, WalletMode } from "@paimaexample/wallets";
import { hardhat } from "viem/chains";
import { createWalletClient, custom } from "viem";
import { createPublicClient, http } from "viem";
// import { mct_erc1155 } from "@multi-chain-transfer/evm-contracts";
const mct_erc1155 = {
  abi: [],
}

import * as Eip1155Interact from "./eip-1155-interact.ts";

const EVM_CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

export async function loginEVM() {
  const result = await walletLogin({
    mode: WalletMode.EvmInjected,
    chain: hardhat,
    preferBatchedMode: false,
  });

  if (!result.success) throw new Error("Cannot login");
  const wallet = result.result;

  const client = createWalletClient({
    chain: hardhat,
    transport: custom({
      async request({ method, params }: any) {
        const response = await (wallet.provider as any).conn.api.request({
          method,
          params,
        });
        return response;
      },
    }),
  });

  return { wallet, client };
}

export async function loginMidnight() {
  const result = await walletLogin({
    mode: WalletMode.Midnight,
  });

  if (!result.success) throw new Error("Cannot login");
  const paimaWallet = result.result;

  const { injectedWallet, providers } =
    await Eip1155Interact.connectMidnightWallet(
      (paimaWallet.provider as any).conn.api
    );
  const state: any = await injectedWallet.state();
  const addr = state.address;

  const {
    contract,
    state: state2,
    contractAddress,
  } = await Eip1155Interact.connectToContract(providers);
  const data = {
    addr,
    contract,
    contractAddress,
    state,
    state2,
    wallet: injectedWallet,
  };

  return data;
}

export async function midnight_balanceOf(contract: any, addr: string) {
  try {
    console.log("Balance of", contract, addr);
    return await Eip1155Interact.balanceOf(contract, addr);
  } catch (error) {
    console.error(0, { error });
  }
}

export async function midnight_mint(
  contract: any,
  addr: string,
  amount: bigint
) {
  try {
    return await Eip1155Interact.mint(contract, addr, amount);
  } catch (error) {
    console.error(1, { error });
  }
}

export async function midnight_transferToEVM(
  contract: any,
  addr: string,
  targetAddress: string,
  amount: bigint
) {
  try {
    const txHash = Math.random().toString(36);
    // txHass: ArrayBuffer of s bytes
    const txHashArrayBuffer = new ArrayBuffer(16);
    const txHashView = new Uint8Array(txHashArrayBuffer);
    txHashView.set(new TextEncoder().encode(txHash));
    return await Eip1155Interact.transferToEvm(
      contract,
      addr,
      targetAddress,
      amount,
      txHashView as any
    );
  } catch (error) {
    console.error(1, { error });
  }
}

export async function evm_balanceOf(address: `0x${string}`, tokenId: bigint) {
  const data = await publicClient.readContract({
    address: EVM_CONTRACT_ADDRESS,
    abi: mct_erc1155.abi,
    functionName: "balanceOf",
    args: [address, tokenId],
  });
  return data;
}

const publicClient = createPublicClient({
  chain: hardhat,
  transport: http(),
});

export async function evm_safeTransferFrom(
  client: any,
  wallet: any,
  to_addr: `0x${string}`,
  amount: string
) {
  const accounts = await client.getAddresses();
  const { request } = await publicClient.simulateContract({
    account: accounts[0],
    address: EVM_CONTRACT_ADDRESS,
    abi: mct_erc1155.abi,
    functionName: "safeTransferFrom",
    args: [wallet.walletAddress, to_addr, 1n, BigInt(amount), "0x"],
  });
  const _hast = await client.writeContract(request);
}

export async function evm_transferToMidnight(
  client: any,
  wallet: any,
  amount: bigint,
  midnightAddress: `0x${string}`
) {
  const accounts = await client.getAddresses();
  const txHash = Math.random().toString(36).substring(2, 15);
  const { request } = await publicClient.simulateContract({
    account: accounts[0],
    address: EVM_CONTRACT_ADDRESS,
    abi: mct_erc1155.abi,
    functionName: "transferToMidnight",
    args: [amount, midnightAddress, txHash],
  });
  const _hash = await client.writeContract(request);
}

export async function evm_mint(client: any, wallet: any, amount: bigint) {
  const accounts = await client.getAddresses();
  const { request } = await publicClient.simulateContract({
    account: accounts[0],
    address: EVM_CONTRACT_ADDRESS,
    abi: mct_erc1155.abi,
    functionName: "mint",
    args: [
      wallet.walletAddress,
      // 1n,
      amount,
      // "0x",
    ],
  });
  const _hash = await client.writeContract(request);
}

export async function evm_safeBatchTransferFrom(
  client: any,
  wallet: any,
  to_addr: `0x${string}`,
  ids: bigint[],
  amounts: bigint[]
) {
  console.log("start");
  const accounts = await client.getAddresses();
  const { request } = await publicClient.simulateContract({
    account: accounts[0],
    address: EVM_CONTRACT_ADDRESS,
    abi: mct_erc1155.abi,
    functionName: "safeBatchTransferFrom",
    args: [wallet.walletAddress, to_addr, ids, amounts, "0x"],
  });
  const _hast = await client.writeContract(request);
  console.log("end");
}
