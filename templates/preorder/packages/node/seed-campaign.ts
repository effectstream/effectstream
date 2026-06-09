// One-shot dev/test seed: submits the initial `create-campaign` EffectstreamL2 input signed by the
// admin wallet (hardhat account #0 = the contract owner). The sync node ingests the on-chain event
// and the STM writes the deterministic offchain_* config tables. This replaces the former hardcoded
// `launchpadsData` seeding — the campaign now enters through the same deterministic path as any
// admin config change. Idempotent: re-running upserts the same campaign.
import { createWalletClient, createPublicClient, http, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import fs from "node:fs";
import path from "node:path";
import { seedCampaignConfig } from "./launchpad-config.ts";

const RPC = process.env["EVM_RPC"] || "http://localhost:8545";
// Hardhat account #0 — deployer + owner of the launchpad + EffectstreamL2 contracts.
const ADMIN_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const CAMPAIGN_ID = "test-launchpad-1";

const effectstreamL2Abi = [
  {
    inputs: [{ name: "data", type: "bytes" }],
    name: "effectstreamSubmitGameInput",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const;

async function main(): Promise<void> {
  const extraPath = path.resolve(
    import.meta.dirname!,
    "../contracts-evm/build/extra-addresses.json",
  );
  const extra = JSON.parse(fs.readFileSync(extraPath, "utf-8"));
  const l2 = extra.effectStreamL2 as `0x${string}`;
  const admin = String(extra.admin);
  const launchpad = String(extra.launchpadProxy);

  const account = privateKeyToAccount(ADMIN_PRIVATE_KEY);
  const walletClient = createWalletClient({ account, chain: hardhat, transport: http(RPC) });
  const publicClient = createPublicClient({ chain: hardhat, transport: http(RPC) });

  // The campaign `receiver` (its routing key) = the admin address; the frontend/tests pass this
  // address as the BuyItems `receiver` arg so the STM associates purchases with this campaign.
  const cfg = { ...seedCampaignConfig, launchpadAddress: launchpad, receiver: admin };
  const concise = ["create-campaign", CAMPAIGN_ID, JSON.stringify(cfg)];

  const hash = await walletClient.writeContract({
    address: l2,
    abi: effectstreamL2Abi,
    functionName: "effectstreamSubmitGameInput",
    args: [toHex(JSON.stringify(concise))],
    value: 0n,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log(
    `[seed-campaign] create-campaign submitted: campaign=${CAMPAIGN_ID} admin=${admin} receiver=${admin} tx=${hash}`,
  );
}

main().catch((e) => {
  console.error("[seed-campaign] failed:", e);
  process.exit(1);
});
