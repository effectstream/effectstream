---
slug: projected-nfts
title: "Projected NFTs: Using Cardano NFTs in Smart Contract Applications"
authors: [effectstream]
tags: [cardano, nfts, aiken, smart-contracts, dolos, utxorpc]
---

Users want to use their NFTs in applications (games, DeFi, social platforms) without giving up ownership. Projected NFTs solve this: lock an NFT on Cardano L1 and use a representation in your application. The NFT never leaves your wallet in any meaningful sense; it's locked in a smart contract you control, and you can unlock it at any time.

<!-- truncate -->

![Hololocker dApp showing Mint, Lock, Unlock, and Withdrawal Request lifecycle](/img/blog/holodeck.png)

## The Aiken smart contract

The Projected NFT smart contract is written in [Aiken](https://aiken-lang.org/), Cardano's Rust-based smart contract language. It manages the full projection lifecycle:

1. **Lock** - the user sends their NFT to the contract, which records the owner and NFT details in the datum
2. **Use** - the application reads the locked state and grants in-app utility (powers, access, cosmetics)
3. **Unlock** - the user initiates a withdrawal request
4. **Claim** - after a cooldown period, the user claims the NFT back to their wallet

The cooldown on withdrawal prevents flash-loan-style exploits where a user could project, gain benefits, and immediately unproject in the same transaction. A CI pipeline validates that the contract compiles on every change.

## The Hololocker dApp

We built a full dApp called Hololocker for projecting and managing NFTs. It supports the complete lifecycle: mint new NFTs, lock them into the projection contract, view locked state, initiate unlock, and complete withdrawal.

- [Source code](https://github.com/dcSpark/projected-nft-whirlpool)
- [Demo on Twitter](https://twitter.com/PaimaStudios/status/1734623090020057114)

<iframe src="https://drive.google.com/file/d/1TbBngP-OKCX38dDaVQGoXnd_HncEW-jw/preview" width="100%" height="480" allow="autoplay"></iframe>
<iframe src="https://drive.google.com/file/d/12HzmHV7HI8msoc1yvI6zRqsZL69TSBeA/preview" width="100%" height="480" allow="autoplay"></iframe>

## Indexing with UTxORPC and Dolos

To track NFT lock/unlock events in real-time, we originally built a [Carp](https://dcspark.github.io/carp/) indexer task. But Carp requires heavy synchronization (days on testnet, even longer on mainnet), which made rapid development impractical.

We've since moved to [Dolos](https://github.com/txpipe/dolos) via the UTxORPC protocol. The new **ProjectedNFT primitive** in EffectStream reads projection events directly from Dolos's gRPC stream, parsing the datum to extract lock status, owner, policy ID, and asset name. It is one of five new [Cardano primitives](/docs/home/chains/cardano#primitives) backed by an IVM (Indexed View Materializer) with PostgreSQL materialized views.

The ProjectedNFT primitive tracks:
- Lock events (NFT enters the projection contract)
- Unlock requests (user initiates withdrawal)
- Claim completions (NFT returns to user's wallet)
- Current projection status per NFT (datum parsing for owner, policy, asset)

All state changes are streamed in real-time through UTxORPC's [Watch module](https://utxorpc.org/watch/intro/), which supports filtering by address, delegation part, and asset policy.

## Framework integration

The ProjectedNFT primitive connects to EffectStream's funnel system, the abstraction layer that reads data from multiple blockchains. When an NFT is projected or unprojected, the event flows through the funnel into the application's state machine. Developers react to it in their game logic like any other event.

A game could grant in-game powers when a player projects a specific NFT, remove them when it's unprojected, or display a player's projected collection as their in-game inventory.

The integration is end-to-end tested with 21 E2E tests covering the full lifecycle: stake registration, delegation, lock, unlock, and claim, all verified against a local Dolos instance.

- [ProjectedNFT primitive source code](https://github.com/effectstream/effectstream/tree/v-next-bun-start/packages/node-sdk/sm/primitives/src)
- [Cardano Primitives documentation](/docs/home/chains/cardano#primitives)

## The full stack

Five layers work together to make Projected NFTs possible:

| Layer | Technology | Role |
|-------|-----------|------|
| Smart Contract | Aiken | Lock/unlock logic on Cardano L1 |
| Indexer | Dolos + UTxORPC | Real-time event streaming via gRPC |
| Primitive | EffectStream IVM | State materialization in PostgreSQL |
| Framework | EffectStream funnel | Event delivery to application state machine |
| dApp | Hololocker | User interface for projection lifecycle |

This lets games use Cardano NFTs for in-game utility without transferring ownership, DeFi protocols collateralize without moving assets, and social platforms gate features based on NFT holdings. The NFT stays under the user's control the whole time.
