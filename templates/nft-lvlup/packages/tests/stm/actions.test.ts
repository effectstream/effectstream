import { assertSQL } from "../helpers.ts";
import {
  createPublicClient,
  createWalletClient,
  http,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { contractAddressesEvmMain } from "@nft-lvlup/contracts-evm";
import type { Client } from "pg";

// Hardhat's well-known accounts #0 and #1.
export const wallet0 = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
export const wallet1 = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);

const effectstreamL2Abi = [
  {
    inputs: [{ name: "data", type: "bytes" }],
    name: "effectstreamSubmitGameInput",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const;

// CharacterNft.mint(_to, initialData) — the deployer (account #0) is owner and
// thus an implicit minter, so it can mint directly without a sale purchase.
const characterNftAbi = [
  {
    inputs: [
      { name: "_to", type: "address" },
      { name: "initialData", type: "string" },
    ],
    name: "mint",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// TypedNativeCharacterSale.buyCharacter(receiver, characterType) on the proxy.
const nativeSaleAbi = [
  {
    inputs: [
      { name: "receiverAddress", type: "address" },
      { name: "characterType", type: "uint8" },
    ],
    name: "buyCharacter",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
] as const;

function l2Address() {
  return contractAddressesEvmMain()
    .chain31337["EffectstreamL2Module#MyEffectstreamL2"];
}
function nftAddress() {
  return contractAddressesEvmMain().chain31337["Character#CharacterNft"];
}
function nativeSaleProxyAddress() {
  return contractAddressesEvmMain().chain31337["Character#NativeCharacterSaleProxy"];
}

const publicClient = createPublicClient({ chain: hardhat, transport: http() });

function walletClientFor(account: typeof wallet0) {
  return createWalletClient({ account, chain: hardhat, transport: http() });
}

// Submit a game input via the EffectstreamL2 contract. The sync node's EVM
// primitive parses the JSON payload into a grammar action.
export function submitInput(action: unknown[], account = wallet0) {
  return walletClientFor(account)
    .writeContract({
      address: l2Address(),
      abi: effectstreamL2Abi,
      functionName: "effectstreamSubmitGameInput",
      args: [toHex(JSON.stringify(action))],
    })
    .then((hash) => publicClient.waitForTransactionReceipt({ hash }));
}

// Mint a character NFT directly (owner mint). The ERC721 primitive observes the
// Transfer event and tracks ownership.
export function mintNft(to: `0x${string}`, initialData: string, account = wallet0) {
  return walletClientFor(account)
    .writeContract({
      address: nftAddress(),
      abi: characterNftAbi,
      functionName: "mint",
      args: [to, initialData],
    })
    .then((hash) => publicClient.waitForTransactionReceipt({ hash }));
}

// Buy a character through the native sale proxy (price is 1 wei).
const CHARACTER_TYPE_ENUM = {
  air: 0,
  earth: 1,
  fire: 2,
  water: 3,
  ether: 4,
} as const;
export function buyCharacter(
  to: `0x${string}`,
  type: keyof typeof CHARACTER_TYPE_ENUM,
  account = wallet0,
) {
  return walletClientFor(account)
    .writeContract({
      address: nativeSaleProxyAddress(),
      abi: nativeSaleAbi,
      functionName: "buyCharacter",
      args: [to, CHARACTER_TYPE_ENUM[type]],
      value: 1n,
    })
    .then((hash) => publicClient.waitForTransactionReceipt({ hash }));
}

// Token ids used across the tests (CharacterNft starts at id 1).
export const FIRE_TOKEN = 1; // bought through the native sale proxy
export const WATER_TOKEN = 2; // minted directly by the owner

// ---------------------------------------------------------------------------
// Contract suite: buying / minting a character NFT on-chain and the ERC721
// primitive tracking its ownership.
// ---------------------------------------------------------------------------
export async function saleAndOwnershipTest(db: Client) {
  // token 1: buy through the native sale proxy (exercises the real sale suite)
  await buyCharacter(wallet0.address, "fire");
  // token 2: owner mints directly
  await mintNft(wallet1.address, "water");

  await assertSQL(
    "ERC721 primitive tracks ownership of both tokens",
    db,
    `SELECT token_id, current_owner
       FROM primitives.erc721_ownership_view_nftlvlup_characternft
       WHERE token_id IN ('${FIRE_TOKEN}', '${WATER_TOKEN}')
       ORDER BY token_id`,
    (res) => res.rows.length >= 2,
    (res) =>
      String((res.rows[0] as any).token_id) === String(FIRE_TOKEN) &&
      (res.rows[0] as any).current_owner === wallet0.address.toLowerCase() &&
      String((res.rows[1] as any).token_id) === String(WATER_TOKEN) &&
      (res.rows[1] as any).current_owner === wallet1.address.toLowerCase(),
  );
}

// ---------------------------------------------------------------------------
// nftMint — the type-carrying L2 action records a character row.
// ---------------------------------------------------------------------------
export async function nftMintTest(db: Client) {
  // wallet0 mints a fire character (token 1); wallet1 mints a water one (token 2).
  await submitInput(["nftMint", FIRE_TOKEN, "fire"], wallet0);
  await submitInput(["nftMint", WATER_TOKEN, "water"], wallet1);

  await assertSQL(
    "nftMint: character row created with type and starting level 1",
    db,
    `SELECT address, nft_id, level, type FROM characters
       WHERE nft_id IN ('${FIRE_TOKEN}', '${WATER_TOKEN}') ORDER BY nft_id`,
    (res) => res.rows.length >= 2,
    (res) =>
      String((res.rows[0] as any).nft_id) === String(FIRE_TOKEN) &&
      (res.rows[0] as any).type === "fire" &&
      Number((res.rows[0] as any).level) === 1 &&
      (res.rows[0] as any).address === wallet0.address.toLowerCase() &&
      String((res.rows[1] as any).nft_id) === String(WATER_TOKEN) &&
      (res.rows[1] as any).type === "water" &&
      Number((res.rows[1] as any).level) === 1 &&
      (res.rows[1] as any).address === wallet1.address.toLowerCase(),
  );
}

// ---------------------------------------------------------------------------
// lvlUp — the owner levels up their character; level increments.
// ---------------------------------------------------------------------------
export async function lvlUpTest(db: Client) {
  // wallet0 levels its fire character twice → level 3.
  await submitInput(["lvlUp", FIRE_TOKEN], wallet0);
  await assertSQL(
    "lvlUp: owner's character level increments to 2",
    db,
    `SELECT level FROM characters WHERE nft_id = '${FIRE_TOKEN}' AND address = '${wallet0.address.toLowerCase()}'`,
    (res) => res.rows.length >= 1 && Number((res.rows[0] as any).level) >= 2,
    (res) => Number((res.rows[0] as any).level) === 2,
  );

  await submitInput(["lvlUp", FIRE_TOKEN], wallet0);
  await assertSQL(
    "lvlUp: a second level-up reaches level 3",
    db,
    `SELECT level FROM characters WHERE nft_id = '${FIRE_TOKEN}' AND address = '${wallet0.address.toLowerCase()}'`,
    (res) => res.rows.length >= 1 && Number((res.rows[0] as any).level) >= 3,
    (res) => Number((res.rows[0] as any).level) === 3,
  );
}

// ---------------------------------------------------------------------------
// lvlUp authorization — a non-owner cannot level up a character they don't own.
// ---------------------------------------------------------------------------
export async function lvlUpAuthTest(db: Client) {
  // wallet1 (owner of the water character, token 2) tries to level up wallet0's
  // fire character (token 1) — there is no (wallet1, token 1) row, so the STM
  // ignores it and the water character is unaffected. We assert the fire
  // character (still owned by wallet0) stays at level 3.
  await submitInput(["lvlUp", FIRE_TOKEN], wallet1);

  // Give the (no-op) action a beat to be processed, then confirm the fire
  // character is unchanged and no row got created for the wrong owner.
  await assertSQL(
    "lvlUp: a non-owner cannot level a character (no spurious row, level unchanged)",
    db,
    `SELECT
        (SELECT level FROM characters WHERE nft_id = '${FIRE_TOKEN}' AND address = '${wallet0.address.toLowerCase()}') AS owner_level,
        (SELECT COUNT(*) FROM characters WHERE nft_id = '${FIRE_TOKEN}' AND address = '${wallet1.address.toLowerCase()}') AS wrong_owner_rows`,
    (res) => res.rows.length >= 1 && (res.rows[0] as any).owner_level != null,
    (res) =>
      Number((res.rows[0] as any).owner_level) === 3 &&
      Number((res.rows[0] as any).wrong_owner_rows) === 0,
  );
}
