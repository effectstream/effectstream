---
slug: nft-launchpad
title: "Building a Cross-Chain NFT Launchpad"
authors: [effectstream]
tags: [nfts, launchpad, presale, smart-contracts, cardano, evm]
---

NFT launches are complicated. Creators need smart contracts for the sale, a UI for buyers, multi-chain payment support, proof of participation, and fulfillment tracking. We built a full launchpad platform that handles all of this, with EffectStream powering the backend state management and cross-chain payment processing.

<!-- truncate -->

![Launchpad UI, Cardano view with ADA prices, packages, and cart checkout](/img/blog/preorder-2.png)

## The pre-order smart contract

The foundation is a smart contract that manages the NFT pre-order lifecycle. When a campaign launches, the contract accepts deposits from participants. Each deposit is recorded with the contributor's wallet address, amount, and selected items. The contract enforces campaign rules: deposit limits, time windows, and refund conditions. If a campaign doesn't reach its goal, contributors can reclaim their funds. If it succeeds, the creator fulfills orders and distributes NFTs.

The contract uses Aiken for Cardano-side validation and Solidity for EVM. Transaction metadata is validated on-chain to ensure payment integrity, and merkle trees efficiently prove participation for later NFT claims.

- [Backend code](https://github.com/PaimaStudios/paima-preorder)

## Why separate deployments

The backend is powered by EffectStream, with each presale campaign running as its own deployment. This isn't just organizational; it's a performance decision.

If all campaigns shared one EffectStream instance, you'd need to resync one very long chain of events for every new campaign. That's especially painful when campaigns monitor multiple chains for payments, since each chain adds sync overhead. Separate deployments keep sync times fast and campaigns independent of each other.

EffectStream's NTP-based sync (instead of block-based) makes this practical. The "main clock" is an NTP server, which is very cheap to poll, rather than a blockchain. The system only fetches blockchain data when relevant events occur, so a lightweight campaign deployment costs almost nothing when idle.

## The launchpad UI

The launchpad UI supports both EVM and Cardano wallets. Creators set up sales with configurable parameters (countdown timers, reward tiers, package bundles, item catalogs). Buyers browse campaigns, add items to a cart, and contribute funds from whichever chain they prefer.

- [Launchpad portal components](https://github.com/PaimaStudios/paima-portal/tree/main/src/components/launchpad)
- [Portal integration PR](https://github.com/PaimaStudios/paima-portal/pull/7)

<iframe src="https://drive.google.com/file/d/1MiTyu_Et36zyE1qP7vWYG-2DEaUFyI-s/preview" width="100%" height="480" allow="autoplay"></iframe>

## Cross-chain payments

The launchpad accepts payments natively on each chain: Cardano users pay in ADA, EVM users pay in ETH or ERC-20 tokens. We originally planned to use bridge-based payments (Milkomeda for Cardano↔EVM), but pivoted to native chain primitives when the bridge infrastructure proved unreliable. Turned out to be simpler and more reliable anyway, with no dependency on third-party bridge availability.

All payments are tracked in the backend database with full transaction details:

![Database: cardano_payments table showing tx hashes, amounts, and block heights](/img/blog/preorder-3.png)

![Database: launchpad_user_items table mapping wallets to purchased items](/img/blog/preorder-4.png)

Proof-of-ownership endpoints let participants verify their contribution to a sale programmatically:

- [Ownership verification API](https://github.com/PaimaStudios/paima-preorder/blob/main/backend/api/src/controllers/userData.ts)

<iframe src="https://drive.google.com/file/d/1pqhMsz90IY_yruJRUBjjzUDFJKmAc960/preview" width="100%" height="480" allow="autoplay"></iframe>

## What this gets you

Creators get a turnkey platform for multi-chain NFT sales: deploy a campaign, configure tiers and pricing, accept payments from both Cardano and EVM wallets through a single interface. Buyers get a familiar e-commerce experience no matter which chain they're on.
