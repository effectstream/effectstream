---
slug: celestia-data-availability
title: "Data Availability with Celestia: High-Throughput On-Chain Applications"
authors: [effectstream]
tags: [celestia, data-availability, cross-chain, scalability]
---

On-chain apps that handle lots of data (games with frequent moves, social feeds, IoT streams) hit a wall: putting everything on the settlement layer is slow and expensive. Data Availability (DA) layers solve this by providing cheap, high-throughput data posting while settlement stays on Cardano or EVM. EffectStream now supports Celestia as a first-class data availability layer.

<!-- truncate -->

![Celestia DA application overview](/img/blog/da-main.png)

## Why a data availability layer?

Every EffectStream application needs to post user actions somewhere persistent and verifiable. For low-frequency applications, the settlement chain (Cardano, EVM) works fine. But when your application generates hundreds or thousands of actions per minute (game moves, chat messages, sensor readings), posting each one as a settlement-layer transaction gets expensive fast.

A DA layer like [Celestia](https://celestia.org/) provides an alternative: post high-throughput data cheaply to the DA layer, while settlement (asset transfers, contract state changes) stays on the main chain. EffectStream's state machine processes events from both layers without the developer having to think about it.

## Celestia integration architecture

The Celestia integration adds a new data path to EffectStream's batcher system. The batcher aggregates individual user submissions into batches and posts them to Celestia for data availability, while settlement transactions go to the configured settlement chain.

The integration lives in the [`bun-zswap-da` template](https://github.com/effectstream/effectstream/tree/v-next-bun-start/bun-zswap-da), which includes:

- **Batcher** that aggregates and posts batches to Celestia
- **Database** tracking submitted batches, token states, and offer lifecycle
- **Frontend** demo UI for interacting with the DA-backed application
- **E2E tests** verifying the full pipeline from user action to Celestia submission to state machine processing

## How it works

The batch processor submits data to Celestia and tracks each submission:

![Celestia batch processor logs showing successful submissions](/img/blog/celestia-1.png)

The backend database tracks the complete state (tokens, offers, batch references):

![Database tables tracking tokens and offers posted via Celestia DA](/img/blog/celestia-2.png)

![Celestia integration: batch submission tracking with block heights](/img/blog/celestia-3.png)

![Celestia integration: offer lifecycle and settlement state](/img/blog/celestia-4.png)

![Celestia integration: complete DA pipeline monitoring](/img/blog/celestia-5.png)

<iframe src="https://drive.google.com/file/d/1vqybh83YG5hR7eeDNlQVNpxSWQrWXqtG/preview" width="100%" height="480" allow="autoplay"></iframe>

## Parallel funnel architecture

EffectStream uses a "funnel" abstraction to read data from multiple blockchains through a unified interface. The Celestia funnel runs in parallel with other chain funnels: Celestia blocks arrive independently from the settlement chain, so the funnel ingests them concurrently. No blocking, no waiting for one chain to catch up to another.

This matters for multi-chain apps. In a game that settles on Cardano but posts moves to Celestia, you don't want Cardano's block time to bottleneck your data layer. Both chains process at their native speed, and the state machine receives events from each as they arrive.

## When to use a DA layer

A DA layer makes sense when:

- **High throughput**: your app generates more data than the settlement layer can handle economically
- **Low-value actions**: individual actions don't need settlement-layer security (a game move isn't a financial transaction)
- **Real-time requirements**: you need sub-second data posting, not the settlement chain's block time

We learned this the hard way building Tarochi (an earlier EffectStream game): using EVM as the DA layer caused sync time issues as the chain of events grew. Moving high-frequency data to a purpose-built DA layer keeps the settlement chain lean, handling only the transactions that actually need its security.

## Hybrid dApp pattern

With Celestia support, developers can build hybrid applications:

| Data type | Layer | Why |
|-----------|-------|-----|
| Game moves, chat messages, state updates | Celestia DA | Cheap, fast, high-throughput |
| Asset transfers, minting, contract calls | Settlement chain (Cardano/EVM) | Full security guarantees |

The developer configures which data goes where, and the framework handles routing, batching, and event delivery.

- [Celestia integration code (`bun-zswap-da` template)](https://github.com/effectstream/effectstream/tree/v-next-bun-start/bun-zswap-da)
- [Celestia documentation](https://celestia.org/developer-portal/)
