# Midnight Node 1 maintenance line

> [!IMPORTANT]
> `midnight-1` is the temporary EffectStream maintenance line for Midnight
> Node 1.x and Ledger-v8. The default `v-next` branch targets Midnight Node 2.x
> and Ledger-v9 and is not merged into this branch.

## Compatibility contract

This branch is rooted exactly at
`b267fa2e795fcd1bd8e295d4d9b8eb65814b11ee`, the final Node-1-compatible
commit before the Node-2/Ledger-v9 migration. Releases from this line remain in
the stable `0.104.x` family and preserve the following stack unless a future
approved compatibility decision explicitly changes it:

| Component | Maintained generation |
| --- | --- |
| Midnight node | `1.0.0` |
| Midnight indexer | `v4.3.3` |
| Proof server / Ledger | `ledger-8.1.0` |
| Ledger package | `@midnight-ntwrk/ledger-v8@8.1.0` |
| On-chain runtime | v3 (`3.0.0`) |
| Midnight.js | `4.1.1` |
| Compact runtime / Compact JS | `0.16.0` / `2.5.1` |

Node 2.x, Ledger-v9, on-chain runtime v4, and Midnight.js v5 changes belong to
`v-next` and stable EffectStream `0.200.x`. They must not enter this branch as
part of a backport.

## npm channels and installation

Stable `0.104.x` packages are published from `midnight-1` only with the
explicit npm dist-tag `midnight-1`. They never create, move, or repair
`latest`. Stable `0.200.x` packages are published from `v-next` with explicit
dist-tag `latest` and remain npm's default line.

Install the maintained Node-1 line by channel:

```sh
npm install @effectstream/node-sdk@midnight-1
```

Or pin an exact reviewed maintenance version:

```sh
npm install @effectstream/node-sdk@0.104.1
```

Use the default Node-2 line only when the product's Midnight environment has
migrated:

```sh
npm install @effectstream/node-sdk@latest
```

The first new release planned for this branch is `0.104.2`. It is not
published merely by creating or updating this local branch; publication has a
separate audited authorization gate.

## How changes reach this branch

Every candidate change is reviewed against the Node-1 compatibility contract
and receives one of four dispositions:

- `CHERRY_PICK`: the upstream first-parent patch applies without importing
  Node-2 state, and provenance is preserved with `git cherry-pick -x`.
- `MANUAL_PORT`: only the Node-1-compatible behavior is reimplemented; mixed
  Node-2 manifests and lockfiles are never copied wholesale.
- `EXCLUDED`: the change is unnecessary, breaking, or coupled to Node 2.
- `WATCHLIST`: the change is not yet ready for a maintenance decision.

The branch never merges the Node-2/Ledger-v9 migration. Each accepted change
must keep its source PR/SHA, compatibility rationale, maintenance result,
deviations, and test evidence in the ledger below.

## Backport ledger

| Source PR / SHA | Disposition | Compatibility rationale | Resulting maintenance SHA | Deviations / conflicts | Test evidence |
| --- | --- | --- | --- | --- | --- |
| PR #876 / `2c1903c25e0ba348007b80a08a4380f8d835ae52` | `MANUAL_PORT` | Upgrade only the five generic binary wrappers and regenerate the root lock from the Node-1 tree. | Pending B1 | Do not copy the upstream Ledger-v9-era `bun.lock`. | Baseline: all five wrappers are `^5.0.0`; B1 Docker regeneration and smoke evidence pending. |
| PR #882 / `75beaac289a09506d53082358d887c714527110d` | `CHERRY_PICK` | PgLite lifecycle correctness fix is independent of Midnight and its touched paths match the maintenance applicability point. | Pending B2 | Apply merge first-parent patch with `-x -m 1`; conflicts reclassify it to `MANUAL_PORT`. | B2 Docker lifecycle/DB/Node evidence pending. |
| PR #887 / `332503c8f9216143a8c805f2a0acbcfd39e5a21d` | `CHERRY_PICK` | Solana transport-error preservation is independent of Midnight and both touched paths match. | Pending B3 | Apply merge first-parent patch with `-x -m 1`; conflicts reclassify it to `MANUAL_PORT`. | B3 Docker batcher evidence pending. |
| Playwright / `7c2c270a590e8c195d725ad1797de3a1f42e1266` | `EXCLUDED` (expected; verify at B4) | Root and projected-NFT locks already align on Playwright/core `1.61.0`; the source commit repairs a Node-2-only `1.62.1` mismatch. | None | Conditional manual port only if B1 necessarily moves the root browser version. | Baseline root/template lock comparison: both `1.61.0`; B4 post-B1 confirmation pending. |
| PR #880 / `0277bd184510c84c08078770b0cf7b191c8784b5` and PR #881 Ledger-v9/template migration | `EXCLUDED` | These changes define the Node-2/Ledger-v9 `0.200.x` line. | None | Never merge or copy Node-2 application state. | Both PR #880 and direct migration child `5130be28...` are not ancestors; targeted baseline forbidden-identifier scan found zero matches. |
| Audited generic dual-line release tooling | `MANUAL_PORT` | Branch-aware release/CI safety is shared across both compatibility lines. | Pending B5 | Port only audited generic tooling after routing R5 PASS; no Node-2 application manifests or locks. | B5 routing/maintenance policy matrix pending. |

## Support and end of life

This line remains eligible for relevant security and correctness updates while
released products still require Midnight Node 1.x on mainnet, preview, or
preprod. A network rollout does not silently archive the branch. Normal
maintenance ends only after the user records an explicit EOL decision and a
migration/EOL window is announced.

Consumers should validate each `0.104.x` update in their own Node-1 deployment
before production rollout.
