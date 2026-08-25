# dust-restore-harness

Measures what a batcher restart actually costs: how far a restored dust wallet
resumes, how many indexer events it must replay, and how stale its dust
projection is. Written for project 00009 Phase 1; kept because Phase 3 needs
the same numbers against preprod, where they are finally meaningful.

## Why it bypasses `waitForDustFundsWithRetry`

That function takes **one** `networkId` and hands it to both the wallet facade
and the persistence layer. Those two want different values on a local stack:

- the wallet must be `undeployed`, because the node bakes that id into every
  transaction — an indexer configured for any other id refuses to ingest
  blocks at all and exits (`invalid network ID - expect 'testnet' found
  'undeployed'`, verified 2026-08-17);
- the persistence layer must **not** be `undeployed`, because
  `saveDustState`/`loadDustState` no-op on it by design (`dust-state.ts:55`,
  `:83`) so chain resets cannot resurrect stale state.

So the batcher's real restore path is unreachable on any local stack. The
harness splits the two ids instead. That is sound because dust sync is
network-id-independent: `wallet-sdk-dust-wallet@4.2.0` `src/v1/Sync.ts:271-303`
subscribes to `dustLedgerEvents` with an id cursor and no address or network
argument, and the wallet filters events locally by secret key. Network id
affects only address encoding and the value stored in `CoreWallet.networkId`.

**What it therefore measures is the SDK's restore semantics, not the batcher
wrapper's.** Wrapper behaviour is covered by the call-site inventory in
`plans/00009-phase1-brief.md` §1 and by `test/dust-state.test.ts`.

## Running

Needs a node + indexer. Docker only, random host ports above 10000 — this is a
shared machine and a **native** `midnight-node` owned by another project holds
9944/30333. Check with `ss -ltn | grep -E ':9944|:30333'` before starting
anything, and never run the orchestrator's `launchMidnight`: its
`stopProcessAtPort: [9944, 8088, 6300, 30333]` would kill that node.

```bash
bun test/dust-restore-harness.ts cold      # ignore any snapshot, sync from 0, save
bun test/dust-restore-harness.ts restore   # restore the snapshot, measure the resume
bun test/dust-restore-harness.ts inspect   # dump snapshot shape without the state blob
```

| Env var | Default | Notes |
| --- | --- | --- |
| `HARNESS_INDEXER` / `HARNESS_INDEXER_WS` | `127.0.0.1:38223` | point at preprod for real numbers |
| `HARNESS_NODE` / `HARNESS_PROOF` | `127.0.0.1:42521` / `47925` | |
| `HARNESS_WALLET_NETWORK_ID` | `undeployed` | must match the chain |
| `HARNESS_PERSIST_NETWORK_ID` | `harness-named` | must **not** be `undeployed` |
| `HARNESS_SEED` | dev seed `…0001` | |
| `HARNESS_STATE_DIR` | `/tmp/es00009-dust-state` | |
| `HARNESS_SETTLE_MS` | `20000` | raise a lot for a real network |
| `HARNESS_COMPLETION_GAP` | `50` | matches `DUST_COMPLETION_GAP` |

## Reading the output

`eventsReplayed` is the headline: `finalAppliedIndex - resumedAppliedIndex`.
A working restore makes it ~0; a full replay makes it the whole log.
`syncTime` vs `wallClockNow` exposes the `generatedNow` projection gap — the
dust values the batcher's spendability gate sees are computed at `syncTime`,
which advances only when a dust event is applied.

Wall-clock (`syncMs`) is only meaningful on a chain with a long dust-event
log. A local dev chain has **128** dust events total and does not grow with
blocks (they come from the genesis `DistributeNight` transactions; dust
generation is a projection, not a per-block event), so local timings are
dominated by socket and Effect-runtime startup. Timing and the sync-knob sweep
belong on preprod.
