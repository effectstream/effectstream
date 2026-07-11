// Simple, dependency-free confirmation of the on-chain data the liveness checks
// rely on, run against a public Midnight indexer. No wallet/secrets needed — it
// only reads public block data + schema introspection.
//
//   bun packages/validator/scripts/check-preview-indexer.ts            # preview
//   bun packages/validator/scripts/check-preview-indexer.ts testnet    # other net
//
// It confirms: RegularTransaction.raw (full tx) and zswapMerkleTreeRoot exist
// and are populated; Block.timestamp exists; the spent-set sources
// (unshieldedSpentOutputs, zswapLedgerEvents) exist; and there is NO global
// serialized ledger/zswap *state* type (only per-contract state + a wallet-sync
// MerkleTreeCollapsedUpdate) — i.e. a validation-capable global ZswapChainState
// would have to be reconstructed.

const net = process.argv[2] ?? "preview";
const URL = `https://indexer.${net}.midnight.network/api/v3/graphql`;

async function gql(query: string, variables?: unknown) {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  return (await res.json()) as any;
}
const ok = (b: boolean) => (b ? "✅" : "❌");

console.log(`Indexer: ${URL}\n`);

// 1) RegularTransaction schema — the fields we read.
const rt = await gql(`{ __type(name:"RegularTransaction"){ fields(includeDeprecated:true){ name isDeprecated deprecationReason } } }`);
const fields: any[] = rt?.data?.__type?.fields ?? [];
const has = (n: string) => fields.some((f) => f.name === n);
console.log(`${ok(has("raw"))} RegularTransaction.raw (full serialized tx → reconstruct/deserialize)`);
console.log(`${ok(has("zswapMerkleTreeRoot"))} RegularTransaction.zswapMerkleTreeRoot (post-tx coin-tree root == past_roots entry)`);
const dep = fields.find((f) => f.name === "merkleTreeRoot");
if (dep?.isDeprecated) console.log(`   ↳ legacy alias 'merkleTreeRoot' is deprecated: "${dep.deprecationReason}"`);
console.log(`${ok(has("zswapLedgerEvents"))} RegularTransaction.zswapLedgerEvents (nullifier spends → spent_nullifiers)`);
console.log(`${ok(has("unshieldedSpentOutputs"))} RegularTransaction.unshieldedSpentOutputs (→ spent_unshielded)`);

// 2) Block.timestamp — needed for postBlockUpdate's root window.
const blk = await gql(`{ __type(name:"Block"){ fields { name } } }`);
const blkHas = (n: string) => (blk?.data?.__type?.fields ?? []).some((f: any) => f.name === n);
console.log(`${ok(blkHas("timestamp"))} Block.timestamp (postBlockUpdate window)`);

// 3) No global serialized ledger/zswap *state* type.
const all = await gql(`{ __schema { types { name kind } } }`);
const stateTypes = (all?.data?.__schema?.types ?? [])
  .filter((t: any) => /chainstate|ledgerstate|zswapstate/i.test(t.name) && !t.name.startsWith("__"))
  .map((t: any) => t.name);
console.log(`${ok(stateTypes.length === 0)} no global ZswapChainState/LedgerState type exposed${stateTypes.length ? " (found: " + stateTypes.join(",") + ")" : ""}`);
const qfields = (await gql(`{ __schema { queryType { fields { name } } } }`))?.data?.__schema?.queryType?.fields?.map((f: any) => f.name) ?? [];
const zswapQ = qfields.filter((n: string) => /zswap/i.test(n));
console.log(`   ↳ root zswap queries: ${zswapQ.join(", ") || "none"} (collapsed-tree update → wallet ZswapLocalState, not a tryApply-capable state)`);

// 4) Reconstruction correctness inputs: per-segment success + unshielded
//    existence sources.
console.log(`${ok(has("transactionResult"))} RegularTransaction.transactionResult (segments[].success — a state rebuild must skip failed segments)`);
console.log(`${ok(has("unshieldedCreatedOutputs"))} RegularTransaction.unshieldedCreatedOutputs (unshielded-existence source)`);
const utxo = await gql(`{ __type(name:"UnshieldedUtxo"){ fields { name } } }`);
const utxoFields = (utxo?.data?.__type?.fields ?? []).map((f: any) => f.name);
console.log(`${ok(utxoFields.includes("createdAtTransaction") && utxoFields.includes("spentAtTransaction"))} UnshieldedUtxo.createdAtTransaction + spentAtTransaction (existence + spent queryable)`);

// 5) Node RPC: only root digests, no full-state method.
try {
  const rpcUrl = `https://rpc.${net}.midnight.network`;
  const rpc = async (method: string) =>
    (await (await fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }) })).json()) as any;
  const midnightMethods: string[] = ((await rpc("rpc_methods"))?.result?.methods ?? []).filter((m: string) => /midnight/i.test(m));
  console.log(`\nRPC ${rpcUrl}`);
  console.log(`   midnight_* methods: ${midnightMethods.join(", ") || "(none listed)"}`);
  const fullState = midnightMethods.filter((m) => /state/i.test(m) && !/root/i.test(m) && !/contract/i.test(m));
  console.log(`${ok(fullState.length === 0)} no full-state RPC (only root digests + per-contract state)`);
  const root = await rpc("midnight_zswapStateRoot");
  console.log(`${ok(Array.isArray(root?.result))} midnight_zswapStateRoot returns a bare digest (${Array.isArray(root?.result) ? root.result.length + " bytes" : JSON.stringify(root?.error ?? root).slice(0, 60)})`);
} catch (e) {
  console.log(`RPC check skipped (${String(e).slice(0, 80)})`);
}

// 6) Root-check blocker, demonstrated at runtime: the installed ledger-v8
//    binding exposes ZswapInput.nullifier but NOT the input's merkleTreeRoot,
//    so a roots-set membership check has nothing to compare against.
const { ZswapInput } = await import("@midnight-ntwrk/ledger-v8");
const desc = (p: string) => !!Object.getOwnPropertyDescriptor((ZswapInput as any).prototype, p);
console.log(`\n${ok(desc("nullifier"))} ZswapInput.nullifier getter exists (binding pattern works)`);
console.log(`${ok(!desc("merkleTreeRoot"))} ZswapInput.merkleTreeRoot getter ABSENT — root-check blocker confirmed at runtime`);
console.log(`   ZswapInput.prototype: ${Object.getOwnPropertyNames((ZswapInput as any).prototype).join(", ")}`);

// 7) Show populated values from a recent block that has transactions.
const latest = (await gql(`{ block { height } }`))?.data?.block?.height;
const heights = Array.from({ length: 24 }, (_, i) => latest - i * 137);
const blocks = await Promise.all(
  heights.map((h) => gql(`query($h:Int!){ block(offset:{height:$h}){ height transactions { __typename ... on RegularTransaction { zswapMerkleTreeRoot raw transactionResult { status } } } } }`, { h })),
);
const hit = blocks.map((b) => b?.data?.block).find((b: any) => (b?.transactions?.length ?? 0) > 0);
console.log(`\nLatest height ${latest}.`);
if (hit) {
  const t = hit.transactions.find((x: any) => x.__typename === "RegularTransaction") ?? hit.transactions[0];
  console.log(`Populated block ${hit.height}: zswapMerkleTreeRoot=${t.zswapMerkleTreeRoot?.slice(0, 24)}… (len ${t.zswapMerkleTreeRoot?.length}), raw len ${t.raw?.length}, result=${t.transactionResult?.status}`);
} else {
  console.log("No transactions in the sampled blocks (this network is low-traffic) — fields confirmed via schema above.");
}
