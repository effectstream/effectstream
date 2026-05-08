---
slug: projected-nfts
title: "Projected NFTs: Using Cardano NFTs in Smart Contract Applications"
authors: [effectstream]
tags: [cardano, nfts, aiken, smart-contracts]
---

`WRITE: What problem does Projected NFT solve? Users want to use their NFTs in apps (games, DeFi) without transferring ownership. Projected NFTs let you "lock" an NFT on Cardano L1 and use a representation in your application — the NFT never leaves your wallet in a meaningful sense.`

<!-- truncate -->

## The Aiken Smart Contract

`WRITE: Explain the Projected NFT concept in detail: lock an NFT on Cardano L1, use it in an app without transferring ownership.`

The smart contract is written in [Aiken](https://aiken-lang.org/), Cardano's Rust-based smart contract language. A CI pipeline validates that the contract compiles successfully on every change.

`ADD: Link to contract code in paima-engine repo`

## A JavaScript Library for NFT Projection

To make it easy for any developer to project and unproject NFTs programmatically, we built a JavaScript library that wraps the smart contract interaction.

`WRITE: Brief code snippet or API overview showing how simple it is to use — e.g. `projectNFT(policyId, assetName)` style`

The library works in both browser and Node.js environments.

## Indexing NFT State

To track NFT lock/unlock events in real-time, we built a [Carp](https://dcspark.github.io/carp/) task — Carp is a Cardano blockchain indexer that lets applications query on-chain state efficiently.

The indexer comes with an OpenAPI definition, so any application can query projection status through a standard REST API.

`WRITE: Expand on what the Carp task tracks — lock events, unlock events, current projection status per NFT`

## The Projection dApp

We built a full dApp for projecting and managing NFTs with a visual interface.

- [Source code](https://github.com/PaimaStudios/projected-nft-whirlpool/tree/main/dapp)
- [Hosted dApp](https://projection.paimastudios.com/)
- [Demo on Twitter](https://twitter.com/PaimaStudios/status/1734623090020057114)

`FIX: dApp is currently not working. Need to fix and verify before publishing this article`

`ADD VIDEO HERE — existing video: https://drive.google.com/file/d/12HzmHV7HI8msoc1yvI6zRqsZL69TSBeA/view`

`WRITE: Walk through the user flow — connect wallet, select NFT, project it, see it in-app`

## Framework Integration

The indexer is connected to EffectStream's funnel system — the abstraction layer that reads data from multiple blockchains. This means any EffectStream application can react to NFT projection events directly in its state machine.

- [Documentation](https://docs.paimastudios.com/home/state-machine/react-to-events/primitive-catalogue/cardano/projected-nft)
- [Implementation PR](https://github.com/PaimaStudios/paima-engine/pull/259)
- [Example dApp](https://github.com/PaimaStudios/projected-nft-whirlpool)

`WRITE: Explain the integration architecture — how does an EffectStream app receive and process projection events? What does the state machine handler look like?`

## Conclusion and What's Next

`WRITE: Summarize the full stack — contract, library, indexer, dApp, framework integration. Five layers that together let any Cardano NFT have utility inside an application without leaving the user's wallet.`

`WRITE: What this enables — games where your Cardano NFTs have in-game powers, DeFi where you can collateralize without transferring, etc.`

`ADD VIDEO HERE: Close-out video showing the full end-to-end flow`

`WRITE: Mention challenges — Cardano testing requires heavy node sync (Carp can take days on testnet/mainnet), and no Cardano wallet currently supports localhost connections (unlike MetaMask for EVM). These are ecosystem-wide issues that tools like yaci-devkit and Dolos are starting to address.`
