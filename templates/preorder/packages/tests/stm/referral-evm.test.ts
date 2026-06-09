import { assert, assertSQL, getDeployedAddresses, mineBlock } from "../helpers.ts";
import type { Client } from "pg";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const LAUNCHPAD_ABI = parseAbi([
  "function buyItemsNative(address receiver, address referrer, uint256[] itemsIds, uint256[] itemsQuantities) payable",
]);

// Hardhat account #6 (buyer) and account #5 (referrer) — distinct from the campaign receiver (#0).
const BUYER_PK = "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e";
const REFERRER = "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc" as `0x${string}`;

export async function referralEvmTest(db: Client) {
  const account = privateKeyToAccount(BUYER_PK);
  const walletClient = createWalletClient({ account, chain: foundry, transport: http("http://localhost:8545") });
  const publicClient = createPublicClient({ chain: foundry, transport: http("http://localhost:8545") });

  const addresses = getDeployedAddresses();
  if (!addresses) {
    console.log("Warning: No deployed addresses, skipping EVM referral test");
    return;
  }

  // Item 5 (Healing Potion) P=2 → ETH amount = 2 * 5e14 = 1e15 wei. Referrer reward = 5% = 5e13.
  await assert("Referred purchase emits ReferrerReward on-chain", async () => {
    const hash = await walletClient.writeContract({
      address: addresses.launchpadProxy,
      abi: LAUNCHPAD_ABI,
      functionName: "buyItemsNative",
      args: [addresses.admin, REFERRER, [5n], [1n]],
      value: 1000000000000000n,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt.status === "success";
  });

  await mineBlock();

  await assertSQL(
    "Referral reward captured in referral_rewards",
    db,
    `SELECT * FROM referral_rewards WHERE chain = 'evm' AND referrer = '${REFERRER.toLowerCase()}'`,
    (rows) => rows.length > 0,
    (rows) => BigInt((rows[0] as any).amount) === 50000000000000n, // 1e15 * 500 / 10000
  );
}
