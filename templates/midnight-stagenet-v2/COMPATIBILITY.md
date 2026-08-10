# Midnight stagenet v2 compatibility lock

This template uses one coherent prerelease family. Individual components must not be replaced independently.

## Locked release family

- Midnight.js: `5.0.0-beta.6`
- Compact manager/compiler/language/runtime: `0.5.1` / `0.33.0-rc.1` / `0.25` / `0.18.0-rc.1`
- Compact.js: `2.5.5-rc.7`
- Ledger v9/on-chain runtime v4/platform JS: `1.0.0-rc.3` / `4.0.0-rc.3` / `3.0.0`
- Wallet SDK family: `2.0.0-beta.2` barrel and the exact sibling versions recorded in `compatibility-lock.json`
- Node/indexer/proof server: `2.0.0-rc.4` / `4.4.0-rc.1` / `9.0.0-rc.5_experimental`
- Container runtimes: Bun `1.3.14` for build/tests and Node `22.18.0` for the v2 proof client, both pinned by image digest.

The Compact source reference `compactc-v0.33.0-rc.2` in the research slot is not the selected compiler asset. Midnight.js beta.6 documents and tests the published `0.33.0-rc.1` compiler.

Compact manager `0.5.1` still queries compiler releases from `midnightntwrk/compact`; on 2026-08-10 its public index did not expose `0.33.0-rc.1`, so `compact update 0.33.0-rc.1` failed closed. The exact rc.1 binaries are published under the repository's `LFDT-Minokawa/compact` migration. The toolchain image downloads that immutable release asset directly and verifies the platform-specific SHA-256 recorded in `compatibility-lock.json`. It does not build the compiler from source and does not substitute rc.2.

## Registry and platform result

The GHCR references in the upstream beta.6 testkit returned HTTP 401 to anonymous manifest requests on 2026-08-10. The same exact release tags are publicly pullable from `docker.io/midnightntwrk` and are pinned by immutable index digest in `compatibility-lock.json`.

- Node: native `linux/arm64` and `linux/amd64` manifests.
- Experimental proof server: native `linux/arm64` and `linux/amd64` manifests.
- Plain proof server `9.0.0-rc.5`: native `linux/arm64` and `linux/amd64`; retained only as a negative control that must reject the V3 artifact accepted by the experimental image.
- Indexer rc.1: `linux/amd64` only; the target ARM64 Docker Desktop host requires emulation. C03 must reject the lane if bounded startup is not practical.

## Hosted validation state

The read-only C02 probe checks the literal `stagenet` network identity, node runtime, API-v4 contract-event capability, GraphQL WebSocket handshake, and non-mutating faucet `OPTIONS` response. A passing read probe does not establish transaction or ZKIR-v3 compatibility.

`hostedZkirV3Verification` is `validated`. On 2026-08-10, authorized C11 deployment `c12eb4c20d08f94f0e10e09fd7b4607896a53616478f5f77795cb27b417dbe1c` and call `3fd30b4ee50d4b8312abd358c2da79d525a56673880cf81e09e2fa150683004b` finalized on `Midnight Stagenet`; the V7 verifier key and locally produced ZKIR-v3 proof were accepted, and indexed state contained the expected Keccak-256 digest. No wallet secret, witness, proof bytes, or private state is recorded.

## C03 local toolchain observation

On 2026-08-10, a clean ARM64 Docker Desktop run started the native ARM64 node and proof images plus the AMD64-only indexer under emulation. The local node reached block 2, the indexer answered GraphQL API v4, and Node 22 constructed real Ledger-v9 transactions from the compiled Keccak artifact. The experimental server checked and proved the deploy/call pair in 1,928 ms; Ledger v9 then verified the contract proof with `verifyContractProofs=true`. The plain server rejected the same V3 call at `/check` in 13 ms. These are observed timings, not performance limits.

The disposable node database uses a bounded 1 GiB tmpfs. This both prevents local-chain state retention and avoids coupling the smoke to Docker Desktop's shared overlay free-space level. No service publishes a host port.
