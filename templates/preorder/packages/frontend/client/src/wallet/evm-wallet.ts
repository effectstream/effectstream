import {
  createWalletClient,
  createPublicClient,
  http,
  custom,
  type WalletClient,
  type PublicClient,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { LOCAL_PRIVATE_KEY, EVM_RPC } from "../config.ts";

const launchpadAbi = [
  {
    type: "function",
    name: "buyItemsNative",
    stateMutability: "payable",
    inputs: [
      { name: "receiver", type: "address" },
      { name: "referrer", type: "address" },
      { name: "itemsIds", type: "uint256[]" },
      { name: "itemsQuantities", type: "uint256[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "buyItemsErc20",
    stateMutability: "nonpayable",
    inputs: [
      { name: "paymentToken", type: "address" },
      { name: "paymentAmount", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "referrer", type: "address" },
      { name: "itemsIds", type: "uint256[]" },
      { name: "itemsQuantities", type: "uint256[]" },
    ],
    outputs: [],
  },
] as const;

const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export function createLocalWalletClient(): WalletClient {
  const account = privateKeyToAccount(LOCAL_PRIVATE_KEY);
  return createWalletClient({
    account,
    chain: hardhat,
    transport: http(EVM_RPC),
  });
}

export function createEvmPublicClient(): PublicClient {
  return createPublicClient({
    chain: hardhat,
    transport: http(EVM_RPC),
  });
}

export async function connectInjectedWallet(): Promise<WalletClient> {
  const w = window as any;
  if (!w.ethereum) throw new Error("No injected wallet found");
  const accounts = await w.ethereum.request({ method: "eth_requestAccounts" });
  return createWalletClient({
    account: accounts[0] as Address,
    chain: hardhat,
    transport: custom(w.ethereum),
  });
}

export async function buyItemsNative(
  walletClient: WalletClient,
  publicClient: PublicClient,
  launchpadAddress: Address,
  receiver: Address,
  referrer: Address,
  itemIds: bigint[],
  itemQuantities: bigint[],
  value: bigint,
): Promise<{ txHash: string }> {
  const hash = await walletClient.writeContract({
    address: launchpadAddress,
    abi: launchpadAbi,
    functionName: "buyItemsNative",
    args: [receiver, referrer, itemIds, itemQuantities],
    value,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return { txHash: hash };
}

export async function buyItemsErc20(
  walletClient: WalletClient,
  publicClient: PublicClient,
  launchpadAddress: Address,
  paymentToken: Address,
  paymentAmount: bigint,
  receiver: Address,
  referrer: Address,
  itemIds: bigint[],
  itemQuantities: bigint[],
): Promise<{ txHash: string }> {
  const approveHash = await walletClient.writeContract({
    address: paymentToken,
    abi: erc20Abi,
    functionName: "approve",
    args: [launchpadAddress, paymentAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });

  const hash = await walletClient.writeContract({
    address: launchpadAddress,
    abi: launchpadAbi,
    functionName: "buyItemsErc20",
    args: [paymentToken, paymentAmount, receiver, referrer, itemIds, itemQuantities],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return { txHash: hash };
}

export async function getErc20Balance(
  publicClient: PublicClient,
  token: Address,
  account: Address,
): Promise<bigint> {
  return publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account],
  }) as Promise<bigint>;
}

export async function mintMockUsdc(
  walletClient: WalletClient,
  publicClient: PublicClient,
  token: Address,
  to: Address,
  amount: bigint,
): Promise<void> {
  const hash = await walletClient.writeContract({
    address: token,
    abi: erc20Abi,
    functionName: "mint",
    args: [to, amount],
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

export { launchpadAbi, erc20Abi };
