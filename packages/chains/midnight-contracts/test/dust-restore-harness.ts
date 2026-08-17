// 00009 Phase 1 — dust store/restore measurement harness.
//
// WHY THIS DOES NOT CALL `waitForDustFundsWithRetry`
// --------------------------------------------------
// That function takes ONE `networkId` and feeds it to both the wallet facade
// and the persistence layer. On a local stack the wallet must be `undeployed`
// (the node bakes that id into every transaction — an indexer configured for
// any other id refuses to ingest blocks at all, verified 2026-08-17), and on
// `undeployed` `saveDustState`/`loadDustState` deliberately no-op
// (dust-state.ts:55,83). So the batcher's real restore path is unreachable
// locally, full stop.
//
// The harness splits the two: the wallet gets `undeployed`, the persistence
// layer gets a named string. That is sound because dust sync is
// network-id-independent — `dust-wallet@4.2.0` `src/v1/Sync.ts:271-303`
// subscribes to `dustLedgerEvents` with an id cursor and no address or
// network argument, and the wallet filters events locally by secret key.
// What it measures is therefore the SDK's restore semantics, not the
// batcher wrapper's.
//
// Phase 2 note: `saveDustState`/`loadDustState` now check that the snapshot's
// own `networkId` matches the id they are keyed under, so the split above has
// to be declared explicitly via `snapshotNetworkId` — the harness is the one
// caller that legitimately wants them to differ. `HARNESS_BYPASS_VALIDATION=1`
// reads the file with no checks at all, which is how you still hand a
// deliberately-broken snapshot to `DustWallet.restore` and watch what it does.
//
// Usage (see test/README-dust-restore-harness.md):
//   bun test/dust-restore-harness.ts cold
//   bun test/dust-restore-harness.ts restore
import * as Rx from "rxjs";
import { readFileSync } from "node:fs";
import type { NetworkId } from "@midnightntwrk/wallet-sdk-abstractions";
import { buildWalletFacade } from "../src/get-wallet-info.ts";
import { getDustStatePath, loadDustState, saveDustState } from "../src/dust-state.ts";

const INDEXER = process.env.HARNESS_INDEXER ?? "http://127.0.0.1:38223/api/v4/graphql";
const INDEXER_WS = process.env.HARNESS_INDEXER_WS ?? "ws://127.0.0.1:38223/api/v4/graphql/ws";
const NODE = process.env.HARNESS_NODE ?? "http://127.0.0.1:42521";
const PROOF = process.env.HARNESS_PROOF ?? "http://127.0.0.1:47925";
// The wallet's network id must match the chain; the persistence key must not
// be "undeployed" or every save/load silently no-ops. See header.
const WALLET_NETWORK_ID = (process.env.HARNESS_WALLET_NETWORK_ID ?? "undeployed") as NetworkId.NetworkId;
const PERSIST_NETWORK_ID = process.env.HARNESS_PERSIST_NETWORK_ID ?? "harness-named";
/** The wallet id the snapshot body carries; see header for why they differ. */
const PERSIST_OPTIONS = { snapshotNetworkId: String(WALLET_NETWORK_ID) };
/** Skip every validity check, to measure what a bad snapshot does to restore. */
const BYPASS_VALIDATION = process.env.HARNESS_BYPASS_VALIDATION === "1";
const SEED = process.env.HARNESS_SEED ??
  "0000000000000000000000000000000000000000000000000000000000000001";
const STATE_DIR = process.env.HARNESS_STATE_DIR ?? "/tmp/es00009-dust-state";
// Long enough to reach the tip of a 128-event local log many times over;
// override upward when pointing at a real network.
const SETTLE_MS = Number(process.env.HARNESS_SETTLE_MS ?? 20_000);
// Stop early once the wallet reports complete — otherwise every run pays
// SETTLE_MS in full.
const COMPLETION_GAP = BigInt(process.env.HARNESS_COMPLETION_GAP ?? "50");

type ProgressSample = {
  atMs: number;
  appliedIndex: string;
  highestRelevantWalletIndex: string;
  isConnected: boolean;
  complete: boolean;
};

const bigintReplacer = (_k: string, v: unknown) => typeof v === "bigint" ? v.toString() : v;

async function run(mode: "cold" | "restore" | "inspect"): Promise<void> {
  const statePath = getDustStatePath(STATE_DIR, PERSIST_NETWORK_ID, SEED);
  const readSnapshot = (): string | null => {
    if (!BYPASS_VALIDATION) {
      return loadDustState(STATE_DIR, PERSIST_NETWORK_ID, SEED, PERSIST_OPTIONS);
    }
    try {
      return readFileSync(statePath, "utf-8");
    } catch {
      return null;
    }
  };

  if (mode === "inspect") {
    const raw = readSnapshot();
    if (!raw) {
      console.log(JSON.stringify({ mode, statePath, present: false }));
      return;
    }
    // Report the snapshot's shape WITHOUT the state blob — it is megabytes of
    // hex and the interesting part is which fields exist at all.
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    console.log(JSON.stringify({
      mode,
      statePath,
      present: true,
      bytes: raw.length,
      fields: Object.keys(parsed).sort(),
      offset: parsed.offset ?? null,
      networkId: parsed.networkId ?? null,
      protocolVersion: parsed.protocolVersion ?? null,
      stateHexLen: typeof parsed.state === "string" ? parsed.state.length : null,
    }, bigintReplacer));
    return;
  }

  // `cold` deliberately ignores any snapshot on disk; `restore` requires one.
  const cached = mode === "restore" ? readSnapshot() : null;
  if (mode === "restore" && !cached) {
    throw new Error(`restore mode needs a snapshot at ${statePath} — run \`cold\` first`);
  }

  const buildStartedAt = Date.now();
  const walletResult = await buildWalletFacade(
    { id: WALLET_NETWORK_ID, indexer: INDEXER, indexerWS: INDEXER_WS, node: NODE, proofServer: PROOF },
    SEED,
    WALLET_NETWORK_ID,
    "dust-only",
    cached,
    // Keep the aux wallets alive exactly as waitForDustFundsWithRetry does
    // for dust-only (gwi:567), so the harness does not accidentally measure a
    // configuration the batcher never runs.
    { stopAuxWalletsImmediately: false },
  );
  const builtAtMs = Date.now() - buildStartedAt;

  const dust = (walletResult.wallet as { dust: { state: Rx.Observable<any> } }).dust;

  // The FIRST emission after a restore is the resumed position before any new
  // event is applied — that is the number that proves resume-vs-genesis.
  const first = await Rx.firstValueFrom(dust.state);
  const firstProgress = first?.state?.progress;
  const resumedAppliedIndex = String(firstProgress?.appliedIndex ?? "?");

  const samples: ProgressSample[] = [];
  const syncStartedAt = Date.now();
  let last: any = null;

  await Rx.firstValueFrom(
    (dust.state as Rx.Observable<any>).pipe(
      Rx.tap((ds: any) => {
        last = ds;
        const p = ds?.state?.progress;
        if (!p) return;
        samples.push({
          atMs: Date.now() - syncStartedAt,
          appliedIndex: String(p.appliedIndex),
          highestRelevantWalletIndex: String(p.highestRelevantWalletIndex),
          isConnected: !!p.isConnected,
          complete: typeof p.isCompleteWithin === "function"
            ? p.isCompleteWithin(COMPLETION_GAP)
            : false,
        });
      }),
      Rx.filter((ds: any) =>
        typeof ds?.state?.progress?.isCompleteWithin === "function" &&
        ds.state.progress.isCompleteWithin(COMPLETION_GAP)
      ),
      // A wallet already at the tip of a quiet chain may never emit again, so
      // the timeout is a normal outcome, not a failure.
      Rx.timeout({ each: SETTLE_MS, with: () => Rx.of(null) }),
    ),
  );

  const syncMs = Date.now() - syncStartedAt;
  const finalProgress = last?.state?.progress;

  // `availableCoins` takes NO time argument, so generatedNow is evaluated at
  // DustLocalState.syncTime — the projection staleness this project is
  // chasing. `balance(t)` DOES take a time, so evaluating it at syncTime and
  // again at wall-clock now isolates the gap: same coins, two clocks.
  const coins = (last?.availableCoins ?? []) as Array<{ generatedNow?: bigint }>;
  const syncTime: Date | undefined = last?.state?.state?.syncTime;
  const balanceAt = (t: Date): string => {
    try {
      const b = last?.balance?.(t);
      // Balance is a token->amount map in the SDK; sum whatever it yields.
      if (b == null) return "n/a";
      const vals = b instanceof Map ? [...b.values()] : Object.values(b as Record<string, unknown>);
      return String(vals.reduce((a: bigint, v) => a + (typeof v === "bigint" ? v : 0n), 0n));
    } catch (e) {
      return `err:${e instanceof Error ? e.message : String(e)}`;
    }
  };

  const serialized: string = await (walletResult.wallet as any).dust.serializeState();
  const savedTo = saveDustState(
    STATE_DIR,
    PERSIST_NETWORK_ID,
    SEED,
    serialized,
    PERSIST_OPTIONS,
  );

  console.log(JSON.stringify({
    mode,
    statePath,
    savedTo,
    buildMs: builtAtMs,
    syncMs,
    resumedAppliedIndex,
    finalAppliedIndex: String(finalProgress?.appliedIndex ?? "?"),
    highestRelevantWalletIndex: String(finalProgress?.highestRelevantWalletIndex ?? "?"),
    isConnected: !!finalProgress?.isConnected,
    // The whole point: how many events this process had to apply.
    eventsReplayed: String(
      (finalProgress?.appliedIndex ?? 0n) - BigInt(resumedAppliedIndex === "?" ? 0 : resumedAppliedIndex),
    ),
    emissions: samples.length,
    firstEmissions: samples.slice(0, 5),
    dustCoins: coins.length,
    // What the batcher's spendability gate actually sees (adapter:1462-1463).
    dustGeneratedNowTotal: String(coins.reduce((a, c) => a + (c.generatedNow ?? 0n), 0n)),
    // The projection gap, made explicit.
    syncTime: syncTime instanceof Date ? syncTime.toISOString() : String(syncTime),
    wallClockNow: new Date(Date.now()).toISOString(),
    balanceAtSyncTime: syncTime instanceof Date ? balanceAt(syncTime) : "n/a",
    balanceAtWallClock: balanceAt(new Date(Date.now())),
    snapshotBytes: serialized.length,
  }, bigintReplacer));

  await walletResult.wallet.stop();
}

const mode = (process.argv[2] ?? "cold") as "cold" | "restore" | "inspect";
if (!["cold", "restore", "inspect"].includes(mode)) {
  throw new Error(`unknown mode ${mode} — use cold | restore | inspect`);
}
await run(mode);
// The SDK keeps indexer sockets and Effect fibers alive past wallet.stop();
// without this the harness hangs after printing its result.
process.exit(0);
