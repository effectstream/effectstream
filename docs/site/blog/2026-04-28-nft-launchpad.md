---
slug: nft-launchpad
title: "Building a Cross-Chain NFT Launchpad"
authors: [effectstream]
tags: [nfts, launchpad, presale, smart-contracts]
---

`WRITE: NFT launches are complex — creators need smart contracts for the sale, a UI for buyers, multi-chain payment support, proof of participation, and marketplace integration. We built a full launchpad platform that handles all of this, with EffectStream powering the backend state management.`

<!-- truncate -->

## The Pre-Order Smart Contract

The foundation is a smart contract that handles the NFT pre-order lifecycle: deposits, campaign management, and refund mechanics.

`ADD: Link to contract code`

`WRITE: How the contract works — what happens when a user deposits? How does a creator start and end a campaign? What are the refund conditions?`

## The Launchpad Backend

The backend is powered by EffectStream, with each presale running as its own deployment.

- [Backend code](https://github.com/PaimaStudios/paima-preorder)
- [Portal integration](https://github.com/PaimaStudios/paima-portal/pull/7)

`WRITE: Why separate deployments? If all campaigns shared one EffectStream instance, you'd need to resync one very long chain of events for every new campaign — especially painful if campaigns monitor multiple chains for payments. Separate deployments keep sync times fast and independent.`

`WRITE: How EffectStream's NTP-based sync (instead of block-based) makes this architecture more efficient — the "main clock" is an NTP server (very cheap) rather than a blockchain, so you're not wasting RPC calls fetching blocks you don't care about.`

`DECISION: Should we try to launch this service publicly?`

`ADD: GIF showing core flows — create campaign, contribute, view status`

## The Launchpad UI

A full user interface for managing campaigns — creators can set up sales, track progress, and manage payouts. Buyers can browse campaigns, contribute funds, and track their participation.

- [Launchpad portal components](https://github.com/PaimaStudios/paima-portal/tree/main/src/components/launchpad)

`ADD VIDEO HERE: Walk-through of all dApp functionality — create a campaign, contribute as a buyer, see the dashboard`

`ADD: Screenshots or Figma link showing the UI design`

## Cross-Chain Payments and Proof of Ownership

The launchpad supports participation from both Cardano and EVM wallets. Users can contribute from whichever chain they prefer.

We also built proof-of-ownership endpoints so participants can verify their contribution to a sale:

- [Ownership verification API](https://github.com/PaimaStudios/paima-preorder/blob/main/backend/api/src/controllers/userData.ts)

`WRITE: Explain the cross-chain evolution — we originally planned to use bridge payments (Milkomeda for Cardano↔EVM), but Milkomeda became non-viable and alternatives like Squid were still experimental. We pivoted to native chain primitives — accepting payments directly on each chain. This turned out to be simpler, more reliable, and didn't depend on third-party bridge infrastructure.`

We use Aiken smart contracts for transaction metadata validation and merkle trees to efficiently prove participation.

`BUILD: UI for proving sale participation (~1 day of work)`

## Conclusion

The end-to-end cross-chain flow: a user participates in a sale from their Cardano wallet, receives an NFT, transfers it to EVM, and lists it on OpenSea — all managed by a single platform.

`WRITE: Summarize what the launchpad enables — creators get a turnkey platform for multi-chain NFT sales, buyers get a familiar experience regardless of which chain they use.`

`INVESTIGATE: What exactly was the marketplace integration? Which marketplace, what was the integration flow?`

`ADD VIDEO HERE showing the full flow`
