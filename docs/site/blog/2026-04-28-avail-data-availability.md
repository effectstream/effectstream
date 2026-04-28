---
slug: avail-data-availability
title: "Data Availability with Avail: Building High-Throughput Applications"
authors: [effectstream]
tags: [avail, data-availability, cross-chain, scalability]
---

`WRITE: On-chain apps that handle lots of data (games with frequent moves, social feeds, IoT data) hit a wall: putting everything on the settlement layer is slow and expensive. Data Availability (DA) layers like Avail let you post data cheaply while keeping settlement on Cardano or EVM. EffectStream now supports Avail as a first-class data source.`

<!-- truncate -->

## Reading Avail Blockchain State

We added an Avail funnel to EffectStream that runs in parallel with other chain funnels. Avail blocks arrive independently from the settlement chain, so the funnel ingests them concurrently — no blocking, no waiting for one chain to catch up to another.

- [Parallel funnel implementation](https://github.com/PaimaStudios/paima-engine/blob/09d86b504b11c104a1178881d0a3d0b2f9d8c459/packages/engine/paima-funnel/src/funnels/avail/parallelFunnel.ts)
- [Documentation](https://docs.paimastudios.com/home/state-machine/react-to-events/funnel-types/parallel-avail-funnel)

`WRITE: Why a parallel funnel matters — in a multi-chain app, you don't want your settlement chain to bottleneck your data layer. Explain how the parallel architecture keeps both chains processing at their native speed.`

## Avail Wallet and Batcher Support

Users can now submit data via Avail natively. We added Avail wallet support to the batcher system, which aggregates user transactions and posts them to the Avail DA layer.

- [Implementation PR](https://github.com/PaimaStudios/paima-engine/pull/391)

`WRITE: What the batcher does for Avail — aggregates individual user submissions into batches, posts them to Avail for data availability, while settlement happens on the main chain. This gives you Avail's throughput with your settlement chain's security.`

## Hybrid dApps — Choosing Your Data Layer

With Avail support, developers can build hybrid applications where different data goes to different layers:

- **High-throughput data** (game moves, chat messages, sensor readings) → Avail DA layer
- **Settlement data** (asset transfers, contract state changes) → Cardano or EVM

EffectStream's state machine reacts to events from all configured chains seamlessly. The developer decides where each type of data lives, and the framework handles the rest.

`WRITE: Architecture explanation or diagram — how a developer configures which data goes where. What does the config look like? How does the state machine receive events from both layers?`

## When to Use a Data Availability Layer

`WRITE: Decision guide for developers — when does a DA layer make sense?`

Topics to cover:
- **Avail Turbo** and high-throughput scenarios — when your app generates more data than the settlement layer can handle
- **Lessons from Tarochi** — we built Tarochi with EVM as the DA layer, and ran into sync time issues. What we learned about choosing the right DA layer.
- **Cardano limitations** — no event standard like Ethereum, heavy indexing requirements. How DA layers can complement Cardano's strengths.

`IMPLEMENT: Add this as a docs page and reference from this blog post`

## Conclusion

To bring it all together, we built a game template that combines Cardano and Avail state into a single application — settlement on Cardano, high-frequency data on Avail.

- [Template code](https://github.com/PaimaStudios/paima-game-templates/pull/82)

`ACTION: Merge this PR or verify it's up to date`

`WRITE: Summarize — EffectStream makes DA layers a first-class option. Developers choose where their data lives without changing their application architecture. The same state machine processes events from both layers.`

`ADD VIDEO HERE showing the Cardano + Avail template in action`
