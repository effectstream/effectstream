---
slug: mina-zk-integration
title: "Cross-Chain Privacy: Mina Integration and Zero-Knowledge Proofs"
authors: [effectstream]
tags: [mina, zk-proofs, privacy, cross-chain]
---

`WRITE: Cardano provides strong settlement guarantees but all state is public. Mina's ZK-native design enables private state. By integrating both chains, EffectStream apps can have public settlement on Cardano with private computation via Mina — and later, local ZK proofs that don't require any ZK chain at all.`

<!-- truncate -->

## Reading Mina Blockchain State

EffectStream uses a "funnel" abstraction to read data from multiple blockchains through a unified interface. We added a Mina funnel, enabling the framework to parse and index Mina blockchain state alongside Cardano and EVM chains.

`WRITE: Brief explanation of the funnel system — what it abstracts, how adding a new chain works. A developer's state machine receives events from all configured chains without needing to know the details of each chain's data format.`

`ADD: Link to Mina funnel docs and code`

## Mina Wallet Support

Beyond reading Mina state, we added full Mina wallet support to EffectStream and the batcher system. Users can sign transactions with Mina wallets, making Mina a first-class chain in the framework.

`WRITE: What the batcher is (briefly, for readers new to EffectStream) — it aggregates user transactions and posts them to the blockchain, reducing per-user costs and enabling gasless interactions.`

## Building a Cross-Chain Game with Private State

To demonstrate the power of combining Cardano and Mina, we built a game template that uses both chains in a single application. Mina adds private state that wouldn't be possible natively on Cardano.

- [Source code](https://github.com/PaimaStudios/paima-game-templates/pull/74)

`WRITE: Concrete example — what private information does the game use? Hidden cards? Secret positions? A fog-of-war mechanic? How does Mina's ZK capability change what's possible in gameplay compared to a Cardano-only game?`

`ADD VIDEO HERE showing the game in action — highlight the moment where private state matters`

## Local Zero-Knowledge Proof Generation

After integrating with Mina's chain, we took the next step: computing ZK proofs locally without needing to settle to any ZK chain at all. This removes the dependency on Mina's network while retaining the privacy guarantees.

- [Same template codebase](https://github.com/PaimaStudios/paima-game-templates/pull/74)
- [Recursive proof research](https://github.com/PaimaStudios/paima-electricsql-prototype)

We're also working on recursive proof support — not just single proofs, but proofs that can verify other proofs, enabling more complex privacy-preserving computations.

`WRITE: Technical explanation — local ZK vs. chain-based ZK. What are the trade-offs?`
- **Latency**: local proofs are faster (no network round-trip)
- **Cost**: no on-chain fees for proof verification
- **Trust**: what trust assumptions change when you move from chain-verified to locally-verified proofs?

`WRITE: What recursive proofs enable that single proofs don't — composable privacy, incremental state verification, etc.`

## Conclusion

`WRITE: Summarize the journey — from reading Mina state, to wallet support, to a full cross-chain game, to removing the chain dependency entirely with local proofs. Each step expanded what's possible for privacy-preserving applications.`

- [Full template code](https://github.com/PaimaStudios/paima-game-templates/pull/74)

`ADD: README instructions for running the template locally, frontend demo link`

`ADD VIDEO HERE showing the complete privacy-enabled game`
