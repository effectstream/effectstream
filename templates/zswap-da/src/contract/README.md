# Midnight contract

`offer-files.compact` is the contract this app talks to. It is **compiled
locally** — `managed/` is gitignored build output, not committed.

Despite the name, this contract has nothing to do with MIP-0005 offer files. It
is the demo's **test-token minting authority**: the Faucet screen's
`mint_shielded` / `mint_unshielded`. Offer-file encoding lives in
`@effectstream/mip-zswap-offer`, a separate and unrelated package.

## Building

`bun run dev` and `bun run build` compile it automatically via `predev` /
`prebuild`. To do it explicitly:

```bash
bun run build:contract     # compile (skipped if managed/ exists) + verify
bun run build:contract --force   # always recompile
bun run verify:contract    # verify existing output, never compile
```

This requires the [Compact toolchain](https://docs.midnight.network/develop/tutorial/building/)
on your PATH. If `compact` is missing, the build stops with install
instructions rather than a resolution error deep in Vite.

## manifest.json

`compact compile` is deterministic — two independent runs of the same source at
the same compiler version produce byte-identical output for all 16 files,
prover keys included (verified, not assumed). `manifest.json` therefore records
an exact sha256 of every output plus the source and the pinned compiler
version, and the build fails on any mismatch.

This catches the two ways your local build silently diverges from the contract
that is actually deployed:

- **the compiler version differs** — different output, same source
- **`offer-files.compact` was edited** — checked separately, with a distinct
  error, because the fix is different: the deployed contract still runs the old
  code, so it must be redeployed and the manifest updated

To intentionally adopt a new contract or compiler version:

```bash
bun run scripts/build-contract.ts --update-manifest
```

Then redeploy the contract in the backend repo and make sure
`GET /v1/midnight/config` reports the new address. Updating the manifest alone
just means this app confidently builds bindings for a contract nobody is
running.

## Provenance

Source of truth: `packages/contracts-midnight/contract-offer-files` in
<https://github.com/effectstream/zswap-offerfiles-kernel> @ `6ff9ac7`.
`offer-files.compact` here is a copy of that file — if it changes upstream,
copy it over and follow the `--update-manifest` flow above.

## What the app actually uses

One symbol: the generated `Contract` class, from `managed/contract/index.js`
(`src/services/browserContract.ts`). The 7.8 MB of proving keys are built but
unused locally — the browser fetches them from the backend at runtime via
`FetchZkConfigProvider`. They are still hashed in the manifest, since a
mismatch there is the clearest signal that the local build has drifted.

`witnesses` are not wired up: `offer-files.compact` declares no `witness`, so
the generated `Witnesses<PS>` type is `{}`.
