# Midnight stagenet v2 compatibility lock

This template uses one coherent prerelease family. Individual components must not be replaced independently.

## Locked release family

- Midnight.js: `5.0.0-beta.6`
- Compact manager/compiler/language/runtime: `0.5.1` / `0.33.0-rc.1` / `0.25` / `0.18.0-rc.1`
- Compact.js: `2.5.5-rc.7`
- Ledger v9/on-chain runtime v4/platform JS: `1.0.0-rc.3` / `4.0.0-rc.3` / `3.0.0`
- Wallet SDK family: `2.0.0-beta.2` barrel and the exact sibling versions recorded in `compatibility-lock.json`
- Node/indexer/proof server: `2.0.0-rc.4` / `4.4.0-rc.1` / `9.0.0-rc.5_experimental`

The Compact source reference `compactc-v0.33.0-rc.2` in the research slot is not the selected compiler asset. Midnight.js beta.6 documents and tests the published `0.33.0-rc.1` compiler.

## Registry and platform result

The GHCR references in the upstream beta.6 testkit returned HTTP 401 to anonymous manifest requests on 2026-08-10. The same exact release tags are publicly pullable from `docker.io/midnightntwrk` and are pinned by immutable index digest in `compatibility-lock.json`.

- Node: native `linux/arm64` and `linux/amd64` manifests.
- Experimental proof server: native `linux/arm64` and `linux/amd64` manifests.
- Indexer rc.1: `linux/amd64` only; the target ARM64 Docker Desktop host requires emulation. C03 must reject the lane if bounded startup is not practical.

## Hosted validation state

The read-only C02 probe checks the literal `stagenet` network identity, node runtime, API-v4 contract-event capability, GraphQL WebSocket handshake, and non-mutating faucet `OPTIONS` response. A passing read probe does not establish transaction or ZKIR-v3 compatibility.

`hostedZkirV3Verification` remains `unverified` until the authorized C11 Keccak deployment/call passes. Do not weaken this field based on local proving alone.
