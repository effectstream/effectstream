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
- `generate:blocks` — mint blocks to advance the chain (the launcher invokes this script name explicitly; an older skill version called it `mine-blocks`, which is wrong)
- `wait-for-block` — block until a specific height is reached

Cross-reference: `packages/build-tools/orchestrator/scripts/launch-bitcoin.ts` in the engine monorepo is the source of truth for the exact script names the launcher invokes.

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

### Bitcoin sync polls slowly — tune test timeouts upward

A typical Bitcoin sync protocol config uses `pollingInterval: 10000` and `delayMs: 20000` (regtest blocks are 1s but the sync gates for finality). Phase B's `assertSQL` should use a generous timeout (~180s) and `waitForProcess` for sync up to ~600s — defaults built for Hardhat-speed will time out.

### Address-primitive only emits direction; the funding address isn't surfaced

`PrimitiveTypeBitcoinAddress` emits `{ direction, txid, vout, amount, recipient }` for each input/output touching the watched address. The funding (sender) UTXO's address is NOT included — recovering it requires an extra `getrawtransaction` per event or a custom primitive. Most templates record `sender = ""` and document the limitation.

## Frontend / wallet integration

Bitcoin browser wallet integration is less standardized than EVM/Cardano. For dev templates, prefer interacting with the regtest node via RPC and surface read-only views in the frontend. For production, wire up whatever wallet the use case targets (Xverse, Unisat, etc.) and adapt the test surface accordingly.
