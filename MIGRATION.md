# Effectstream Rename Migration Plan

Migration from "Paima" / "PaimaEngine" to "Effectstream". The product name is always "Effectstream" and is never split. Casing follows the programming context.

## Locked decisions

| ID | Decision |
|---|---|
| D1 | Rename Solidity contracts, functions, and events. `PaimaL2Contract` → `EffectstreamL2Contract`, `paimaSubmitGameInput()` → `effectstreamSubmitGameInput()`, `PaimaGameInteraction` event → `EffectstreamGameInteraction`. Breaking on-chain change; versioned as L2 v2. |
| D2 | PRC → ESRC (Effectstream Standards Request for Comments). Short form stays `ESRC` to avoid collision with Ethereum's "ERC". **External PRCs are not modified in this task** — future migration. |
| D3 | Published scope stays `@paimaexample/*`. `publish-jsr-npm.effectstream.ts` is not modified. A future task will migrate the published npm namespace. |
| — | Compound-token casing: `paimaL2` → `effectstreamL2`, `PaimaL2` → `EffectstreamL2` (never split). |

## Constraints

| Do | Don't |
|---|---|
| Rename inside `packages/**` | Touch `templates/**` — separate migration task |
| Rename inside `e2e-v2/**` | Read or touch `e2e/**` — separate refactor |
| Rename root metadata (`package.json`, `CHANGELOG.md`, `TODO.md`, `README.md`, `AGENTS.md`) | Touch `publish-jsr-npm.effectstream.ts` |
| Rename docs prose + images | Touch `docs/site/docs/home/400-paima-standards/` or `prc*.md` (external, future) |
| For each rename, ensure e2e-v2 coverage; add a test if missing | Skip test runs between steps |

Templates currently import `@paimaexample/*`. After renames land, those symbols will change on the next publish. Templates breaking is **expected and out of scope here** — it's handled in the separate template-migration task.

## Testing cadence

After **every step**:

```sh
bun test ./packages && bun run test:e2e
```

Require green before proceeding. Commit per step so rollback is cheap.

Each step follows this workflow:
1. Identify the e2e-v2 test that exercises the code path. If none exists → add one.
2. Establish baseline green.
3. Apply the rename.
4. Re-run the test suites — require green.
5. Commit.

---

## Step 1 — State machine core

**Scope:** `packages/node-sdk/sm/PaimaSTM.ts`, `packages/node-sdk/sm/primitives/{PaimaPrimitive,PrimitiveRegistry}.ts`, all subclass sites and callsites in `packages/**` + `e2e-v2/**`.

**Renames:**
- `class PaimaSTM` → `class Stm`; file `PaimaSTM.ts` → `Stm.ts`
- `abstract class PaimaPrimitive` → `class Primitive`; file `PaimaPrimitive.ts` → `Primitive.ts`
- `PaimaPrimitiveRegistry` → `PrimitiveRegistry`

**e2e-v2 coverage:** Every chain-node test transitively exercises the STM + primitive pipeline:
- `e2e-v2/evm/sync/*.test.ts`
- `e2e-v2/midnight/node.ts` + Midnight test files
- `e2e-v2/cardano/`, `e2e-v2/bitcoin/`, `e2e-v2/avail/`, `e2e-v2/near/`, `e2e-v2/celestia/`

Confirm at least one passes against baseline before starting.

---

## Step 2 — `evm-paimal2` folder + adapter + primitive

**Scope:** `packages/node-sdk/sm/primitives/src/evm-paimal2/`, `packages/batcher/adapters/paimal2-adapter.ts`, `packages/chains/evm-contracts/src/plugin/paimaL2.ts`, `e2e-v2/evm/batcher/adapter-paimal2.ts`, `e2e-v2/evm/sync/paima-l2.test.ts`.

**Renames:**
- Folder `evm-paimal2/` → `evm-effectstream-l2/`
- `paimal2-primitive.ts` → `effectstream-l2-primitive.ts`
- `paimal2-abi.ts` → `effectstream-l2-abi.ts`
- `packages/batcher/adapters/paimal2-adapter.ts` → `effectstream-l2-adapter.ts`
- `class PaimaL2DefaultAdapter` → `EffectstreamL2DefaultAdapter`
- `packages/chains/evm-contracts/src/plugin/paimaL2.ts` → `effectstreamL2.ts`
- `e2e-v2/evm/batcher/adapter-paimal2.ts` → `adapter-effectstream-l2.ts`
- `e2e-v2/evm/sync/paima-l2.test.ts` → `effectstream-l2.test.ts`

Solidity identifiers stay unchanged here — they move in Step 10.

**e2e-v2 coverage:** `e2e-v2/evm/sync/effectstream-l2.test.ts` (renamed), `e2e-v2/evm/sync/batcher.test.ts`. Both must stay green.

---

## Step 3 — Nominal types

**Scope:** `packages/effectstream-sdk/utils/src/types/nominal.ts` + every import site.

**Renames (type name AND brand literal atomically):**
- `PaimaBlockNumber` / `"PaimaBlockNumber"` → `EffectstreamBlockNumber` / `"EffectstreamBlockNumber"`
- `PaimaBlockHash` / `"PaimaBlockHash"` → `EffectstreamBlockHash` / `"EffectstreamBlockHash"`
- `PaimaTxHash` / `"PaimaTxHash"` → `EffectstreamTxHash` / `"EffectstreamTxHash"`

The `FastFlavor<T, "Brand">` string literal must change in the same edit as the type name, or legacy branded values become unassignable.

**e2e-v2 coverage:** Compile-time via `bun test ./packages`. Plus `e2e-v2/features/api/rpc.test.ts` and any sync test touching block hashes.

---

## Step 4 — `PaimaEventManager`

**Scope:** `@effectstream/event-client` (`packages/effectstream-sdk/events/src/*.ts`) + callers.

**Renames:**
- `class PaimaEventManager` → `EventManager` (or `EffectstreamEventManager` if a collision exists — decide at edit time)

**e2e-v2 coverage check:** Search `e2e-v2/**` for tests that subscribe via `PaimaEventManager`. If no dedicated test exists, **add a minimal event-subscription test in `e2e-v2/features/events/` before the rename.**

---

## Step 5 — `generatePaimaBlockHash`

**Scope:** `packages/effectstream-sdk/crypto/src/paima-hash.ts`, `paima-hash.test.ts`, callers in sync protocol code.

**Renames:**
- File `paima-hash.ts` → `effectstream-hash.ts` (+ `.test.ts`)
- `generatePaimaBlockHash` → `generateEffectstreamBlockHash`

**e2e-v2 coverage:** Any sync test producing blocks exercises the hash function end-to-end. `e2e-v2/evm/sync/*.test.ts` and `e2e-v2/midnight/*` are sufficient. The renamed unit test `effectstream-hash.test.ts` provides direct coverage.

---

## Step 6 — `PaimaEngineConfig` (wallets)

**Scope:** `packages/effectstream-sdk/wallets/src/paima.ts` (file + exported class), re-exported from `mod.ts:10`, imported across wallets code.

**Renames:**
- File `paima.ts` → `effectstream.ts`
- `class PaimaEngineConfig` → `class EffectstreamConfig`
- Method `getPaimaL2Contract()` → `getEffectstreamL2Contract()`
- Field / param names compounding the product name (e.g., `paimaEngineConfig` variable) → `effectstreamConfig`
- Inline prose in comments: "Paima Engine", "Paima Wallet Interface", "Paima L2 Contract Instance" → Effectstream equivalents

**e2e-v2 coverage check:** `PaimaEngineConfig` is a frontend class. `e2e-v2/wallets-ui/` is a manual QA app, not an automated test. Scan `e2e-v2/**` for an automated test exercising this class. If none exists, **add a minimal test in `e2e-v2/features/wallets/` that instantiates `EffectstreamConfig` and exercises `getEffectstreamL2Contract()` before renaming.**

---

## Step 7 — Root metadata

**Scope:** root-level files only; no package sources.

**Changes:**
- `package.json`: `"name": "paima-engine"` → `"effectstream"`; regenerate `bun.lock` via `bun install`
- `CHANGELOG.md`: title
- `TODO.md`: reword Paima-as-product mentions; delete the resolved item `**New Name** Update Name to TBD (paima/effectstream)` at line 277
- `README.md`: any remaining "Paima" prose
- `AGENTS.md`: scan for "paima"
- `.vscode/settings.json`: scan for "paima"
- Delete generated `batcher-debug.log`

**Do not touch:** `publish-jsr-npm.effectstream.ts`. Do not hand-edit `bun.lock` — let `bun install` regenerate it.

**e2e-v2 coverage:** `bun run test:e2e` exercises the full runtime; workspace-resolution breakage would surface here.

---

## Step 8 — Docs prose + images

**Scope:** all `.md` under `docs/site/docs/home/**` **except** `400-paima-standards/` and `prc*.md`. Plus package READMEs.

**Changes:**
- Prose: "Paima" / "Paima Engine" → "Effectstream" where referring to the product. Keep any sentence that describes historical Paima context.
- Images: rename `paima-sm-docs.png`, `paima-mina-docs.png`, `paima-tarochi-docs.png` under `docs/site/docs/home/0-intro/` and update `0-intro.md` references.
- Package READMEs: `packages/batcher/README.md`, `packages/chains/evm-contracts/README.md`, `packages/chains/evm-hardhat/README.md`, `packages/node-sdk/sm/primitives/src/README.md`, `packages/node-sdk/db/migrations/readme.md`, `packages/node-sdk/db-emulator/README.md`, `packages/chains/evm-contracts/src/contracts/README.md`.

**e2e-v2 coverage:** N/A — content only. Still run the suites for sanity.

---

## Step 9 — External URLs (GATED)

**Blocked on input.** Need answers to:
- Target GitHub org/repo — keep `PaimaStudios/paima-engine` or move?
- Target docs host — keep `docs.paimastudios.com` or move?
- Target blog host — keep `blog.paimastudios.com` or move?

**Files once targets are known:**
- `docs/site/sidebars.ts:10,15`
- `docs/site/docusaurus.config.ts:108` (`PaimaStudios/paima-engine-docs`) — **keep** PRC references at lines 41, 175, 183 per D2 (external PRCs untouched)
- `git clone` snippets in `0-intro/0-intro.md:32-33`, `10-quickstart/10-quickstart.md:15`, `1200-templates/1204-multi-chain-swap.md:29`, `1205-intent-swap.md:22`
- `packages/build-tools/tui/src/tab/HelpSection.tsx:11`
- `packages/effectstream-sdk/events/src/builtin-events.ts:215`
- `packages/chains/evm-contracts/docs/templates/contract.hbs:1`, `README.md:6,269`
- `packages/chains/evm-hardhat/README.md`
- `docs/site/docs/home/0-intro/1-what-is-effectstream.md:148,222` (`blog.paimastudios.com`)

If deferred, skip to Step 10.

**e2e-v2 coverage:** N/A — strings only.

---

## Step 10 — Solidity on-chain (D1)

**Scope:** `packages/chains/evm-contracts/**` + `e2e-v2/shared/contracts/evm/**`. **Not** `templates/**` and **not** `e2e/**`.

**Renames:**
- `packages/chains/evm-contracts/src/contracts/PaimaL2Contract.sol` → `EffectstreamL2Contract.sol`. Internal: `contract PaimaL2Contract` → `contract EffectstreamL2Contract`, function `paimaSubmitGameInput` → `effectstreamSubmitGameInput`, event `PaimaGameInteraction` → `EffectstreamGameInteraction`.
- `packages/chains/evm-contracts/test/src/PaimaL2ContractTest.sol` → `EffectstreamL2ContractTest.sol`
- `packages/chains/evm-contracts/src/companions/PaimaL2Contract.{ts,json}` → `EffectstreamL2Contract.{ts,json}`
- `packages/chains/evm-contracts/src/companions/PaimaERC721Contract.{ts,json}` → `EffectstreamERC721Contract.{ts,json}`
- Inline ABI at `e2e-v2/evm/sync/effectstream-l2.test.ts:27-30` (renamed in Step 2): selector name + event topic
- Fallback ABI in `packages/effectstream-sdk/wallets/src/effectstream.ts:62-75` (renamed in Step 6): same
- `e2e-v2/shared/contracts/evm/src/contracts/MyPaimaL2.sol` → `MyEffectstreamL2.sol`
- `e2e-v2/shared/contracts/evm/src/contracts/MyPaimaErc20ev.sol` → `MyEffectstreamErc20ev.sol`
- `e2e-v2/shared/contracts/evm/ignition/modules/paimaL2.ts` → `effectstreamL2.ts`; module name + artifact key (`PaimaL2ContractModule#MyPaimaL2Contract` → `EffectstreamL2ContractModule#MyEffectstreamL2Contract`)
- Regenerate ignition artifacts under `e2e-v2/shared/contracts/evm/ignition/deployments/chain-*/` via the standard compile + deploy flow
- Regenerate forge/hardhat build artifacts under `e2e-v2/shared/contracts/evm/build/`

**e2e-v2 coverage:** `e2e-v2/evm/sync/effectstream-l2.test.ts` (from Step 2) submits via `effectstreamSubmitGameInput` and consumes the `EffectstreamGameInteraction` event. Also: `e2e-v2/evm/sync/batcher.test.ts`, `e2e-v2/evm/tooling/deploy.test.ts`. All must stay green after regeneration.

**Publish coordination (out of scope here):** When `@paimaexample/evm-contracts` is next published with renamed symbols, external consumers (including `templates/**`) break. Handled by the separate template-migration task.

---

## Execution order

1. Step 1 → 2 → 3 → 4 → 5 → 6 (serial; each independently green-gated)
2. Step 7 (root metadata) — any time after Step 1
3. Step 8 (docs) — independent; any time
4. Step 9 (URLs) — blocked on target org/host answers
5. Step 10 (Solidity) — last; depends on the renamed file paths from Steps 2, 5, 6
