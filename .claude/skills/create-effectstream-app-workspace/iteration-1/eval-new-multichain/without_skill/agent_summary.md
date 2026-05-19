# Baseline summary (without skill) — multichain EVM+Midnight

Files written under /tmp/eval-runs/iter-1/eval-new-multichain/without/template/.

## Files created

- start.dev.ts
- package.json
- Dockerfile
- packages/batcher/effectstream-l2.ts
- packages/batcher/batcher.dev.ts
- packages/batcher/batcher.mainnet.ts
- packages/frontend/vite.config.ts
- packages/shared/app-events.ts

## Gotchas claimed by the agent

- Batcher EVM-only; Midnight increment is client-side via Lace.
- `privateKey` in adapter is the batcher's gas-payer key.
- `MIDNIGHT_STORAGE_PASSWORD` 3-of-4 char classes + 16+ chars (set to `YourPasswordMy1!`).
- Vite `npm:`-prefixed imports must each be aliased.
- `stream/web` shim with `enforce: "pre"`.
- `node-fetch` → native fetch shim (memfs `fs.promises` crash).
- WASM: onchain-runtime in `optimizeDeps.exclude`, compact-runtime in include with npm prefix.
- viteStaticCopy points at `src/managed/{keys,zkir}/`.
- Docker workspace symlink workaround (inline `bun -e` script).
- Pre-cached solc 0.8.30 in Docker.
- `NftMinted` event indexes `minter` and `nftContract`; `blockHeight` auto-prepended by `registerEvents`.

## Things the agent was unsure about

- Package versions left as `<latest>` placeholders.
- Ignition module name assumed.
- Whether batcher should know about ERC-721 contract directly.
- Arbitrum RPC URL plumbing.
- Dev vs serve port mismatch (4001 vs 10599).
- Missing `packages/shared/package.json`.

**Note**: The agent mentioned "reused from the closest working template" and "copied from the closest working template" multiple times — suggests it may have grepped the host repo for existing template patterns even without the skill. This biases the baseline upward for this eval (the host machine is the Effectstream monorepo, which contains reference implementations).
