# Midnight Node 1 maintenance line

> [!IMPORTANT]
> `midnight-1` is the temporary EffectStream maintenance line for Midnight
> Node 1.x and Ledger-v8. The default `v-next` branch targets Midnight Node 2.x
> and Ledger-v9 and is not merged into this branch.

## Release-operator breaking change

> [!WARNING]
> **BREAKING FOR RELEASE OPERATORS AND AUTOMATION:** every publisher invocation
> now requires an explicit `--dist-tag`. Stable `0.104.x` accepts only
> `midnight-1`; stable `0.200.x` accepts only `latest`; the retained Node-2
> prerelease path accepts only `next`. Legacy invocations that relied on npm's
> implicit `latest` fail before source, registry, tag, release, or branch
> mutation.

This is deliberately an operator/automation interface break. It is **not** a
package API or runtime API break for EffectStream consumers.

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
| PR #876 / `2c1903c25e0ba348007b80a08a4380f8d835ae52` | `MANUAL_PORT` | Upgraded only the five generic binary wrappers and regenerated the root lock from the Node-1 tree. | `cea1237b225c3feba51d1a80660a6a337118aafa` | No cherry-pick conflict because the port was manual. The Ledger-v9-era upstream lock was not copied. Bun 1.3.10 Linux amd64 regeneration also normalized 39 stale importer-version metadata pairs to the already-declared `0.104.1`; every resolver delta is caused by the five constraints. A disposable-only override selected reviewed decompressor `10.2.2`, then was removed before the full frozen install. | Docker image `oven/bun@sha256:b86c67b531d87b4db11470d9b2bd0c519b1976eee6fcd71634e73abfa6230d2e`: full frozen install passed; graph is bin-wrapper `13.2.0`, decompressor `10.2.2`, downloader `15.2.0`, with no decompressor `5.0.0`. Download/path/version SHA-256 evidence: Bitcoin 28.1 `c2e73c31a0b371bd0721bc8bb6d199736fa1f3d2bb45edb7c8056eab3cec168a`; Celestia app 6.4.10 `48a17d6e523ec0217ea5d13948df3a44c473ebd4a2df5c4f4d5be3080a3352a3`, node 0.28.4 `3289e47299086ad9b98c2be55f096c3347b72cd32b9382f9036b3624878b84de`; NEAR 2.10.7 `bcb0900febf4ed358dc26842cb57a326da5ea00473f6a043dc6aa1975f722825`; ord 0.23.3 `9cd809fa22d1e6202da138efd14a3884e17b74998a98d8f98e389cab38b84897`; Solana 3.0.14 `80f3bc0e3fa6a3090e69bafbfe00b249eaa655c5874ac83aebb6acdb157140ab`. NEAR passed on its native Linux arm64 wrapper fallback at container-local port 28473 after its amd64 binary could not execute under host QEMU. All resources were removed. |
| PR #882 / `75beaac289a09506d53082358d887c714527110d` | `CHERRY_PICK` | PgLite lifecycle correctness fix is independent of Midnight; all nine modified applicability blobs were byte-identical and all eleven added paths were absent on both sides. | `3872a91fc612302459465980dbdf13cdd3b28054` | Applied merge first-parent patch with `-x -m 1`; no conflicts or deviations. Stable source/maintenance patch ID is `18dc87d5f8817992c04efbeee9406206b968403f`. | Pinned Bun 1.3.10 Docker red tree failed across the old retained-socket/default/forced/repeated-close/process-exit/startup-cleanup/in-flight-query/PgTyped paths. Native Linux arm64 green focused command: 25 pass / 0 fail / 97 expectations, including PgTyped success/failure/timeout and single-file SIGTERM. Complete DB+Node green: 59 pass / 2 skip / 2 pre-existing fail; exact clean B1 baseline: 34 pass / 2 fail with the identical unrelated snapshot-handler export and db-emulator workspace-resolution errors, so the delta is 25 passes + 2 fixture skips + 0 new failures. An amd64 QEMU run printed the expected close markers but exceeded three five-second test bounds; all three passed natively. No host ports were published and all resources were removed. |
| PR #887 / `332503c8f9216143a8c805f2a0acbcfd39e5a21d` | `CHERRY_PICK` | Solana transport-error preservation is independent of Midnight; the modified adapter blob matched the source first parent and the added test was absent on both applicability sides. | `a3f677e6521bdf9c2fc7f31f83aaee166a931c5a` | Applied merge first-parent patch with `-x -m 1`; no conflicts or deviations. Stable source/maintenance patch ID is `5fcf1257cb5506e676be9edbcb6b8c83c1506753`. | Pinned Bun 1.3.10 Docker: classifier 5/0/11 expectations; Solana adapter 20/0/23; full batcher 90/0/173. `ECONNREFUSED` and non-Error `socket hang up` reach infrastructure classification; genuine transaction rejection remains non-infrastructure; mixed success remains successful; empty payload keeps the bare error. Only container-local ephemeral ports were used. |
| Playwright / `7c2c270a590e8c195d725ad1797de3a1f42e1266` | `EXCLUDED` | After the B1 lock regeneration, both the root and projected-NFT graphs still resolve one internally aligned `@playwright/test` / `playwright` / `playwright-core` set at `1.61.0`. The source commit repairs the `1.62.1` mismatch introduced only by the Node-2 migration. | None | No template or browser declaration was changed. The conditional manual-port trigger did not occur. | Exact post-B1 manifest/lock assertions passed for root and `templates/projected-nft-preorder`; each graph resolves the three browser packages at `1.61.0`, and the projected-NFT tree remains unchanged. |
| PR #880 / `0277bd184510c84c08078770b0cf7b191c8784b5` and PR #881 Ledger-v9/template migration | `EXCLUDED` | These changes define the Node-2/Ledger-v9 `0.200.x` line. | None | Never merge or copy Node-2 application state. | Both PR #880 and direct migration child `5130be28...` are not ancestors; targeted baseline forbidden-identifier scan found zero matches. |
| Audited generic dual-line release tooling / routing R5 `49d8c5a4789dd15601b3a676698af7e90e14f337` | `MANUAL_PORT` | Branch-aware release/CI safety is shared across both compatibility lines, while the application source remains Node-1/Ledger-v8. | CI `7dfd2567eb32f40f8b95734ddc2687b8e4677ca6`; release `e7fec008a068bec05b2da90ac72758636c17c3b8`; recovery remediation `fee5caa6d948d5cc9c264b8ed130e811511edf9f` | `158efc09...` applied cleanly. `58a33a78...` conflicted only with the older publisher/workflow and absent guard paths; all nine paths were resolved to the exact audited source blobs before continuation. `49d8c5a4...` then applied cleanly. No application manifest, lock, template, README notice, or runtime path was copied. Final selected blobs: CI test `8ebe565605dc6849e3d1b887c3a2c1c1e56603dd`; CI classifier `e6fa7bc1024a8e651fba461b816fa702ad32be8c`; publisher registry test `8dc124278af31d8c94c125ba97523977f397e206`; publisher test `24d67142aba4f4eb50b1f4a68ad4fc13b3ef005d`; publisher `a6c0024d78a604d2a63b8cbcfebc0079c42da4c8`; recovery test `1dabb483d57d9003ace486a7c2dec6c7390a187d`; guard `22fc9de44075495c2fc334ea47b2d0a08bd5c0e0`; guard test `a524192df762abcce80b13872ba171f33744e201`; release workflow `899e8bbc22634907c7580c0d8b56fc08b274cd99`; recovery workflow `abd7c1c6de244997d25873271a6b43034663a60d`; rehearsal workflow `e4235a5aa64a7258a3691588bd0ebea4a70b7411`. Embedded guard SHA-256 is `f1c6f21dd0bfe03ee5fbf469c099e8bbc203e2adce61d819e3f5f1f1e33d8e20`. `main.yaml` is verified by maintenance behavior instead of required whole-file identity. | Pinned Docker: frozen Node-1 install passed; exact audited routing matrix 102/0/351; guard 5 positives, 16 fail-closed negatives, 2 race rejections; all four workflows actionlint-clean. The recovery-drift fixture required mechanically drifting only the 40 disposable version fields because its routing-era `0.104.1` premise equals the real maintenance versions. All owned containers, ports, credentials, registries, and volumes were removed. |
| PR #876 / `2c1903c25e0ba348007b80a08a4380f8d835ae52` lock-repair clarification | `MANUAL_PORT` | The seven accepted binary importers already declare `@xhmikosr/bin-wrapper@^13.2.0`; the current Node-1 root lock was therefore normalized in place with exact native Bun 1.4.0 instead of adding a root decompressor override or copying the Node-2 lock. | `9e3e38c1e64bd24a4a7b3071030a98ec08bedfa9` | The accepted Bun-1.3 regeneration retained stale temporary `@xhmikosr/decompress@10.2.2` override metadata and omitted one EVM workspace file alias, so Bun 1.4 frozen install rejected it. Exact old/intermediate/final lock SHA-256 values are `83134598eb5734aaecfa9bfe35cf807ad0f5592222e102f30f52b78a345de5c6`, `14e0da51ab8c0100f4ce370bbf0b9e4255bb2ebba090a54426e9069f29708b3d`, and `61af639db5c3704ba9e09e03fa1e0d7a5e33e8064121065574eb682a4d7f7fb4`. The final delta is exactly 2 insertions / 1 deletion: remove only stale override metadata and add only `@e2e/evm-contracts/@effectstream/evm-contracts`, already present in PR #876. Package resolutions, all 199 package manifests, all 40 release-version fields, and the Node-1 graph are unchanged. No root override, deleted/rebuilt lock, or copied Node-2 lock. This supersedes the prior Bun-1.3-only limitation. | Official native macOS ARM64 Bun `1.4.0+34cbb9a40`: two controlled normal install passes reproduced the exact intermediate/final bytes; immediate and post-cherry-pick frozen installs passed. Format v1, all 68 workspaces, 2,319 common package entries, the Midnight/Playwright subsets, and the secure chain `13.2.0 → 15.2.0 → 10.2.2` remained unchanged; zero decompressor v5. |
| PR #896 merge `89155bea9b3527628decdbeaeb7fddf777999904` / feature `d8b52e8d63466f7667f1c52f281be02911b164c4` | `CHERRY_PICK` | Generic test-only readiness ordering prevents PgLite/WASM startup time from consuming the preserved 500 ms post-readiness client handshake budget; it is independent of Midnight generation and changes no production gateway. | `36ce6b7fa4c23ce86bedbd4bab8a3c2938f11c1b` | Applied exactly once with `git cherry-pick -x`; no conflict, manual resolution, or deviation. Stable source/maintenance patch ID is `094e74266b0d09cf7220155d18ee02873f13ca3e`; final test blob is `c9d7eaa30e335a34eb0aa11595c9fd1133a1b593`. Production gateway, regenerated root lock, all package manifests/versions, and the complete Node-1/Ledger-v8 compatibility graph are unchanged by this commit. | Native macOS ARM64 Bun 1.4.0: exact focused readiness trio `3 pass / 20 filtered / 0 fail`; unchanged workflow lifecycle pair `24 pass / 0 fail`; no retry, emulation, Docker, retained candidate process, or Bun listener. P2/P3 evidence contains 24 hashed logs (manifest SHA-256 `a929ea3461956a9a4e35be8dfa1f49a6d2b173bdda6400e1827627d22d624b7e`) and a 35-file ordered manifest at SHA-256 `14b403b213ebcd8e696ee88411a51856f6f87589e47f04defe6cb11f7f955adb`. |

## Support and end of life

This line remains eligible for relevant security and correctness updates while
released products still require Midnight Node 1.x on mainnet, preview, or
preprod. A network rollout does not silently archive the branch. Normal
maintenance ends only after the user records an explicit EOL decision and a
migration/EOL window is announced.

Consumers should validate each `0.104.x` update in their own Node-1 deployment
before production rollout.
