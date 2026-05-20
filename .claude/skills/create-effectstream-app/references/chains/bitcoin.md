# Bitcoin

`packages/contracts-bitcoin/` — no smart contracts in the EVM sense; just configuration and scripts for the local Bitcoin Core regtest node.

> **See also (concept docs).**
> - Bitcoin chain overview: `docs/site/docs/home/200-chains/205-bitcoin.md`
> - Per-package: `docs/site/docs/home/500-packages/530-chains/bitcoin-contracts.md`
> - Per-binary: `docs/site/docs/home/500-packages/540-binaries/bitcoin-core.md`, `docs/site/docs/home/500-packages/540-binaries/ord.md`

## Tools (probe before scaffolding)

(no extra system tools — `bun` is enough; `bitcoin-core` and `ord` are vendored through `@effectstream/npm-bitcoin-core` and extracted on first run)

## Local dev environment

`launchBitcoin` starts a Bitcoin Core regtest node and exposes its RPC for the sync node to poll. Templates that want ordinals interactions additionally use `ord`.

## Required `launchBitcoin` package scripts

- `chain:start` — start Bitcoin Core in regtest mode
- `chain:wait` — wait until RPC port is responsive
- `mine-blocks` — mint blocks to advance the chain
- `wait-for-block` — block until a specific height is reached

## Sync protocol + primitives

Sync protocol: `BITCOIN_RPC_PARALLEL`.

| Primitive | Grammar | Use |
|---|---|---|
| `PrimitiveTypeBitcoinAddress` | `builtinGrammars.bitcoinAddress` | Watch a Bitcoin address for transactions |

## Batcher adapters

| Adapter | Batching criteria |
|---|---|
| `BitcoinAdapter` | hybrid (time + size) |

## Orchestrator wiring

```ts
...launchBitcoin("@my-template/contracts-bitcoin", {
  cwd: path.join(root, "packages/contracts-bitcoin"),
}),

{
  name: "sync",
  dependsOn: [DbNames.PGLITE_WAIT, BitcoinNames.CHAIN_WAIT],
  // ...
},
```

## Sharp edges

(none documented — when you hit one, add it here)

## Frontend / wallet integration

Bitcoin browser wallet integration is less standardized than EVM/Cardano. For dev templates, prefer interacting with the regtest node via RPC and surface read-only views in the frontend. For production, wire up whatever wallet the use case targets (Xverse, Unisat, etc.) and adapt the test surface accordingly.
