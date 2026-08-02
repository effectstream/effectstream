# Templates

Templates are complete, runnable starting points. Each one is a Bun workspace containing a sync node, a state machine, contracts for its chains, and usually a frontend, batcher and test suite. Clone the repository and run any of them directly:

```sh
git clone https://github.com/effectstream/effectstream.git
cd effectstream/templates/<template-name>
bun i
bun run dev
```

New to EffectStream? Start with **minimal** to see the smallest complete app, or **evm-midnight-v2** — the template used throughout the [Quick Start](../10-quickstart/10-quickstart.md).

:::note
The pages in this section cover a handful of these templates in depth. Every template listed below exists in the repository whether or not it has a dedicated page; the ones without a page are documented by their own `README.md`.
:::

## Starting points

| Template | What it demonstrates |
| --- | --- |
| [`minimal`](https://github.com/effectstream/effectstream/tree/main/templates/minimal) | The smallest complete app: one EVM chain, one grammar action, one state transition that logs each input to PostgreSQL, and a vanilla-JS frontend. The best place to start. |
| [`evm-midnight-v2`](./1201-evm-midnight.md) | EVM plus Midnight, with ZK contract deployment and a batcher. The Quick Start template. |
| [`chess-v2`](./1203-chess.md) | A complete turn-based game: lobbies, matchmaking and move validation. |

## Multi-chain

| Template | What it demonstrates |
| --- | --- |
| [`evm-cardano`](https://github.com/effectstream/effectstream/tree/main/templates/evm-cardano) | Cross-chain activity dashboard over a minimal EVM + Cardano integration. |
| [`preorder`](https://github.com/effectstream/effectstream/tree/main/templates/preorder) | A multi-chain presale / launchpad. Buyers pay on EVM (native ETH and an ERC-20) or Cardano (ADA) and the sync node turns those payments into orders. |
| [`zk-cardano`](https://github.com/effectstream/effectstream/tree/main/templates/zk-cardano) | Private delegation voting: delegate ADA on Cardano to become eligible, then cast private ZK votes on Midnight. |
| [`night-bitcoin-v2`](https://github.com/effectstream/effectstream/tree/main/templates/night-bitcoin-v2) | Intent-based cross-chain swaps between Bitcoin and Midnight, with a solver/filler network. |
| [`multi-chain-token-transfer`](https://github.com/effectstream/effectstream/tree/main/templates/multi-chain-token-transfer) | ERC-1155 transfers between EVM and Midnight through the batcher. |

## Single-chain

| Template | What it demonstrates |
| --- | --- |
| [`cardano-delegation`](https://github.com/effectstream/effectstream/tree/main/templates/cardano-delegation) | The `PrimitiveTypeCardanoPoolDelegation` primitive, indexing stake pool delegation certificates into a live dashboard. |
| [`projected-nft-preorder`](https://github.com/effectstream/effectstream/tree/main/templates/projected-nft-preorder) | The full NFT pre-order lifecycle on Cardano using the Hololocker (Projected NFT) protocol. The runnable [PRC-2](../400-paima-standards/prc2.md) reference. |
| [`solana-starter`](https://github.com/effectstream/effectstream/tree/main/templates/solana-starter) | An end-to-end Solana dApp: a vanilla (no Anchor) on-chain counter program, a log-indexing sync node, a gas-sponsoring batcher and a React frontend. |
| [`world-map-2d`](https://github.com/effectstream/effectstream/tree/main/templates/world-map-2d) | A 2D grid open-world game demonstrating spatial state and movement. |
| [`rock-paper-scissors`](https://github.com/effectstream/effectstream/tree/main/templates/rock-paper-scissors) | Multiplayer best-of-N rounds with lobbies and hidden simultaneous moves. |
| [`dice`](https://github.com/effectstream/effectstream/tree/main/templates/dice) | On-chain randomness in a simple dice game. |

## Focused examples

| Template | What it demonstrates |
| --- | --- |
| [`batcher-validations`](https://github.com/effectstream/effectstream/tree/main/templates/batcher-validations) | Custom batcher validation, using a gate that accepts or rejects inputs via an off-chain toggle. |
| [`shinkai-v2`](https://github.com/effectstream/effectstream/tree/main/templates/shinkai-v2) | An AI-powered RPG integrating a Shinkai AI node, with Cardano CIP-30 login and a PixiJS frontend. |
| [`hex-battle`](https://github.com/effectstream/effectstream/tree/main/templates/hex-battle) | A hex-grid battle game. Includes a `MIGRATION.md` walking through porting an older template to the current layout. |
| [`zswap-da`](https://github.com/effectstream/effectstream/tree/main/templates/zswap-da) | The ZSwap Offerfile Kernel frontend: atomic token swaps on Midnight with Celestia providing data availability. A React/Vite frontend rather than a full workspace. |

## Case study

[Tarochi](./1250-example-tarochi.md) is a production game built with EffectStream. It is not a template in this repository, but the page walks through how it was designed and built.
