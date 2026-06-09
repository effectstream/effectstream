import {
  createWalletClient,
  createPublicClient,
  http,
  toHex,
  type Address,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { EVM_RPC, ADMIN_PRIVATE_KEY } from "../config.ts";

// Admin commands are submitted on-chain to the EffectstreamL2 contract; the sync node ingests the
// event and the STM authorizes by checking the signer == the configured admin. Mirrors the
// concise-input encoding used by buy flows: toHex(JSON.stringify([prefix, ...stringArgs])).
const effectstreamL2Abi = [
  {
    inputs: [{ name: "data", type: "bytes" }],
    name: "effectstreamSubmitGameInput",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const;

export function adminAddress(): Address {
  return privateKeyToAccount(ADMIN_PRIVATE_KEY).address;
}

export async function getAdminBalance(): Promise<bigint> {
  const pub = createPublicClient({ chain: hardhat, transport: http(EVM_RPC) });
  return pub.getBalance({ address: adminAddress() });
}

function createAdminWalletClient(): WalletClient {
  const account = privateKeyToAccount(ADMIN_PRIVATE_KEY);
  return createWalletClient({ account, chain: hardhat, transport: http(EVM_RPC) });
}

async function submitL2Input(l2: Address, concise: string[]): Promise<{ txHash: string }> {
  const wallet = createAdminWalletClient();
  const pub = createPublicClient({ chain: hardhat, transport: http(EVM_RPC) });
  const hash = await wallet.writeContract({
    address: l2,
    abi: effectstreamL2Abi,
    functionName: "effectstreamSubmitGameInput",
    args: [toHex(JSON.stringify(concise))],
    value: 0n,
  });
  await pub.waitForTransactionReceipt({ hash });
  return { txHash: hash };
}

export function createCampaign(l2: Address, campaignId: string, config: unknown) {
  return submitL2Input(l2, ["create-campaign", campaignId, JSON.stringify(config)]);
}

export function setProduct(l2: Address, campaignId: string, product: unknown) {
  return submitL2Input(l2, ["set-product", campaignId, JSON.stringify(product)]);
}

export function endCampaign(l2: Address, campaignId: string) {
  return submitL2Input(l2, ["end-campaign", campaignId]);
}

export function setCoin(l2: Address, coin: unknown) {
  return submitL2Input(l2, ["set-coin", JSON.stringify(coin)]);
}

// Post-sale: enqueue NFT mints for every item each buyer owns (campaign must be ended).
// The sync node's dispatcher then submits each to the batcher, which performs the mint.
export function mintNfts(l2: Address, campaignId: string) {
  return submitL2Input(l2, ["mint-nfts", campaignId]);
}
