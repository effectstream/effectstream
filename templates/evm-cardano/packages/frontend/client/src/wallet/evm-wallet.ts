import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  type WalletClient,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { EVM_DEV_PRIVATE_KEY, EVM_RPC_URL } from "../config.ts";

const account = privateKeyToAccount(EVM_DEV_PRIVATE_KEY);

export const walletClient: WalletClient = createWalletClient({
  account,
  chain: hardhat,
  transport: http(EVM_RPC_URL),
});

export const publicClient: PublicClient = createPublicClient({
  chain: hardhat,
  transport: http(EVM_RPC_URL),
});

const erc721Abi = parseAbi([
  "function mint(address to, uint256 tokenId) external",
]);

let nextTokenId = BigInt(Math.floor(Date.now() / 1000));

export async function mintNft(
  contractAddress: string,
): Promise<{ txHash: string; tokenId: string }> {
  const tokenId = nextTokenId++;
  const hash = await walletClient.writeContract({
    address: contractAddress as `0x${string}`,
    abi: erc721Abi,
    functionName: "mint",
    args: [account.address, tokenId],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return { txHash: hash, tokenId: tokenId.toString() };
}

export function getEvmAddress(): string {
  return account.address;
}

export async function getEvmBlockNumber(): Promise<number> {
  const block = await publicClient.getBlockNumber();
  return Number(block);
}
