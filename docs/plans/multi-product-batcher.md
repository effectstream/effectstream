# Re-implementation plan: one Midnight batcher, many products

Written 2026-08-06, after the first attempt (PRs #850 / #851, both closed).
The design held up; the *process* is what needs repeating differently. Nothing
below is speculative — every fact was paid for once already.

Read §1–§6 to build it — §5 is the part to copy rather than paraphrase.
Read §7–§9 before writing a single test. Read §10 before touching git.

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

> Exact code for the dedup key and the routing rule is in §5.6 / §5.7.

- **Dedup key must include the target.** `createInputKey` previously used the
  caller's target for every row, so it cancelled out: an identical payload sent
  to two products could cross-delete rows or cross-charge retries.
- **Strict routing — get the rule right the first time.** See §10.2; the naive
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

**This now lives in `src/dust-state.ts`, not `get-wallet-info.ts`.** See §10.1.

---

## 4. File inventory

Everything to create, with purpose. Sizes are from the first attempt
(1774 insertions across `packages/`, plus ~9100 lines of template).

### `packages/batcher/` — the SDK

| file | change | what |
|---|---|---|
| `adapters/midnight-policy.ts` | **new**, ~515 lines | introspection helpers + declarative engine + `evaluatePolicy` |
| `adapters/midnight-balancing-adapter.ts` | +197 | policy config, seed registry, `logLabel`, `getHealthInfo`, intake + pre-spend gates |
| `core/batcher.ts` | +76 | strict routing, `getRetryPolicy(target)`, `clearPendingInputs(target)`, `forceProcessBatches(target)` |
| `core/storage.ts` | +28 | `createInputKey` keyed on `input.target ?? target` |
| `core/config.ts` | +33 | `requireExplicitTarget`, `perTarget` — **in the TypeBox schema too** |
| `server/batcher-server.ts` | +78 | per-target rate-limit keys/limiters, `?target=` admin routes, health in `/queue-stats` |
| `adapters/adapter.ts` | +7 | optional `getHealthInfo?()` |
| `adapters/adapter-logger.ts` | +9 | label from config |
| `core/batch-processor.ts` | +21 | `BATCHER_DEBUG_LOG` gating of sync-append logging |
| `mod.ts` / `package.json` | +19 | `./midnight-policy` subpath export |
| `test/midnight-policy.test.ts` | **new** | 42 tests / 7 describes |
| `test/multi-tenant.test.ts` | **new** | 14 tests / 4 describes |
| `packages/chains/midnight-contracts/src/dust-state.ts` | +20 | sha256 cache key + atomic write |

### `e2e/multi-batcher/` — fast CI guard (9 files)

| file | what |
|---|---|
| `launcher.cli.ts` | orchestrator graph: compile → midnight → deploy → **fund** → batcher → batcher-wait |
| `env.ts` | standard ports (9944/8088/6300/3334), product + actor seeds (**must be valid hex**), `lanesPerProduct: 2` |
| `fund.ts` | genesis sync gate → per-product seed → register → fund → split → actors; `import.meta.main` guard with exit codes |
| `batcher/main.ts` | three adapters, `requireExplicitTarget: true`, per-target rate limits |
| `run-tests.ts` | infra waits + the 12 assertions |
| `wallet.ts` | wallet helpers incl. `projectedDustValue`, `waitForSelectableDust`, `ignoreCleanWebSocketClose`, `buildSwapOffer(spend, create)` |
| `batcher-client.ts` | `sendTx`, `getStats`, `getPendingCountFor`, `clearInputs`, `waitForDrained` |
| `diagnose-dust.ts` | dumps `rate`/`maxCap`/`dtime`/`ctime`/`generatedNow` per coin |
| `package.json` | deps incl. `@e2e/engine`, `@effectstream/orchestrator` |

Register in `e2e/runner.ts`: `{ name: "multi-batcher", script: "./multi-batcher/run-tests.ts" }`.

### `templates/multi-batcher/` — reference + deep suite (26 files)

```
docker-compose.yml  proof-lb.conf  link.sh  entry.ts  package.json  .gitignore
README.md  TESTING.md  TESTING-RESULTS.md
shared-batcher/   batcher.ts  fund.ts  registry.ts
shared/           env.ts  wallet.ts  batcher-client.ts
product-a/        deploy.ts  workload.ts  contract-counter/{package.json,src/*}
product-b/        workload.ts
product-c/        workload.ts
tests/            run-deep.ts  diagnose-dust.ts
```

Ports (loopback, 12800 block — clear of defaults and of `midnight-batcher`'s
18400 block): batcher **12835**, node 12845, proof-lb 12864 over 3 provers,
indexer 12889.

`registry.ts` holds `Product[]` + `buildProducts(networkId)` +
`assertRegistryIsSane()` (duplicate seeds / actor-seed overlap / duplicate
targets) + the exported `matchedDeltaSwapFilter`.

Product policies:

| product | policy | backend |
|---|---|---|
| product-a | `allowedCircuits: [{contract: counter, entryPoint: "increment"}]` | Compact counter |
| product-b | `allowZswapTransfers: true` | none |
| product-c | `allowZswapTransfers: true` + `allowCustomFinalFilter: matchedDeltaSwapFilter` | none |

---

---

## 5. Reference implementation — the parts that must be exact

Copied from the first attempt (branch `claude/multi-batcher-sdk`, still on the
remote). Everything else in this document can be rebuilt from the description;
**these cannot**. Get the contracts below right and the rest follows.

### 5.1 The policy contract

The whole feature is this type plus its evaluation order. `TTx` defaults to the
structural interface so tests need no WASM; the adapter instantiates it with the
real ledger type.

```ts
export interface PolicyVerdict {
  valid: boolean;
  /** Name of the rule that decided the verdict (for logs + error messages). */
  rule?: string;
  /** Human-readable reason when invalid. */
  reason?: string;
}

export interface CustomFilterContext<TTx = PolicyInspectableTx> {
  tx: TTx;
  txStage: "unproven" | "unbound" | "finalized";
  input: DefaultBatcherInput;
  /** Verdict of the declarative rules, which always run first. */
  declarativeVerdict: PolicyVerdict;
}

export type CustomFinalFilter<TTx = PolicyInspectableTx> = (
  ctx: CustomFilterContext<TTx>,
) => boolean | ValidationResult | Promise<boolean | ValidationResult>;

export interface MidnightTxPolicy<TTx = PolicyInspectableTx> {
  /** Allow transfer-shaped transactions: no contract actions, at least one offer. */
  allowZswapTransfers?: boolean;
  /** Tighten the transfer rule to these token types (normalized hex). */
  allowedTokenTypes?: string[];
  /** Allow any circuit on these contract addresses. */
  allowedContracts?: string[];
  /** Allow only these (contract, entryPoint) pairs. */
  allowedCircuits?: ContractCallRef[];
  /**
   * Custom FINAL filter. Runs strictly AFTER the declarative rules and receives
   * their verdict; its return value is the final decision (it can tighten OR
   * override). Throwing rejects the input (fail closed).
   *
   * MUST be deterministic and side-effect free: it runs at intake AND again
   * pre-batch (storage rows are untrusted, and policy may change across a
   * restart).
   */
  allowCustomFinalFilter?: CustomFinalFilter<TTx>;
}
```

### 5.2 Declarative evaluation — order matters, and so does failing closed

Rules are tried in a fixed order and the **first match wins**. An empty policy
is allow-all (backward compatibility). The `catch` is not decoration: ledger
getters are WASM-backed and throw on odd shapes — an introspection failure must
reject, never pass.

```ts
export function evaluateDeclarativePolicy(
  tx: PolicyInspectableTx,
  policy: MidnightTxPolicy<never> | undefined,
): PolicyVerdict {
  // No declarative rules configured: allow-all (a custom filter may still reject).
  if (isEmptyPolicy(policy)) return { valid: true, rule: "allow-all" };
  const p = policy!;

  try {
    if (p.allowZswapTransfers && isZswapOnly(tx)) {
      if (p.allowedTokenTypes?.length && !usesOnlyTokenTypes(tx, p.allowedTokenTypes)) {
        return {
          valid: false,
          rule: "allowedTokenTypes",
          reason: `transfer touches a token type outside the allowlist (used: ${
            [...tokenTypesUsed(tx)].join(", ") || "none"
          })`,
        };
      }
      return { valid: true, rule: "allowZswapTransfers" };
    }

    if (p.allowedContracts?.length && callsOnlyContracts(tx, p.allowedContracts)) {
      return { valid: true, rule: "allowedContracts" };
    }

    if (p.allowedCircuits?.length && callsOnlyCircuits(tx, p.allowedCircuits)) {
      return { valid: true, rule: "allowedCircuits" };
    }

    // Nothing matched — explain why in terms the submitter can act on.
    const actions = contractActions(tx);
    const detail = actions.length > 0
      ? `contract actions [${
        actions.map((a) => `${a.contract.slice(0, 12)}…#${a.entryPoint || "<deploy>"}`).join(", ")
      }] not allowlisted`
      : isZswapOnly(tx)
      ? "transfer-shaped transaction, but allowZswapTransfers is not enabled"
      : "transaction matches no configured rule (no offers and no contract actions?)";
    return { valid: false, rule: "no-rule-matched", reason: detail };
  } catch (error) {
    return {
      valid: false,
      rule: "introspection-failed",
      reason: `could not inspect transaction: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}
```

### 5.3 Full evaluation — the custom filter runs last and wins

Note it accepts `boolean` **or** `ValidationResult`, so a filter can return a
bare `true` or an `{valid:false, error}` with a message. The `catch` is the
fail-closed guarantee.

```ts
export async function evaluatePolicy<TTx extends PolicyInspectableTx>(
  ctx: {
    tx: TTx;
    txStage: "unproven" | "unbound" | "finalized";
    input: DefaultBatcherInput;
  },
  policy: MidnightTxPolicy<TTx> | undefined,
): Promise<PolicyVerdict> {
  const declarativeVerdict = evaluateDeclarativePolicy(
    ctx.tx,
    policy as MidnightTxPolicy<never> | undefined,
  );
  const custom = policy?.allowCustomFinalFilter;
  if (!custom) return declarativeVerdict;

  try {
    const outcome = await custom({ ...ctx, declarativeVerdict });
    if (typeof outcome === "boolean") {
      return outcome
        ? { valid: true, rule: "allowCustomFinalFilter" }
        : {
          valid: false,
          rule: "allowCustomFinalFilter",
          reason: "rejected by custom filter",
        };
    }
    return {
      valid: outcome.valid,
      rule: "allowCustomFinalFilter",
      reason: outcome.valid ? undefined : (outcome.error ?? "rejected by custom filter"),
    };
  } catch (error) {
    // Fail closed.
    return {
      valid: false,
      rule: "allowCustomFinalFilter",
      reason: `custom filter threw: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}
```

### 5.4 Wallet-seed exclusivity — the one that prevents double-spends

Module-level, checked at **construction**, before any wallet sync starts. Two
adapters on one seed keep independent `pendingDust` ledgers and will select the
same coins. Validate the whole list before mutating, so a partial claim can't
leak on the throw path.

```ts
const claimedWalletSeeds = new Map<string, string>();

export function claimWalletSeeds(seeds: string[], label?: string): void {
  const owner = label ?? "unlabeled adapter";
  const seen = new Set<string>();
  for (const seed of seeds) {
    if (seen.has(seed)) {
      throw new Error(
        `MidnightBalancingAdapter (${owner}): wallet seed listed twice in the same adapter`,
      );
    }
    seen.add(seed);
    const existing = claimedWalletSeeds.get(seed);
    if (existing !== undefined) {
      throw new Error(
        `MidnightBalancingAdapter (${owner}): wallet seed already in use by "${existing}". ` +
          `Each adapter instance needs its OWN wallet — sharing one causes double-spent dust. ` +
          `Give this product a distinct seed.`,
      );
    }
  }
  for (const seed of seeds) claimedWalletSeeds.set(seed, owner);
}
```

Call it first thing in the constructor: `claimWalletSeeds(seeds, config.logLabel)`.
Also export `releaseWalletSeeds` / `resetWalletSeedRegistry` for tests.

### 5.5 The three enforcement points

**Intake** (`validateInput`) — size cap → hex → deserialize → policy. Returns a
400 that names the failing rule:

```ts
const verdict = await evaluatePolicy(
  { tx: entry.tx as unknown as PolicyInspectableTx, txStage: entry.txStage, input },
  this.config.policy as MidnightTxPolicy<PolicyInspectableTx> | undefined,
);
if (!verdict.valid) {
  this.log.warn(
    `Policy rejected #${inputContentHash(input.input)} at intake ` +
      `[${verdict.rule}]: ${verdict.reason ?? "no reason given"}`,
  );
  return {
    valid: false,
    error: `Rejected by policy (${verdict.rule}): ${
      verdict.reason ?? "transaction not permitted for this target"
    }`,
  };
}
```

**Pre-batch** (`buildBatchData`) — synchronous re-check of the *declarative*
half via `declarativePolicyVerdict(entry)`; marks the row invalid so it takes
the bounded-retry-then-warned-drop path.

**Pre-spend** (`processWorkerTx`) — the full policy including the async custom
filter, before any dust is committed. Throw a plain `Error` here: it must be
treated as an **input** failure (retry-charged, dropped) and not as infra:

```ts
// Final policy gate before any dust is spent: runs the FULL policy
// (declarative + custom filter). buildBatchData already re-checked the
// declarative half synchronously; this covers the async custom filter.
if (!isEmptyPolicy(this.config.policy as MidnightTxPolicy<never> | undefined)) {
  const verdict = await evaluatePolicy(
    { tx: entry.tx as unknown as PolicyInspectableTx, txStage: entry.txStage, input: trace.input },
    this.config.policy as MidnightTxPolicy<PolicyInspectableTx> | undefined,
  );
  if (!verdict.valid) {
    throw new Error(
      `Rejected by policy (${verdict.rule}): ${
        verdict.reason ?? "transaction not permitted for this target"
      }`,
    );
  }
}
```

Getting three gates is deliberate: intake gives the submitter a fast 400,
pre-batch catches tampered storage cheaply and synchronously, pre-spend is the
one that actually protects the dust.

### 5.6 Dedup key — one character of real impact

`input.target ?? target`. The old version used the caller's `target` for every
row, so it cancelled out of the comparison and one product's removal could
match another product's identical row.

```ts
private createInputKey(input: T, target: string): string {
  return [
    input.addressType,
    input.target ?? target,   // ← per-row target, NOT the caller's
    input.address,
    input.timestamp,
    input.signature ?? "",
    input.input,
  ].join("|");
}
```

### 5.7 Strict routing — the rule that broke a consumer

Do **not** key on adapter count. `addBlockchainAdapter()` auto-assigns
`defaultTarget` to the first adapter registered; routing to a default nobody
chose is the hazard, whereas a default the operator *named* is an explicit
statement of intent. Track which it is:

```ts
// set true from cfg.defaultTarget and inside setDefaultTarget()
private defaultTargetIsExplicit = false;

const requireExplicitTarget = this.config.requireExplicitTarget ??
  (Object.keys(this.adapters).length > 1 && !this.defaultTargetIsExplicit);

if (!input.target && requireExplicitTarget) {
  throw new InputValidationError(
    `Input is missing "target". This batcher serves multiple targets ` +
      `(${Object.keys(this.adapters).join(", ")}) and has no explicit ` +
      `default; name the one you mean, or call setDefaultTarget().`,
    400,
  );
}
```

### 5.8 `isMatchedDeltaSwap` — the shipped example filter

```ts
export function isMatchedDeltaSwap(
  tx: PolicyInspectableTx,
  opts?: { tokens?: [string, string] },
): boolean {
  const deltas = zswapTokenDeltas(tx);
  if (deltas.size !== 2) return false;
  const [[tokenA, deltaA], [tokenB, deltaB]] = [...deltas.entries()];
  if (deltaA !== -deltaB) return false;
  if (deltaA === 0n) return false;   // a balanced transfer is not a swap
  if (opts?.tokens) {
    const wanted = new Set(opts.tokens.map(normalizeHex));
    if (!wanted.has(tokenA) || !wanted.has(tokenB)) return false;
  }
  return true;
}
```

`zswapTokenDeltas` **drops zero entries**, which is what makes the
`deltas.size !== 2` test meaningful — a balanced transfer arrives as an empty
map, not as two zeroes.

---

## 6. Midnight facts that cost real time

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

## 7. Testing strategy

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

## 8. The tests, concretely

### Unit — 56 tests total

`midnight-policy.test.ts` (42 tests / 7 describes): `normalization`,
`introspection`, `declarative policy`, `custom final filter`, `matched-delta
swaps (product-c shape)`, `offer shape (the signal available when amounts are
hidden)`, `nullifiers (the one thing a sponsor can check about a hidden coin)`.

`multi-tenant.test.ts` (14 tests / 4 describes): `shared queue keeps products
separate`, `wallet-seed exclusivity`, `per-target retry policy resolution`,
`strict routing decision` — **this last one must drive the real `Batcher`**
(see §9.1), including the two-adapter + `setDefaultTarget()` case.

### e2e — the 12 assertions

Registration, then accept/refuse per product, then routing, then delivery:

| # | assertion | expected |
|---|---|---|
| 1 | all three products are registered | a, b, c |
| 2 | product-a accepts its counter call | 200 |
| 3 | product-b accepts a shielded transfer | 200 |
| 4 | product-c accepts a matched-delta swap | 200 |
| 5 | product-a refuses a transfer (circuit allowlist) | 400 |
| 6 | product-b refuses a contract call (transfers only) | 400 |
| 7 | product-c refuses a balanced transfer (custom filter) | 400 |
| 8 | unaddressed input is refused | 400 |
| 9 | unknown target is refused | 404 |
| 10 | clearing one target leaves the others' queues intact | product-c 1→0 |
| 11 | product-a's call landed on chain | counter +1 |
| 12 | product-b's transfer landed on chain | sink +1 |
| — | every queue drained | pending=0 |

Print the deltas of each shape before asserting — product-c's verdict is
decided by exactly those, and a surprise there explains any failure instantly.
Expected: swap `[native=1, contractToken=-1]`, plain transfer `none (nets to
zero)`.

Note #4 and #7 use the **same** product and opposite outcomes — that is what
proves the filter discriminates rather than rejecting everything. #10 exists
because a swap offer cannot settle (§6), so its rows are retired rather than
waited on.

### Deep suite — M1–M10

| id | name | pass condition |
|---|---|---|
| M1 | Policy matrix: each product accepts only its own shape | 8/8 cases correct |
| M2 | One product's dust exhaustion does not stall the others | `deliveredA===a.accepted && deliveredB===b.accepted && c.accepted===3 && drops===0` |
| M3 | Byte-identical payload on two targets creates two independent rows | both accept, `rows b=1 c=1` |
| M4 | Unaddressed and unknown-target inputs are refused | 400 / 404, pending 0 |
| M5 | A policy-violating row written straight to storage is refused | pre-batch rejects, warned drop, other products unaffected |
| M6 | Garbage and oversized payloads are refused at intake | `!anyAccepted && pending===0` |
| M7 | Per-product health is observable via `/queue-stats` | `missing===0 && withHealth===products.length` |
| M8 | Node outage parks every product and drops nothing | exact delivery, `drops===0` |
| M9 | Restart with a mixed queue delivers every product exactly once | `delivered===accepted`, flags DOUBLE-SUBMIT if it exceeds |
| M10 | Mixed three-product soak | `dustErrors===0 && drops===0` + exact delivery |

M2 drives 30 concurrent product-a calls against b (4) and c (3). M3 **must** use
a matched swap offer — accepted by both b and c — or the dedup key is never
exercised. Every unscoped `waitForDrained` must be preceded by
`retireProductCOffers()`, or it burns its full timeout on offers that can never
settle.

Reference numbers from a green run (3-product soak, 226s, tps 0.18): batcher
peak 585 MiB over 173 samples, no growth; proof servers ~1 GiB peak each.

---

## 9. Test-quality rules (learned the hard way)

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

## 10. Traps to avoid on the second pass

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

## 11. Verification checklist

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
