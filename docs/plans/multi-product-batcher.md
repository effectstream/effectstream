# Re-implementation plan: one Midnight batcher, many products

Written 2026-08-06, after the first attempt (PRs #850 / #851, both closed).
The design held up; the *process* is what needs repeating differently. Nothing
below is speculative — every fact was paid for once already.

Read §1–§4 to build it. Read §5–§6 before writing a single test. Read §7 before
touching git.

---

## 1. Scope and locked decisions

Serving N products meant N batcher processes — N ports, N wallets, N things to
monitor. Goal: **one process hosts every product on a network**, without letting
products spend each other's dust or submit each other's transactions.

A **product** = `target` + adapter instance + wallet seed(s) + policy.

These were decided with Eddie and are **not open questions** — do not re-litigate:

| decision | choice |
|---|---|
| Authorization | **Static, content-based.** Operator declares per product what is valid: zswap transfers / allowlisted contracts / allowlisted circuits. No tokens, no client changes. |
| Queue | **One shared file.** "We cannot trust the source, and it's simpler and fair." |
| Networks | **One network per batcher process.** |
| Custom filter | Named `allowCustomFinalFilter`; runs **strictly after** the declarative rules; its verdict is final. |
| Helper sharing | Policy helpers **exported from the SDK** so custom filters use the same code the built-in rules are built from. |
| Demo | Three products under `templates/multi-batcher/product-{a,b,c}`; the batcher itself in `shared-batcher/`. |
| Test split | `/e2e/*` = fast CI guard only ("nothing broke"). `templates/*/tests` = deep/adversarial. |

### Accepted residual risk

Tokenless auth means anyone who can reach the port may submit a
*policy-conforming* transaction and have its fee sponsored. Policies are the
budget control (narrow the circuits, pin `allowedTokenTypes`, add a filter);
network ACLs go in front of anything public. **Say this in the README** — it is
the first thing a reviewer will ask.

---

## 2. Architecture

Queue is shared; **fee capacity is not**. Each product gets its own wallet,
worker pool and dust lanes, so one product running dry parks only its own queue.

```
POST /send-input {target}
        │
        ├─ size cap → deserialize → declarative rules → allowCustomFinalFilter
        │                                                (last, final, fail-closed)
        ▼
   shared JSONL queue          rows keyed by (target, payload)
        │
        ├── product-a → adapter A → wallet A → worker pool A → dust lanes A
        ├── product-b → adapter B → wallet B → worker pool B → dust lanes B
        └── product-c → adapter C → wallet C → worker pool C → dust lanes C
```

Policy is enforced **twice**: at intake, and again in `buildBatchData` before
any dust is spent — storage rows are untrusted and policy can tighten across a
restart. Therefore **filters must be deterministic**.

---

## 3. Build order

Each step is independently testable. Do them in this order; later steps depend
on earlier ones.

### A. `packages/batcher/adapters/midnight-policy.ts` (new)

Shared introspection + declarative engine. Export a **structural**
`PolicyInspectableTx` interface (`intents`, `guaranteedOffer`, `fallibleOffer`)
rather than the ledger type — this is what lets unit tests use plain-object
fixtures with no WASM, and it works unchanged across all three delegated stages
(unproven / unbound / finalized).

Exports: `normalizeHex`, `normalizeEntryPoint`, `contractActions`,
`contractCalls`, `hasContractActions`, `isZswapOnly`, `zswapTokenDeltas`,
`unshieldedTokenDeltas`, `tokenTypesUsed`, `zswapOfferShape`,
`zswapNullifiers`, `callsOnlyContracts`, `callsOnlyCircuits`,
`usesOnlyTokenTypes`, `isMatchedDeltaSwap`, `isEmptyPolicy`,
`evaluateDeclarativePolicy`, `evaluatePolicy`.

Every helper must be defensive: the ledger getters are WASM-backed and can
throw on unusual shapes. Introspection failure ⇒ **fail closed**, never open.

Add the `./midnight-policy` subpath to `package.json` exports **and** re-export
from `mod.ts`.

### B. Adapter wiring — `midnight-balancing-adapter.ts`

- `policy?: MidnightTxPolicy<DelegatedTx>` on the config
- `logLabel?: string` → `[balancing:product-a]` in logs (essential once three
  adapters interleave output)
- **Wallet-seed registry**: module-level; constructing a second adapter on a
  seed already claimed **throws**. Two facades on one seed keep independent
  `pendingDust` ledgers — a guaranteed double-spend. Export
  `claimWalletSeeds`/`releaseWalletSeeds`/`resetWalletSeedRegistry` for tests.
- `async validateInput()`: size cap → hex check → deserialize → `evaluatePolicy`
  → 400 naming the failing rule
- Sync re-check in `buildBatchData`; full async gate at the top of
  `processWorkerTx`, **before any dust is spent**
- `getHealthInfo()` → wallets / walletsReady / dustUtxos / dustExhausted /
  workersBusy / workersTotal / inFlightInputs / policy

### C. Core — `batcher.ts`, `storage.ts`, `config.ts`, `batcher-server.ts`

- **Dedup key must include the target.** `createInputKey` previously used the
  caller's target for every row, so it cancelled out: an identical payload sent
  to two products could cross-delete rows or cross-charge retries.
- **Strict routing — get the rule right the first time.** See §7.2; the naive
  version breaks existing consumers.
- `perTarget?: Record<string, {rateLimit?, maxRetries?, retryDelayMs?}>` and
  `requireExplicitTarget?: boolean`. **Add these to the TypeBox schema as well
  as the TS interface** — `Value.Cast` silently strips unknown fields.
- Rate-limit keys prefixed with `${target}|`; per-target `RateLimiter`s
- `?target=` on `/force-batch` and `/clear-inputs`; `/queue-stats` merges
  `adapter.getHealthInfo()` per target

### D. Drive-by fix — `packages/chains/midnight-contracts`

Dust-state cache keyed on `seed.slice(0, 16)`. Every dev seed in the repo
differs only in its *last* characters, so they all collided on one file and one
wallet restored another's dust state. Harmless with one wallet per process,
actively wrong once one process runs several.

Fix: `createHash("sha256").update(seed).digest("hex").slice(0, 32)`, plus an
atomic tmp+`renameSync` write (concurrent writers would otherwise interleave).

**This now lives in `src/dust-state.ts`, not `get-wallet-info.ts`.** See §7.1.

---

## 4. Midnight facts that cost real time

Everything here was discovered the expensive way. None of it is guessable.

### Dust

| fact | consequence |
|---|---|
| `coin.generatedNow` is an **event-refreshed snapshot, not a live accrual** | On a quiet chain it reads `0` while the lane generates normally. The SDK's own `chooseCoin` (smallest positive) reads the same field, so a healthy lane is invisible to it and surfaces as `Insufficient Funds: could not balance dust`. |
| Fix | Project it: `rate × elapsed`, capped at `maxCap`, take `max(projected, generatedNow)`. To get *true* values, **re-open the wallet** — a fresh instance re-syncs. |
| Diagnose with metadata, not balance | `rate` > 0 with `dtime` unset = generating. `rate=0` + `dtime` unset = genuinely dead. |
| **Register before funding lanes** | Registration rotates existing UTXOs (`rotateUtxos` consolidates to ≤2). Lanes split from a *pre-registration* UTXO generate exactly 0 forever. Order: seed UTXO → register → fund → split. |
| Re-registration is a silent no-op | All UTXOs report `registeredForDustGeneration: true`; it looks like a fix and isn't. |

### Policy visibility

- **Amounts are hidden. Value caps are impossible.** Say so explicitly; it is
  the first thing anyone assumes they can do.
- Readable: contract addresses + entry points; per-token net deltas; offer
  structure; **nullifiers**.
- A *balanced* transfer reports **no deltas at all**.
- `ZswapInput.nullifier` / `ZswapTransient.nullifier` are the one useful
  chain-state check: a nullifier already on chain means the coin is spent and
  the tx can never apply — and a doomed tx still costs the sponsor proving time
  and dust. Safe in a filter that runs twice because **"spent" is monotone**.

### Swaps and tokens

- A **matched-delta swap** (`+X tokenA / −X tokenB`) is *half a trade*:
  unbalanced by construction, settles only when a counterparty or solver
  supplies the other side. **Test it at the policy layer; never assert on-chain
  delivery for it.** Retire its queue rows instead (which conveniently also
  exercises target-scoped `/clear-inputs`).
- `initSwap(desiredInputs, desiredOutputs, …)`: the first argument is what the
  maker **spends** (the wallet sources those coins — it must hold them), the
  second is what the offer **creates** (may be a token the maker doesn't own).
  Deltas = inputs − outputs, so spend ⇒ `+X`, create ⇒ `−Y`. Getting this
  backwards fails with `Wallet.InsufficientFunds`. Name the wrapper's params
  `spend`/`create`, not `want`/`give`.
- **A second token type needs no mint.** A contract's token colors are
  `rawTokenType(domainSep, contractAddress)` — deterministic, so the color is
  well-defined as soon as the contract exists.
- `e2e/shared/contracts/midnight/contract-counter` already exposes
  `mint_shielded`. Recipient is `ownPublicKey()` — i.e. the caller — because
  contract sends create **no coin ciphertexts**, so only the calling wallet
  would ever discover the coin.

### Process/runtime

- **A clean WebSocket close kills the process.** The wallet SDK leaves an
  indexer subscription promise unsettled when its socket closes, so an ordinary
  `wallet.stop()` produces an unhandled rejection whose *reason is the
  CloseEvent* (`code: 1000, wasClean: true`) and Bun exits. Install a guard that
  swallows **only** a clean close and still exits 1 on everything else. Needed
  in every process that opens and stops wallets.
- `setNetworkId` is **module-global** ⇒ one network per process.

---

## 5. Testing strategy

### Tier 1 — unit (`packages/batcher/test/`)

Structural fixtures, no WASM, milliseconds. Cover: normalization; introspection;
each declarative rule; custom-filter semantics (ordering, tighten, override,
throw ⇒ closed, async); nullifier monotonicity; border cases (mixed intents,
deploy vs circuit, miscased entry point, bytes-vs-string, empty tx,
introspection-throws).

### Tier 2 — fast CI guard (`e2e/multi-batcher/`)

**Use the orchestrator's native binaries via `launcher.cli.ts`, modelled on
`e2e/midnight/`. Do NOT use docker — the CI test image has no docker CLI.**

Dependency graph: compile → node/indexer/proof-server → contract deploy → fund
→ batcher. Make `fund` a `waitToExit: true, critical: true` prerequisite of the
batcher: adapters read their wallets at construction, so a batcher started first
comes up unfunded and never recovers. Depend on `CONTRACT_DEPLOY` so funding
never races the deploy for the genesis wallet.

`startInfrastructure()` **returns as soon as the orchestrator is spawned** — it
does not wait. Follow it with `waitForOrchestrator()` and a `waitForProcess()`
per stage, or a dead compile/deploy/fund shows up 15 minutes later as a
misleading "batcher not healthy".

Set `ENABLE_DEV_AND_DEBUG_ENDPOINTS` on the batcher process if the suite
asserts on `/clear-inputs` or `/force-batch`.

Assertions (each one cheap transaction): every product accepts its own shape and
refuses the others'; target-less ⇒ 400; unknown target ⇒ 404; scoped clear
touches only its target; accepted work lands on chain; queues drain.

### Tier 3 — deep suite (`templates/multi-batcher/tests/`)

Docker on a private port block (12800s), manual/nightly. M1–M10: policy matrix,
cross-product dust isolation under flood, shared-queue dedup, routing, tampered
storage row, malformed payloads, per-product health, node outage, restart
exactly-once, mixed soak with memory tables.

---

## 6. Test-quality rules (learned the hard way)

Four separate assertions in the first attempt passed **for the wrong reason**.
This is the single highest-value section.

1. **A test that mirrors the implementation tests nothing.** The routing unit
   test re-implemented the rule inside the test file; when the rule was wrong,
   the test agreed with it and a real consumer broke in CI. **Drive the real
   class.**
2. **Verify a regression test fails against the broken code.** Temporarily
   restore the bug, watch the test go red, restore the fix. Otherwise you have
   not established that it guards anything.
3. **A silent zero is a failing test.** M2 asserted products A and B delivered
   but never checked C — C sat at `accepted=0` for a real reason (a bug) and the
   test passed. If a test's *claim* involves a participant, **assert on that
   participant**.
4. **Check the title matches the assertion.** M3 claimed "delivered once EACH"
   but sent a payload one target rejects — only one row ever existed, so the
   dedup key it was guarding was never exercised. Pick a payload **both**
   targets accept.
5. **Assert your corpus is non-empty.** A grep over a glob that matches no files
   reports "absent" for everything and looks like proof. Sanity-check that the
   thing you expect to be present *is*, in the same command.

---

## 7. Traps to avoid on the second pass

### 7.1 `git fetch` before you branch

The first attempt was cut from a **two-day-stale** `origin/v-next`. I checked
`git rev-parse origin/v-next`, got the old SHA, and reported "clean base" — the
local ref simply hadn't been fetched. Costs incurred:

- A late rebase across 23 commits, mid-CI-debugging
- The dust-cache fix written into the wrong file: upstream had already moved
  disk I/O out of `get-wallet-info.ts` into `dust-state.ts` **to keep `node:fs`
  out of browser bundles** (`@effectstream/wallets` must work in a browser).
  Re-applying my version would have silently reverted their fix.
- **Every green result obtained before the rebase was invalidated** — deep
  suite, `TESTING-RESULTS.md`, and the passing CI e2e all ran on the old base.

Do this first, every time:

```bash
git fetch origin && git checkout -b <branch> origin/v-next
```

Note for the dust fix specifically: put it in `src/dust-state.ts`. Verify
`get-wallet-info.ts` keeps **no** static `node:*` imports beyond `node:buffer`,
and that `dust-state.ts` is reached only via `await import()`.

> Caveat worth knowing: `await import()` **code-splits, it does not exclude**.
> The lazy chunk still ships `node:fs`. That is upstream's accepted state (it
> fixes the import-*time* crash), and a bundle built from clean `v-next` has the
> identical signature — so don't "fix" it and don't panic when you see it.

### 7.2 Get the strict-routing rule right

Naive rule — **wrong**:

```ts
requireExplicitTarget ?? Object.keys(adapters).length > 1
```

This broke `e2e/evm`, which registers two adapters and calls
`setDefaultTarget("effectstream-l2")`. Four tests failed in CI.

`addBlockchainAdapter()` **auto-assigns `defaultTarget` to the first adapter
registered**. Routing to a default nobody chose is the actual hazard; a default
the operator *named* is the opposite — an explicit statement of intent. So track
which it is:

```ts
requireExplicitTarget ?? (adapters.length > 1 && !defaultTargetIsExplicit)
```

Set `defaultTargetIsExplicit` from `cfg.defaultTarget` and `setDefaultTarget()`.

### 7.3 Don't carry environment assumptions across environments

Docker on a private port block was the right answer to *local port contention*
(other agents holding 9944/8088/6300). It was the wrong answer for CI, which has
no docker CLI. Keep docker for the template deep suite; use the orchestrator for
the e2e guard. **Ask "what is different about the target environment?" before
reusing a working setup.**

Also: `launchMidnight` declares `stopProcessAtPort: [9944, 30333]` — running the
e2e locally will **kill another agent's processes** on those ports. Check before
running.

### 7.4 `bun build` does not catch undeclared identifiers

It treats them as possible globals. Two runtime failures came from this
(`genesisShielded`, `getPendingCountFor` — both left dangling by an edit). Use:

```bash
bunx tsc --noEmit --ignoreConfig --skipLibCheck --module esnext --target esnext \
  --moduleResolution bundler --allowImportingTsExtensions <file>
```

### 7.5 Write logic once

Four bugs came from the same root: the same logic existing in two places and
only one being fixed.

- `wallet.ts` duplicated between `e2e/multi-batcher/` and
  `templates/multi-batcher/shared/`
- `fund.ts` genesis-sync gate present in one copy, missing in the other
- the swap built **twice inside one file** (exported helper + inline in
  `main()`) — fixing the export left `main()` broken, and the test that would
  have caught it wasn't asserting on that product

If two copies must exist (templates are meant to be standalone), add a drift
check; within a file, extract one function and call it from both paths.

### 7.6 Funding is a one-shot, not a retry loop

`docker compose restart app` re-runs funding. Fine on a **fully** funded chain
(balance checks make it a no-op); **not** on a partially funded one — genesis is
left in a state the next transfer doesn't expect and it fails with a bare
`RpcError: 1010: Invalid Transaction: Custom error: 170`, which reads like a code
bug. **A failed funding run means wipe the chain**, including the stale
`contract-counter.*.json` (keeping it makes entry skip the deploy and point at a
contract that no longer exists).

Run containers as the host user (`user: '${HOST_UID:-1000}:${HOST_GID:-1000}'`)
or they write root-owned artifacts into the bind-mounted checkout that the host
cannot later delete.

### 7.7 Git hygiene on published branches

- **Don't force-push to re-trigger CI.** An empty commit does it with a normal
  push. I amended to avoid one cosmetic commit and that rewrite led to a
  `reset --hard` that briefly orphaned a commit (recovered from reflog).
- `git reset --hard` **does not remove untracked files** — they then block a
  cherry-pick, and `-q` hides the error.
- Prefer merging `v-next` in over rebasing a published branch. Additive, no
  rewrite, no stacked-branch rebuild.
- Ask before rewriting a branch that has an open PR.

### 7.8 Separate infrastructure failures from code failures

A GitHub Actions **major outage** presented as CI failure. The tell was the
annotation `The job was not acquired by Runner of type hosted`, and
`https://www.githubstatus.com/api/v2/summary.json` confirmed it. Re-pushing
during an outage just burns runs. Check the status API before debugging.

Also: `gh pr checks` reporting *nothing* (workflow not yet registered after a
push) is not the same as "all settled" — two monitors reported false completion
on that.

---

## 8. Verification checklist

Before opening a PR:

- [ ] Branched from a **freshly fetched** `origin/v-next`
- [ ] `bun test packages/batcher/test/` green
- [ ] Full `bun test ./packages` compared **against a clean baseline** — the repo
      has ~4 pre-existing failures (postgres `initdb`, `@effectstream/sm`
      resolution under parallel load); confirm the count is unchanged
- [ ] `bun test packages/frontend/test/` green (browser-bundle gate)
- [ ] `bun run e2e/runner.ts multi-batcher` green **locally** if ports are free,
      otherwise state plainly that it is CI-verified only
- [ ] Deep suite run and `TESTING-RESULTS.md` regenerated **on the current base**
- [ ] Every new regression test verified to fail against the un-fixed code
- [ ] No `.env`, `batcher-data/`, `midnight-level-db*`, deploy address files or
      Compact `managed/` output committed
- [ ] Single-adapter, no-policy config behaves byte-for-byte as before
