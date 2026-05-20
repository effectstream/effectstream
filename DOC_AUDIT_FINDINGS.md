# Documentation Audit Findings

Audit performed 2026-05-20 against `v-next` branch (HEAD: `336257f4`).

Three checks were run:
- **(A) Docs → Code** — symbol-level: every named export, command, env var, contract referenced in docs was resolved against the source.
- **(B) Code → Docs** — coverage: every package and chain was checked for at least one doc mention.
- **(C) Templates as examples** — only templates pinned to `@effectstream/*` 0.100.* are valid living examples; the rest are stale.

## Scope numbers

| Surface | Count |
|---|---|
| Packages (publishable) | 38 |
| Templates | 16 |
| Doc pages (`docs/site/docs/home/**`) | 92 |
| Per-package READMEs | 37 |

---

## (A) Docs → Code: stale or broken references

### A1. Auto-generated package doc pages reference dead GitHub URLs (32 pages)

**Root cause:** [`docs/site/scripts/sync-package-readmes.ts:28-29`](docs/site/scripts/sync-package-readmes.ts:28) hard-codes
```ts
const GH_BLOB = "https://github.com/PaimaStudios/paima-engine/blob/main";
const GH_TREE = "https://github.com/PaimaStudios/paima-engine/tree/main";
```

The org renamed to `effectstream/effectstream` (commit `962a241a`). The source READMEs are already fixed; the generated doc pages are not — every page under `docs/site/docs/home/500-packages/**` has `PaimaStudios/paima-engine` links injected by the script.

**Fix:** point the constants at `effectstream/effectstream/{blob|tree}/main` and re-run `bun run sync-readmes`.

### A2. CLAUDE.md is stale on Deno-vs-Bun and on package layout

| Line | Claim | Reality |
|---|---|---|
| 36 | `deno install --allow-scripts` to install docs | `docs/site/package.json` uses `bun run`; no `deno.json` exists. Should be `bun install`. |
| 70 | "Docusaurus 3 documentation site (built with Deno)" | Built with Bun. |
| 30 | "`packages/build-tools/`: orchestrator, explorer, **tui**" | `packages/build-tools/tui/` exists but has no `package.json` — it's an internal sources-only directory, not a publishable package. |
| 53 | "8 starter project templates" | 16 directories in `templates/`. |

### A3. Template doc pages reference wrong paths (4 pages)

| File | Claim | Reality |
|---|---|---|
| [docs/site/docs/home/10-quickstart/10-quickstart.md:199](docs/site/docs/home/10-quickstart/10-quickstart.md:199) | `/templates/evm-midnight/` | Should be `evm-midnight-v2` |
| [docs/site/docs/home/1200-templates/1201-evm-midnight.md:3](docs/site/docs/home/1200-templates/1201-evm-midnight.md:3) | `/templates/evm-midnight` | Should be `evm-midnight-v2` |
| [docs/site/docs/home/1200-templates/1203-chess.md:3](docs/site/docs/home/1200-templates/1203-chess.md:3) | `/templates/chess` | Should be `chess-v2` |
| [docs/site/docs/home/1200-templates/1204-multi-chain-swap.md:~30](docs/site/docs/home/1200-templates/1204-multi-chain-swap.md) | `cd .../templates/multi-chain-token-swap` | Should be `multi-chain-token-transfer` |

### A4. Documented exports that don't exist (judgment calls)

| Doc | Symbol | Finding |
|---|---|---|
| [500-packages/510-sdk/event-client.md:80](docs/site/docs/home/500-packages/510-sdk/event-client.md:80) | `getEvmEvent` | Lives in `@effectstream/config`, not `@effectstream/event-client`. Either move the example or note re-export. |
| [100-components/111-grammar.md](docs/site/docs/home/100-components/111-grammar.md) | `mapPrimitivesToGrammar` | Not exported anywhere. Either implement, rename, or remove. |
| [500-packages/520-node/db.md](docs/site/docs/home/500-packages/520-node/db.md) | `createIndexesForEvents`, `registerEventHandlers` | Not in `packages/node-sdk/db/src/mod.ts`. Either un-document or restore. |
| [500-packages/520-node/event-server.md](docs/site/docs/home/500-packages/520-node/event-server.md) | `EventBroker.publish()`, `.subscribe()` | EventBroker has `.createServer/.start/.stop` only. Methods may have been removed or renamed. |
| [500-packages/520-node/runtime.md](docs/site/docs/home/500-packages/520-node/runtime.md) | Example: `await start(...)` with `dbMigrations: []` | `start` is an Effection generator returning `Operation<void>` (not a Promise), and the field is `migrations`, not `dbMigrations`. Example won't compile. |
| [500-packages/200-chains/210-contracts.md](docs/site/docs/home/200-chains/210-contracts.md) | `PaimaLaunchpad`, `PaimaLaunchpadFactory` | Not present in `packages/chains/evm-contracts/src/contracts/`. Either rename to `Effectstream*` if they exist under a different name, or remove from the catalog. |

### A5. Stale `@paimaexample/*` references in template walkthroughs

Three template doc pages display code samples using the old `@paimaexample/*` package namespace:

- [1206-world-map-2d.md](docs/site/docs/home/1200-templates/1206-world-map-2d.md) lines ~361, 446, 453 (`@paimaexample/db`, `@paimaexample/wallets`)
- [1207-rock-paper-scissors.md](docs/site/docs/home/1200-templates/1207-rock-paper-scissors.md) line ~138 (`@paimaexample/wallets`)
- [1208-dice.md](docs/site/docs/home/1200-templates/1208-dice.md) line ~298 (`@paimaexample/wallets`)

These doc pages are not auto-generated; the code blocks reflect the actual template source. **The underlying templates still use `@paimaexample/*` 0.3.x** — see (C) below. So fixing the doc would lie about the template. The real fix is migrating those templates (judgment call).

### A6. Other stub / placeholder content

| File | Issue |
|---|---|
| [docs/site/docs/home/300-deployment/301-deploy-game.md](docs/site/docs/home/300-deployment/301-deploy-game.md) | One-line placeholder; no substantive content. |
| [docs/site/docs/home/300-deployment/302-versioning.md](docs/site/docs/home/300-deployment/302-versioning.md) | Same. |
| [docs/site/docs/home/1000-effectstream-engine/1002-database.md](docs/site/docs/home/1000-effectstream-engine/1002-database.md) line 38 | `/TODO` placeholder text instead of a real path. |
| [docs/site/docs/home/1200-templates/1202-wallets.md:3](docs/site/docs/home/1200-templates/1202-wallets.md:3) | Claims template at `/e2e/e2e-wallets/` — directory not verified to exist. |

### A7. Generic prose mentioning "paima" (cosmetic)

~25 doc pages still contain the word `paima` (case-insensitive) in prose. Most are either references to PRC standards (which legitimately use the "Paima" historical name) or single-line stragglers from the rebrand. No further triage applied — the auto-generated URL fix (A1) removes the bulk; the rest are intentional or low-priority.

---

## (B) Code → Docs: coverage holes

All 38 publishable `@effectstream/*` packages have at least one doc mention.

| Missing from root README | Note |
|---|---|
| `@effectstream/explorer` | Marked DEPRECATED in `sync-package-readmes.ts:32`. Intentional. |
| `@effectstream/npm-{avail-light-client, avail-node, midnight-indexer, midnight-node, midnight-proof-server}` | Binaries; README lists them by simple name but does not enumerate. Could add a "Binaries" section. |

| Missing chain page | Note |
|---|---|
| **NEAR** | `packages/binaries/near-sandbox/` exists, NEAR primitives exist in `@effectstream/sm`, but there's no `200-chains/2xx-near.md` page. Polkadot/Mina/Algorand each have a (wallet-only) page; NEAR has full L1 support but no chain page. |

| Templates with valid `@effectstream/*` 0.100.* but no doc page | |
|---|---|
| `batcher-validations`, `cardano-delegation`, `evm-cardano`, `minimal`, `preorder`, `projected-nft-preorder`, `shinkai-v2`, `zk-cardano`, `zswap-da` | Some are linked from root README. Optional: dedicated doc pages. |

---

## (C) Templates as living examples

11 of 16 templates are pinned to `@effectstream/*` 0.100.*  and are valid as code examples.

| Template | `@effectstream` ver | Valid? |
|---|---|---|
| `batcher-validations` | 0.100.13 | yes |
| `cardano-delegation` | 0.100.13 | yes |
| `chess-v2` | 0.100.12 | yes (slightly behind) |
| `evm-cardano` | 0.100.13 | yes |
| `evm-midnight-v2` | 0.100.13 | yes |
| `minimal` | 0.100.13 | yes |
| `preorder` | 0.100.14 | yes |
| `projected-nft-preorder` | 0.100.13 | yes |
| `shinkai-v2` | 0.100.13 | yes |
| `zk-cardano` | 0.100.13 | yes |
| `zswap-da` | 0.100.13 | yes |
| **`dice`** | none — uses `@paimaexample/* 0.3.124` | **STALE** |
| **`multi-chain-token-transfer`** | none — uses `@paimaexample/* 0.3.116` | **STALE** |
| **`night-bitcoin`** | none — uses `@paimaexample/* 0.5.0` | **STALE** |
| **`rock-paper-scissors`** | none — uses `@paimaexample/* 0.3.124` | **STALE** |
| **`world-map-2d`** | none — uses `@paimaexample/* 0.3.108-0.3.117` | **STALE** |

**Impact:**
- Doc pages `1206-world-map-2d.md`, `1207-rock-paper-scissors.md`, `1208-dice.md` present stale templates as current. `1205-intent-swap.md` documents `night-bitcoin` (also stale). `1204-multi-chain-swap.md` documents `multi-chain-token-transfer` (also stale).
- Recommendation: migrate these 5 templates to `@effectstream/*` 0.100.* (large), or mark their doc pages as "legacy v1 example, pending migration".

Packages are at 0.100.15 today; the valid templates lag by 1-3 patch versions (acceptable).

---

## Auto-fixes applied in this audit

Filed in this PR by the audit:
1. **`docs/site/scripts/sync-package-readmes.ts`** — point GitHub link constants at the new repo + re-run script. Fixes ~32 doc pages' source links in one shot.
2. **`CLAUDE.md`** — update Deno → Bun for docs site, fix template count, drop `tui` from build-tools list.
3. **Template path fixes** — rename `evm-midnight`→`evm-midnight-v2`, `chess`→`chess-v2`, `multi-chain-token-swap`→`multi-chain-token-transfer` in the 4 doc pages listed in A3.

## Items left for human judgment

1. **A4** — missing exports may indicate either renamed/removed code or unimplemented features.
2. **A5 / (C)** — five templates still on `@paimaexample/*` — migrate or deprecate?
3. **A6** — three stub pages need content.
4. **B** — add a NEAR chain doc page? Add doc pages for the 9 undocumented valid templates?
