---
title: PRC Standards
---

# PRC Standards

The Paima Request for Comments — **PRCs** — are open specifications for on-chain application primitives. They are independent of any particular framework or language and can be implemented by any project; EffectStream ships first-class support for them as part of the framework.

Each spec is the canonical contract between an application and the tools that integrate with it (aggregators, marketplaces, identity systems, indexers). Speaking a PRC is what makes a new game or dApp automatically discoverable by every tool that already speaks the same PRC, with no per-project glue code.

## Index

| Spec | Scope | Status |
|---|---|---|
| **[PRC-1 — Paima Achievement Interface](./prc1.md)** | HTTP interface for exposing in-game achievements and per-player completion state. | Open |
| **[PRC-2 — Paima Hololocker Interface](./prc2.md)** | Solidity interface for projecting ERC-721 NFTs from an L1 into an L2 application with a time-locked withdrawal. | Draft |
| **[PRC-3 — Paima Inverse Projection (ERC-721)](./prc3.md)** | Represent L2 game state as tradeable ERC-721 NFTs on an L1, with `tokenURI` served dynamically by the game's RPC. | Draft |
| **[PRC-5 — Paima Inverse Projection (ERC-1155)](./prc5.md)** | The PRC-3 inverse-projection model adapted for semi-fungible ERC-1155 tokens. | Draft |
| **[PRC-6 — Midnight dApp Integration Interface](./prc6.md)** | Superset of PRC-1 with metric channels, per-channel rankings, and session→main wallet identity resolution. | Open |

*(PRC-4 is reserved — the published series jumps from PRC-3 to PRC-5.)*

## Source repositories

- **PRC-1, PRC-2, PRC-3, PRC-5** — [`PaimaStudios/PRC`](https://github.com/PaimaStudios/PRC)
- **PRC-1 (extended), PRC-6** — [`effectstream/midnight-game-api-spec`](https://github.com/effectstream/midnight-game-api-spec), which also contains a runnable Fastify reference server.
