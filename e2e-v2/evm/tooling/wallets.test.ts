import { assert } from "@e2e-v2/engine";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";

// Standard Hardhat test wallets
const wallets = [
  {
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const,
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const,
  },
  {
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const,
    privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const,
  },
] as const;

export async function walletsTest() {
  const publicClient = createPublicClient({
    chain: hardhat,
    transport: http(),
  });

  await assert("Default wallet 0 has ETH balance", async () => {
    const balance = await publicClient.getBalance({
      address: wallets[0].address,
    });
    return balance > 0n;
  });

  await assert("Default wallet 1 has ETH balance", async () => {
    const balance = await publicClient.getBalance({
      address: wallets[1].address,
    });
    return balance > 0n;
  });

  await assert("Can derive account from private key", async () => {
    const account = privateKeyToAccount(wallets[0].privateKey);
    return account.address.toLowerCase() === wallets[0].address.toLowerCase();
  });
}
