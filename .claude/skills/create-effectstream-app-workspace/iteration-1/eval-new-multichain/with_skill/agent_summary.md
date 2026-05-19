# With-skill summary — multichain EVM+Midnight

8 files at /tmp/eval-runs/iter-1/eval-new-multichain/with/template/.

## Gotchas explicitly handled (matches skill content)

- Nested Midnight workspace explicit in root.
- Phantom dep `@midnight-ntwrk/wallet-sdk-address-format@3.1.0`.
- Batcher `namespace: "mint-and-mint"` matches frontend `appName`.
- EVM-only batcher; Midnight one-shot client-signed.
- Vite `node-fetch` → native fetch shim (memfs `fs.promises` crash).
- `fix-stream-web` plugin `enforce: "pre"` before nodePolyfills.
- Launchers use `{ cwd }`, never `{ resolveFrom }`.
- Docker workspace symlink workaround (Bun on Linux).
- `MIDNIGHT_STORAGE_PASSWORD: "YourPasswordMy1!"` (3-of-4 complexity).
- Docker system deps: procps, xz-utils, lsof, iproute2, Foundry, pre-cached solc.

## Open assumptions

- EVM Ignition module name placeholder.
- Arbitrum chain id 42161 default.
- SDK version `<latest>` placeholder.
- `NftMinted` shape choice (single event with source discriminator vs two events).
- Did not scaffold: node/database/contracts-evm/contracts-midnight/{client,server}/tests bodies, etc. (per the prompt).

**Coverage comparison vs baseline**: Both with-skill and without-skill mentioned most of the same gotchas. The with-skill version was more systematic — touched all 10 key items including the nested-workspace + EVM-only-batcher dependsOn details. Baseline hit ~7 of them but missed a few like nested-workspace explicit listing (let me verify in the grading step).
