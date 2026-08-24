import { MidnightClient } from "../src/sync-protocols/midnight/MidnightClient.ts";
import { decodeTokenMints } from "../src/sync-protocols/midnight/mint-decoder.ts";
import { decodeZswapEvent } from "../src/sync-protocols/midnight/zswap-decoder.ts";

const PROTOCOL_VERSION = 2_000_000;
const endpoint = process.env.MIDNIGHT_INDEXER_URL;
const statePath = process.env.M4_STATE_FILE;
const requireResume = process.env.M4_REQUIRE_RESUME === "1";

if (!endpoint) throw new Error("MIDNIGHT_INDEXER_URL is required");
if (!statePath) throw new Error("M4_STATE_FILE is required");

const targets = new Map([
  ["490def5ca76143ef2c67af5665de25fa8eaeb76e98c6e2ab35b90441f0fe6fbc", "fund-genesis-to-alice"],
  ["2f29a5919f8b805251165889eb25f0ae4d356344e9468f08cff7316c382cb311", "fund-alice-to-bob-with-shielded-input"],
  ["1dac099bfd8f42f26fd911a036bab2993af9a6242f5aaf7411434db92c4a8f9e", "counter-deploy"],
  ["3c5cf6006b85bbd6fb88c9f900abb25a9e409d642f01cdcb5dac93dafd56c3af", "counter-increment"],
  ["16005a2328950dd914bd2ef2c10838cd033f9ff802ed4047cf6ffedcd4a40818", "counter-mint-shielded"],
  ["c570f6400d6799fe4934ac70b931430e68f255d4220a922954e7b4c4cff12d70", "counter-mint-unshielded"],
]);

type FollowState = {
  schemaVersion: 1;
  endpoint: string;
  runs: number;
  lastHeight: number;
  lastHash: string;
  seenTransactionHashes: string[];
  seenTargets: Record<string, number>;
  totals: Counters;
};

type Counters = {
  blocks: number;
  transactions: number;
  contractActions: number;
  zswapEvents: number;
  nullifiers: number;
  commitments: number;
  unshieldedSpends: number;
  unshieldedCreates: number;
  zswapRoots: number;
  tokenMints: number;
};

const client = new MidnightClient(endpoint, "undeployed", 30_000);
const prior = await readState(statePath);
if (requireResume && !prior) throw new Error("restart run requires an existing checkpoint");
if (!requireResume && prior) throw new Error("genesis run requires an empty checkpoint path");
if (prior && prior.endpoint !== endpoint) throw new Error("checkpoint endpoint changed");

if (prior) {
  const anchor = await client.fetchBlock(prior.lastHeight, {
    contractActions: false,
    zswapLedgerEvents: false,
  });
  assertProtocol(anchor.block.protocolVersion, `checkpoint block ${prior.lastHeight}`);
  if (anchor.block.hash !== prior.lastHash) {
    throw new Error(`checkpoint anchor mismatch at ${prior.lastHeight}: ${prior.lastHash} != ${anchor.block.hash}`);
  }
}

let latest = await client.fetchLatestBlock();
if (prior && latest.block.height <= prior.lastHeight) {
  for (let attempt = 0; attempt < 30 && latest.block.height <= prior.lastHeight; attempt++) {
    await Bun.sleep(1_000);
    latest = await client.fetchLatestBlock();
  }
  if (latest.block.height <= prior.lastHeight) {
    throw new Error(`indexer did not advance beyond restart checkpoint ${prior.lastHeight}`);
  }
}

const startHeight = prior ? prior.lastHeight + 1 : 0;
const endHeight = latest.block.height;
const seenHashes = new Set(prior?.seenTransactionHashes ?? []);
const seenTargets = { ...(prior?.seenTargets ?? {}) };
const delta = zeroCounters();
let lastHash = prior?.lastHash ?? "";

for (let height = startHeight; height <= endHeight; height++) {
  const response = await client.fetchBlock(height, {
    contractActions: true,
    zswapLedgerEvents: true,
    unshieldedSpentOutputs: true,
    unshieldedCreatedOutputs: true,
    zswapRoots: true,
    tokenMints: true,
  });
  const block = response.block;
  assertProtocol(block.protocolVersion, `block ${height}`);
  if (block.height !== height) throw new Error(`requested height ${height}, got ${block.height}`);
  delta.blocks++;
  lastHash = block.hash;

  for (const tx of block.transactions) {
    assertProtocol(tx.protocolVersion, `transaction ${tx.hash}`);
    if (seenHashes.has(tx.hash)) throw new Error(`duplicate transaction after restart: ${tx.hash}`);
    seenHashes.add(tx.hash);
    delta.transactions++;
    delta.contractActions += tx.contractActions.length;
    delta.unshieldedSpends += tx.unshieldedSpentOutputs?.length ?? 0;
    delta.unshieldedCreates += tx.unshieldedCreatedOutputs?.length ?? 0;
    if (tx.zswapMerkleTreeRoot) delta.zswapRoots++;

    for (const event of tx.zswapLedgerEvents ?? []) {
      assertProtocol(event.protocolVersion, `zswap event ${event.id}`);
      const decoded = decodeZswapEvent(event.raw);
      delta.zswapEvents++;
      if (decoded.kind === "nullifier") delta.nullifiers++;
      else delta.commitments++;
    }

    if (tx.raw && tx.transactionResult) {
      delta.tokenMints += decodeTokenMints(tx.raw, tx.transactionResult).length;
    }
    const target = targets.get(tx.hash);
    if (target) seenTargets[target] = height;
  }
}

if (!prior) {
  for (const target of targets.values()) {
    if (seenTargets[target] == null) throw new Error(`genesis follow missed target ${target}`);
  }
  if (delta.nullifiers < 2) throw new Error(`expected at least two nullifiers, got ${delta.nullifiers}`);
  if (delta.tokenMints < 2) throw new Error(`expected at least two token mints, got ${delta.tokenMints}`);
}

const state: FollowState = {
  schemaVersion: 1,
  endpoint,
  runs: (prior?.runs ?? 0) + 1,
  lastHeight: endHeight,
  lastHash,
  seenTransactionHashes: [...seenHashes],
  seenTargets,
  totals: addCounters(prior?.totals ?? zeroCounters(), delta),
};
await Bun.write(statePath, `${JSON.stringify(state, null, 2)}\n`);

console.log(JSON.stringify({
  mode: prior ? "restart-resume" : "genesis-follow",
  startHeight,
  endHeight,
  anchorHeight: prior?.lastHeight ?? null,
  anchorHash: prior?.lastHash ?? null,
  delta,
  cumulative: state.totals,
  targets: state.seenTargets,
  checkpoint: { runs: state.runs, lastHeight: state.lastHeight, lastHash: state.lastHash },
}, null, 2));

async function readState(path: string): Promise<FollowState | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  const parsed = await file.json() as FollowState;
  if (parsed.schemaVersion !== 1) throw new Error(`unsupported checkpoint schema ${parsed.schemaVersion}`);
  return parsed;
}

function assertProtocol(actual: number, context: string): void {
  if (actual !== PROTOCOL_VERSION) {
    throw new Error(`${context}: expected protocolVersion ${PROTOCOL_VERSION}, got ${actual}`);
  }
}

function zeroCounters(): Counters {
  return {
    blocks: 0,
    transactions: 0,
    contractActions: 0,
    zswapEvents: 0,
    nullifiers: 0,
    commitments: 0,
    unshieldedSpends: 0,
    unshieldedCreates: 0,
    zswapRoots: 0,
    tokenMints: 0,
  };
}

function addCounters(left: Counters, right: Counters): Counters {
  return Object.fromEntries(
    Object.keys(left).map((key) => [key, left[key as keyof Counters] + right[key as keyof Counters]]),
  ) as Counters;
}
