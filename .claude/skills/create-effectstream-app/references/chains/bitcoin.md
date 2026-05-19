# Bitcoin

`packages/contracts-bitcoin/` — no contracts in the EVM sense, just configuration and scripts for the local Bitcoin Core regtest node.

## Required `launchBitcoin` package scripts

- `chain:start` — start Bitcoin Core in regtest mode
- `chain:wait` — wait until RPC port is responsive
- `mine-blocks` — mint blocks to advance the chain
- `wait-for-block` — block until a specific height is reached

## Primitive

`PrimitiveTypeBitcoinAddress` (via `builtinGrammars.bitcoinAddress`) watches a Bitcoin address for transactions. Sync protocol: `BITCOIN_RPC_PARALLEL`.

## Orchestrator config

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
