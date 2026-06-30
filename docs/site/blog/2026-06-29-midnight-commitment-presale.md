---
slug: midnight-commitment-presale
title: "Commitment Presales on Midnight: Buy In Without Locking Up"
authors: [effectstream]
tags: [presale, midnight, cardano, zero-knowledge, zswap, usdm, launchpad]
---

The EffectStream presale launchpad already handles Cardano L1 payments. This post covers what comes next: a commitment-based presale that settles on Midnight - a Cardano Partner Chain where every block is validated by Cardano SPOs - and lets buyers reserve a spot in multiple campaigns at the same time without locking their funds for any of them.

<!-- truncate -->

## What the launchpad already does

[Part one](/blog/cardano-onchain-preorder-validator) covered the Aiken on-chain validator: how a purchase receipt is enforced on Cardano L1 so a participation is only recorded if the buyer really paid. [Part two](/blog/cardano-presale-launchpad) covered the EffectStream app layer on top of it: campaigns created on-chain, a storefront UI that any team can clone and run with `bun run dev`, and UTxORPC so the sync layer catches up in seconds rather than reindexing the whole chain.

By the end of those two milestones the stack could accept ADA payments from Lace, Eternl, Nami, or NuFi, reconcile them in the same state machine as EVM payments, and surface purchases and balances per wallet. The settlement layer was Cardano L1.

This milestone upgrades the settlement layer.

## The commitment mechanic

A standard presale locks buyer funds the moment they commit. If you want to participate in three campaigns at once, you need three separate pools of capital - one per campaign - and you don't get any of it back until each campaign either hits its target or expires.

A commitment-based presale doesn't work that way. Here, a buyer commits to purchase, but nothing is locked. The commitment says "I can cover this" rather than "I have set this aside." A single pool of capital can back commitments in multiple campaigns simultaneously, because the system doesn't take custody of any funds until all of these are true at once:

1. The campaign's total commitment target is reached.
2. A settlement transaction fires.
3. Only then do the committed funds actually move.

If a campaign falls short of its target, no settlement fires and no funds were ever taken. If you were committed to five campaigns and two hit their targets, only those two settle - your funds back the other three commitments all the way until a settlement fires or you withdraw.

## Why this works: ZSwap

The reason a buyer can hold commitments in multiple campaigns without locking funds is Zero Knowledge ZSwap proofs.

When a buyer submits a commitment, the contract doesn't take their USDM. Instead it records a ZSwap proof: a cryptographic statement that the buyer controls at least as much USDM as the committed amount. The proof demonstrates solvency without revealing the actual balance and without transferring anything. The campaign contract verifies the proof and records the commitment. Multiple campaigns can each hold a verified commitment from the same buyer against the same funds, because none of them have custody.

When a campaign hits its target and settlement fires, the ZSwap proofs are resolved into actual transfers. Campaigns that settle first take priority. The system is designed so that a buyer who overextended their commitments across campaigns that all happen to hit targets at once will have the later settlements fail gracefully - their committed funds simply weren't available by the time those campaigns settled.

## USDM: the first Cardano-bridged asset on Midnight

The commitment currency is USDM - a stablecoin issued on Cardano and bridged onto Midnight via the Cardano-Midnight asset bridge. USDM is the first Cardano-native asset to appear on Midnight, which means that when a buyer commits, they are moving Cardano-native value through Midnight's ZK settlement layer and back.

This matters for the presale because it anchors the whole settlement chain to Cardano: the buyer's funds originate on Cardano, the Midnight bridge carries them, ZSwap proofs verify solvency on Midnight, and settlement can route back to Cardano wallets once a campaign closes.

## Midnight is a Cardano Partner Chain

Midnight is built on Input-Output's Partner Chains framework. Block production and ledger proofs settle into the Cardano blockchain, and any Cardano SPO can register permissionlessly as a Midnight block producer. The same node operators who secure Cardano secure Midnight. Running the presale settlement on Midnight is not a departure from Cardano - it is an extension of the Cardano validator set into a ZK-capable execution environment.

## The live demo

The hosted demo at [presale.zkdojo.com](https://presale.zkdojo.com/) runs the full flow: a creator deploys a commitment contract, buyers submit commitments backed by USDM and ZSwap proofs, and settlement fires once the target is reached. The site is live on Midnight mainnet. USDM wallets can connect and commit against real campaigns.

## The code

The commitment presale is open source under the EffectStream organisation:

- Commitment presale contracts and template (ZK Presale): https://github.com/effectstream/zswap-presale
- Preorder template (M1-M4 Cardano L1 stack, multi-chain): https://github.com/effectstream/effectstream/tree/v-next/templates/preorder

The prior deliverables - the Aiken validator, the UTxORPC sync layer, the storefront UI - are bridgeable into and out of this commitment settlement layer. Both stacks share the same EffectStream state machine shape; teams that built on the Cardano L1 template have a direct path to add Midnight commitment settlement without rewriting their app.

## Watch the full flow

<iframe width="100%" height="415" src="https://www.youtube.com/embed/bQtmEZ7cjNw" title="Commitment Presale on Midnight - EffectStream NFT Launchpad Milestone 5" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen></iframe>

The walkthrough covers the full commitment flow: deploying the contract, submitting a USDM-backed commitment with a ZSwap proof, verifying the proof lands on Midnight, and watching settlement trigger once the campaign target is reached.
