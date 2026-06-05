// Post-sale NFT minting: end-campaign -> mint-nfts (admin, on-chain via EffectstreamL2)
// -> STM enqueues nft_mints -> nft-dispatch worker submits to the batcher -> batcher mints
// PreorderItemNft to each buyer. Verifies the gate (non-admin / not-ended rejected), the
// enqueue, the on-chain mint, and the API. Runs LAST in Phase B (it ends the campaign).
import { assert, assertSQL, getDeployedAddresses, mineBlock } from "../helpers.ts";
import type { Client } from "pg";
import { createPublicClient, createWalletClient, http, parseAbi, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const L2_ABI = parseAbi(["function effectstreamSubmitGameInput(bytes data) payable"]);
const NFT_ABI = parseAbi(["function ownerOf(uint256 tokenId) view returns (address)"]);

// Account #0 is the configured admin (deployer) in PR #753.
const ADMIN_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
// Account #2 — a non-admin.
const NON_ADMIN_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

const SLUG = "test-launchpad-1";
const RPC = "http://localhost:8545";
const API = `http://localhost:${process.env["EFFECTSTREAM_API_PORT"] || "9999"}`;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function adminMintTest(db: Client) {
  const addresses = getDeployedAddresses();
  if (!addresses?.effectStreamL2 || !addresses?.itemNft) {
    console.log("Warning: missing effectStreamL2/itemNft addresses, skipping admin-mint test");
    return;
  }
  const pub = createPublicClient({ chain: foundry, transport: http(RPC) });
  const adminW = createWalletClient({ account: privateKeyToAccount(ADMIN_KEY), chain: foundry, transport: http(RPC) });
  const nonAdminW = createWalletClient({ account: privateKeyToAccount(NON_ADMIN_KEY), chain: foundry, transport: http(RPC) });

  const submit = async (wallet: typeof adminW, concise: unknown[]) => {
    const hash = await wallet.writeContract({
      address: addresses.effectStreamL2!,
      abi: L2_ABI,
      functionName: "effectstreamSubmitGameInput",
      args: [toHex(JSON.stringify(concise))],
    });
    await pub.waitForTransactionReceipt({ hash });
    await mineBlock();
  };

  // ── Negative: non-admin cannot enqueue mints ──────────────────────────
  await submit(nonAdminW, ["mint-nfts", SLUG]);
  await delay(6000);
  await assert("admin-mint: non-admin enqueues nothing", async () => {
    const r = await db.query("SELECT COUNT(*)::int AS c FROM nft_mints");
    return Number(r.rows[0].c) === 0;
  });

  // ── Negative: admin cannot mint while the campaign is still active ─────
  await submit(adminW, ["mint-nfts", SLUG]);
  await delay(6000);
  await assert("admin-mint: rejected while campaign active", async () => {
    const r = await db.query("SELECT COUNT(*)::int AS c FROM nft_mints");
    return Number(r.rows[0].c) === 0;
  });

  // ── End the campaign ──────────────────────────────────────────────────
  await submit(adminW, ["end-campaign", SLUG]);
  await assertSQL(
    "admin-mint: campaign ended",
    db,
    `SELECT status FROM offchain_campaigns WHERE slug = '${SLUG}'`,
    (rows) => rows.length > 0 && (rows[0] as any).status === "ended",
    (rows) => (rows[0] as any).status === "ended",
  );

  // ── Positive: admin enqueues mints ────────────────────────────────────
  await submit(adminW, ["mint-nfts", SLUG]);
  await assertSQL(
    "admin-mint: EVM mint jobs enqueued",
    db,
    `SELECT * FROM nft_mints WHERE chain = 'evm'`,
    (rows) => rows.length > 0,
    (rows) => rows.length > 0,
  );

  // ── Worker -> batcher mints the NFTs ──────────────────────────────────
  const minted = await assertSQL(
    "admin-mint: NFTs minted via batcher",
    db,
    `SELECT * FROM minted_nfts WHERE chain = 'evm' ORDER BY token_id`,
    (rows) => rows.length > 0,
    (rows) => (rows as any[]).every((r) => r.tx_hash && r.token_id),
  );

  await assertSQL(
    "admin-mint: EVM jobs resolve (minted, none failed)",
    db,
    `SELECT status, COUNT(*)::int AS c FROM nft_mints WHERE chain = 'evm' GROUP BY status`,
    (rows) => (rows as any[]).some((r) => r.status === "minted"),
    (rows) => !(rows as any[]).some((r) => r.status === "failed"),
  );

  // ── On-chain ownership reflects the mint ──────────────────────────────
  await assert("admin-mint: buyer owns minted NFT on-chain", async () => {
    const row = minted[0] as any;
    const owner = (await pub.readContract({
      address: addresses.itemNft!,
      abi: NFT_ABI,
      functionName: "ownerOf",
      args: [BigInt(row.token_id)],
    })) as string;
    return owner.toLowerCase() === String(row.wallet).toLowerCase();
  });

  // ── API ───────────────────────────────────────────────────────────────
  await assert("admin-mint: /api/nfts returns buyer NFTs", async () => {
    const row = minted[0] as any;
    const res = await fetch(`${API}/api/nfts/${SLUG}?wallet=${row.wallet}`);
    const body = await res.json();
    return res.ok && Array.isArray(body.nfts) && body.nfts.length > 0;
  });

  await assert("admin-mint: /api/admin/status reports nft mints", async () => {
    const res = await fetch(`${API}/api/admin/status/${SLUG}`);
    const body = await res.json();
    return res.ok && (body.nftMintSummary?.minted ?? 0) > 0;
  });

  // ── Cardano (Phase B): the worker routes cardano jobs to the batcher's Cardano adapter,
  //    which mints a native-policy NFT and delivers it to the buyer. Slower than EVM (the
  //    first mint funds a fresh server wallet via the faucet), so poll with a long deadline.
  await assert("admin-mint: Cardano NFTs minted via batcher", async () => {
    const start = Date.now();
    while (Date.now() - start < 240_000) {
      const r = await db.query("SELECT COUNT(*)::int AS c FROM minted_nfts WHERE chain = 'cardano'");
      if (Number(r.rows[0].c) > 0) return true;
      const f = await db.query("SELECT COUNT(*)::int AS c FROM nft_mints WHERE chain = 'cardano' AND status = 'failed'");
      if (Number(f.rows[0].c) > 0) {
        const e = await db.query("SELECT error FROM nft_mints WHERE chain = 'cardano' AND status = 'failed' LIMIT 1");
        console.error("[admin-mint] cardano mint failed:", e.rows[0]?.error);
        return false;
      }
      await delay(3000);
    }
    return false;
  });

  // The Cardano buyer is recorded by payment-key-hash; confirm /api/nfts returns their NFTs by
  // that pkh (the lookup the buyer "My Purchases" view uses for Cardano).
  await assert("admin-mint: /api/nfts returns Cardano buyer NFTs (by pkh)", async () => {
    const r = await db.query("SELECT wallet FROM minted_nfts WHERE chain = 'cardano' LIMIT 1");
    const pkh = r.rows[0]?.wallet;
    if (!pkh) return false;
    const res = await fetch(`${API}/api/nfts/${SLUG}?wallet=${pkh}`);
    const body = await res.json();
    return res.ok && Array.isArray(body.nfts) && body.nfts.some((n: any) => n.chain === "cardano");
  });
}
