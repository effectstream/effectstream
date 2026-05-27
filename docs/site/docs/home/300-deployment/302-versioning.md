# Versioning

EffectStream follows [**Semantic Versioning**](https://semver.org/) (`MAJOR.MINOR.PATCH`) for its public API.

## Coordinated releases

**Every publishable package always ships with the same version number.** When we cut a release, all 38 `@effectstream/*` packages are bumped and published together - even if a given package had no code changes that cycle.

This is intentional. It means:

- You can pick any one `@effectstream/*` version, and every other `@effectstream/*` package you pull in will resolve to the exact same version.
- Compatibility between packages is a single version check, not an N×N matrix.
- "Package A wants `@effectstream/foo@0.100.13` and package B wants `0.100.14`" diamond-dependency situations cannot happen.
- When you upgrade, upgrade the whole set in lockstep.

The current shared version is whatever you see in any `packages/*/package.json` (`0.100.x` series at time of writing).

## Versioning your own application

- **Pin to one matching version** for every `@effectstream/*` dependency in your `package.json`. The starter templates do this already - every dep is the same pinned version.
- **Upgrade in lockstep.** Bump every `@effectstream/*` dep together, never one at a time.
- **MAJOR bumps may include breaking changes.** Read the changelog before bumping `0.x` → `0.(x+1)` while we're pre-1.0; pre-1.0 minor bumps can carry breaking changes per semver convention.
- **Your app's own version is independent.** Templates start at `1.0.0`. Bump it however your release process needs.

## Published packages

All 38 packages publish under the `@effectstream/*` npm scope.

### Core SDK (`packages/effectstream-sdk/`)

- `@effectstream/chain-types`
- `@effectstream/concise`
- `@effectstream/config`
- `@effectstream/coroutine`
- `@effectstream/crypto`
- `@effectstream/event-client`
- `@effectstream/log`
- `@effectstream/precompile`
- `@effectstream/utils`
- `@effectstream/wallets`

### Node SDK (`packages/node-sdk/`)

- `@effectstream/db`
- `@effectstream/db-emulator`
- `@effectstream/event-server`
- `@effectstream/node-sdk`
- `@effectstream/runtime`
- `@effectstream/sm`
- `@effectstream/sync`

### Chain contracts (`packages/chains/`)

- `@effectstream/avail-contracts`
- `@effectstream/bitcoin-contracts`
- `@effectstream/cardano-contracts`
- `@effectstream/evm-contracts`
- `@effectstream/evm-hardhat`
- `@effectstream/midnight-contracts`

### Chain binaries (`packages/binaries/`)

- `@effectstream/bitcoin-core`
- `@effectstream/celestia`
- `@effectstream/grafana-alloy`
- `@effectstream/grafana-loki`
- `@effectstream/near-sandbox`
- `@effectstream/npm-avail-light-client`
- `@effectstream/npm-avail-node`
- `@effectstream/npm-midnight-indexer`
- `@effectstream/npm-midnight-node`
- `@effectstream/npm-midnight-proof-server`
- `@effectstream/ord`

### Tools

- `@effectstream/batcher-sdk` (`packages/batcher/`)
- `@effectstream/frontend-sdk` (`packages/frontend/`)
- `@effectstream/orchestrator` (`packages/build-tools/orchestrator/`)

`@effectstream/explorer` (`packages/build-tools/explorer/`) is **deprecated** and is no longer co-versioned with the rest.
