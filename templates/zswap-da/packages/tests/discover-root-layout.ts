// Empirically discover where the merkle_tree_root sits in a serialized
// ZswapInput, and prove the offer-side encoding equals the indexer's
// `zswapMerkleTreeRoot` hex byte-for-byte. Requires the local dev env up.
//
//   bun packages/tests/discover-root-layout.ts
//
// Strategy: make a real headless offer (its shielded input proves against a
// recent chain root), pull the indexer's recent per-tx zswapMerkleTreeRoot
// values, and search the input's serialized bytes for each. The match reveals
// the exact byte offset of the root in the Input AND confirms the encoding is
// directly comparable — the foundation for a verified byte-slice extractor.

import { Transaction } from "@midnight-ntwrk/ledger-v8";
import { decodeOffer } from "mip-zswap-offer";
import { Buffer } from "node:buffer";
import { buildWalletAndWaitForFunds } from "@effectstream/midnight-contracts";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";

const net = midnightNetworkConfig;
const INDEXER = net.indexer;

async function gql(query: string, variables?: unknown): Promise<any> {
  const r = await fetch(INDEXER, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  return await r.json();
}

async function main(): Promise<void> {
  // 1) Make a real proven offer (gives native, wants a foreign token).
  const result = await buildWalletAndWaitForFunds(
    {
      id: net.id, indexer: net.indexer, indexerWS: net.indexerWS,
      node: net.node, proofServer: net.proofServer,
    } as any,
    net.walletSeed,
    net.id as any,
  );
  const { wallet, zswapSecretKeys, dustSecretKey } = result;
  let serInput: Buffer;
  let nullifierHex: string;
  try {
    const state = await wallet.shielded.waitForSyncedState();
    const balances = state.balances as Record<string, bigint>;
    const give = Object.entries(balances).sort((a, b) => (a[1] < b[1] ? 1 : -1))[0]![0];
    const address = await wallet.shielded.getAddress();
    const recipe = await wallet.initSwap(
      { shielded: { [give]: 1_000_000n } },
      [{ type: "shielded", outputs: [{ type: "ff".repeat(32), amount: 5_000_000n, receiverAddress: address }] } as any],
      { shieldedSecretKeys: zswapSecretKeys, dustSecretKey },
      { ttl: new Date(Date.now() + 30 * 60_000), payFees: false },
    );
    const finalized = await wallet.finalizeTransaction(recipe.transaction);
    const tx = Transaction.deserialize("signature", "proof", "binding", finalized.serialize()) as any;
    const input = tx.guaranteedOffer.inputs[0];
    serInput = Buffer.from(input.serialize());
    nullifierHex = String(input.nullifier).replace(/^0x/, "").toLowerCase();
  } finally {
    await wallet.stop().catch(() => {});
  }

  const nulOff = serInput.indexOf(Buffer.from(nullifierHex, "hex"));
  console.log(`[discover] serInput=${serInput.length}B nullifier@${nulOff}`);

  // 2) Pull recent per-tx roots from the indexer.
  const latest = (await gql(`{ block { height } }`))?.data?.block?.height as number;
  const roots: { root: string; height: number }[] = [];
  for (let h = latest; h > Math.max(0, latest - 400) && roots.length < 200; h--) {
    const b = (await gql(
      `query($h:Int!){ block(offset:{height:$h}){ height transactions { __typename ... on RegularTransaction { zswapMerkleTreeRoot } } } }`,
      { h },
    ))?.data?.block;
    for (const t of b?.transactions ?? []) {
      if (t.zswapMerkleTreeRoot) roots.push({ root: t.zswapMerkleTreeRoot.replace(/^0x/, "").toLowerCase(), height: b.height });
    }
  }
  console.log(`[discover] collected ${roots.length} recent indexer roots (latest height ${latest})`);

  // 3) Find which recent root appears verbatim in the serialized input.
  let hit: { root: string; height: number; offset: number } | null = null;
  for (const r of roots) {
    const off = serInput.indexOf(Buffer.from(r.root, "hex"));
    if (off >= 0) { hit = { ...r, offset: off }; break; }
  }

  if (!hit) {
    console.log("[discover] ❌ NO recent indexer root found verbatim in the input.");
    console.log("[discover] → offer-root encoding differs from indexer hex; byte-slice comparison is NOT viable.");
    console.log("[discover] sample indexer root:", roots[0]?.root);
    console.log("[discover] input bytes after nullifier (hex, 96B):", serInput.slice(nulOff + 32, nulOff + 128).toString("hex"));
    process.exit(2);
  }

  // 4) Report the discovered layout.
  const rel = hit.offset - (nulOff + 32); // bytes between nullifier-end and root
  const markerByte = serInput[hit.offset - 1]; // SCALE marker should precede the value
  console.log("[discover] ✅ MATCH — root encoding == indexer hex");
  console.log(`[discover]   indexer root (height ${hit.height}): ${hit.root.slice(0, 24)}… (${hit.root.length / 2}B)`);
  console.log(`[discover]   found at input offset ${hit.offset}; nullifier-end+${rel} bytes`);
  console.log(`[discover]   byte preceding root value: 0x${markerByte?.toString(16)} (SCALE marker? 0x73 ⇒ 33B run)`);
  // Does the indexer hex already INCLUDE the marker (i.e. root starts at marker)?
  const markerOff = serInput.indexOf(Buffer.from("73" + hit.root, "hex"));
  console.log(`[discover]   indexer-hex-with-0x73-prefix present at: ${markerOff} (if >=0, indexer omits the SCALE marker)`);
  console.log(`[discover]   between nullifier-end and root value (hex): ${serInput.slice(nulOff + 32, hit.offset).toString("hex")}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error("[discover] FAILED:", e); process.exit(1); });
