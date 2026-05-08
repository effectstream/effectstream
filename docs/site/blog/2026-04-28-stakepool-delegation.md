---
slug: stakepool-delegation
title: "Stake Pool Delegation: Connecting Cardano SPOs to On-Chain Applications"
authors: [effectstream]
tags: [cardano, stakepools, delegation, indexing]
---

`WRITE: Cardano's stake pool ecosystem has millions of ADA delegated across hundreds of pools, but delegation has been a one-way relationship — delegators earn rewards, and that's it. What if games and apps could react to where you delegate? What if stake pool operators could offer in-game benefits to their delegators? This article covers how EffectStream makes this possible.`

<!-- truncate -->

## Indexing Stake Delegations

The first step is knowing who delegates to which pool. We built a [Carp](https://dcspark.github.io/carp/) indexer task that tracks stake delegations across the Cardano network, with an OpenAPI definition so any application can query delegation status.

`ADD: Link to OpenAPI spec`

`WRITE: What makes indexing delegation different from indexing transactions — delegation is a ledger state change, not a transaction in the traditional sense. The indexer needs to track the current state of every stake address, not just process individual events.`

## Connecting Delegation Data to EffectStream

We extended EffectStream's funnel system to ingest delegation data as first-class events. When a user changes their delegation, EffectStream apps receive this as an event they can react to — just like they react to smart contract events or token transfers.

- [Implementation PR](https://github.com/PaimaStudios/paima-engine/pull/265)
- [Documentation](https://docs.paimastudios.com/home/state-machine/react-to-events/primitive-catalogue/cardano/stakepools)

`WRITE: Technical deep-dive on ledger state vs. on-chain actions — delegation changes are ledger state transitions, not traditional transactions. This creates interesting challenges: how do you detect a change that isn't an explicit event? How do you handle epoch boundaries? (Get Enzo's input on the nuances)`

`ADD VIDEO HERE explaining the integration architecture`

`NOTE: Docs need migration — this primitive is not yet implemented in v2`

## Reacting to Delegation Changes in Game Logic

With delegation data flowing into the state machine, developers can build game logic that reacts to where players delegate:

- **Unlock content**: "This area is accessible only to delegators of Pool X"
- **Distribute rewards**: "All delegators of Pool Y receive a bonus item at epoch boundary"
- **Dynamic difficulty**: Adjust game parameters based on which pools your players support

`IMPLEMENT: Need to build an example state machine demonstrating these patterns`

`BLOCKED: Cardano localhost testing is difficult — no Cardano wallet currently supports localhost connections (unlike MetaMask for EVM). This makes it hard to create a live demo, though the architecture works in production.`

`NOTE: Several Cardano primitives still need migration to v2: Pool Delegation, Delayed State, Transfer, Mint/Burn, Projected NFT`

`WRITE: Even without a live demo, describe the architecture with a diagram: delegation event → Carp indexer → funnel → state machine → game state update. Show what a handler function looks like in code.`

## Batcher Pool Verification

We also added pool-aware batching. The batcher can check which pool an address delegates to before processing a transaction — enabling scenarios like free batching for users delegating to partner pools.

- [Implementation PR](https://github.com/PaimaStudios/paima-engine/pull/246)
- Configuration: `BATCHER_CARDANO_ENABLED_POOLS` environment variable

`WRITE: Expand on the use case — a stake pool operator partners with a game. Their delegators get free transaction batching (the SPO covers the cost). This creates a new incentive for delegation beyond staking rewards: "delegate to our pool and play for free."`

## Conclusion — Vision for SPO-Powered Gameplay

`WRITE: The bigger picture — stake pool delegation becomes a game mechanic. SPOs offer in-game benefits, players choose pools based on gameplay advantages, and a new economic layer emerges on top of Cardano's existing delegation system. This transforms delegation from a passive yield-earning activity into an active strategic decision.`

`DECISION: Need direction from Nico — what's the current roadmap? Midnight Cities path or alternative?`

`ADD VIDEO HERE if possible — even a conceptual demo or architecture walkthrough`
