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

The EVM contract exposes two payment paths — native (ETH) and ERC-20 — and emits a `BuyItems` event that the EffectStream state machine indexes:

```solidity
contract PaimaLaunchpad is OwnableUpgradeable, UUPSUpgradeable {
    event BuyItems(
        address indexed receiver,
        address indexed buyer,
        address indexed paymentToken,
        uint256 amount,
        address referrer,
        uint256[] itemsIds,
        uint256[] itemsQuantities
    );

    function buyItemsNative(
        address receiver,
        address payable referrer,
        uint256[] calldata itemsIds,
        uint256[] calldata itemsQuantities
    ) external payable { /* ... */ }

    function buyItemsErc20(
        address paymentToken,
        uint256 paymentAmount,
        address receiver,
        address referrer,
        uint256[] calldata itemsIds,
        uint256[] calldata itemsQuantities
    ) external { /* ... */ }
}
```

A factory contract (`PaimaLaunchpadFactory`) lets each campaign deploy its own launchpad instance with its own accepted-token list and referrer-reward configuration.

- [Preorder template](https://github.com/effectstream/effectstream/tree/v-next-bun-start/templates/preorder) — full multi-chain stack, runs locally with one command
- [EVM contract source (`PaimaLaunchpad.sol`)](https://github.com/effectstream/effectstream/blob/v-next-bun-start/templates/preorder/packages/contracts-evm/src/contracts/PaimaLaunchpad.sol)
- [Cardano contract integration](https://github.com/effectstream/effectstream/tree/v-next-bun-start/templates/preorder/packages/contracts-cardano)
- (Original repository: https://github.com/PaimaStudios/paima-preorder — preserved for reference)

## Why separate deployments

The backend is powered by EffectStream, with each presale campaign running as its own deployment. This isn't just organizational; it's a performance decision.

If all campaigns shared one EffectStream instance, you'd need to resync one very long chain of events for every new campaign. That's especially painful when campaigns monitor multiple chains for payments, since each chain adds sync overhead. Separate deployments keep sync times fast and campaigns independent of each other.

EffectStream's NTP-based sync (instead of block-based) makes this practical. The "main clock" is an NTP server, which is very cheap to poll, rather than a blockchain. The system only fetches blockchain data when relevant events occur, so a lightweight campaign deployment costs almost nothing when idle.

## The launchpad UI

The launchpad UI supports both EVM and Cardano wallets. Creators set up sales with configurable parameters (countdown timers, reward tiers, package bundles, item catalogs). Buyers browse campaigns, add items to a cart, and contribute funds from whichever chain they prefer.

- [Launchpad portal components](https://github.com/PaimaStudios/paima-portal/tree/main/src/components/launchpad)
- [Portal repository](https://github.com/PaimaStudios/paima-portal)

<iframe src="https://drive.google.com/file/d/1MiTyu_Et36zyE1qP7vWYG-2DEaUFyI-s/preview" width="100%" height="480" allow="autoplay"></iframe>

## Cross-chain payments

The launchpad accepts payments natively on each chain: Cardano users pay in ADA, EVM users pay in ETH or ERC-20 tokens. We originally planned to use bridge-based payments (Milkomeda for Cardano↔EVM), but pivoted to native chain primitives when the bridge infrastructure proved unreliable. Turned out to be simpler and more reliable anyway, with no dependency on third-party bridge availability.

All payments are tracked in the backend database with full transaction details:

![Database: cardano_payments table showing tx hashes, amounts, and block heights](/img/blog/preorder-3.png)

![Database: launchpad_user_items table mapping wallets to purchased items](/img/blog/preorder-4.png)

The state machine handles two distinct payment paths — EVM events and Cardano UTXO outputs — under a unified schema:

```typescript
import { Stm } from "@effectstream/sm";
import { grammar } from "./grammar.ts";
import { World } from "@effectstream/coroutine";

const stm = new Stm<typeof grammar, {}>(grammar);

// EVM purchase event (from the BuyItems event above)
stm.addStateTransition("buy-items", function* (data) {
  const { receiver, paymentToken, amount, itemsIds, itemsQuantities }
    = data.parsedInput;

  // Validate items, supply limits, payment amount...
  const validationResult = yield* validateItems(/* ... */);

  yield* World.resolve(insertParticipation, {
    launchpad: launchpadData.address,
    wallet: receiver,
    payment_token: paymentToken,
    payment_amount: amount,
    item_ids: itemsIds.join(","),
    item_quantities: itemsQuantities.join(","),
    chain: "evm",
    participation_valid: validationResult !== null,
  });
});

// Cardano payment — read UTXO outputs + transaction metadata (label 42)
stm.addStateTransition("cardano-payment", function* (data) {
  const { txId, outputs, metadata } = data.parsedInput;
  // Metadata format: { "42": [{ k: "p", v: "preorder" },
  //                          { k: "w", v: walletBech32 },
  //                          { k: "i", v: [[itemId, qty], ...] }] }
  const metaItems = parseMetadataItems(metadata);

  for (const output of JSON.parse(outputs)) {
    const matchingLaunchpad = launchpadsData.find(
      (l) => l.cardanoPaymentAddressHex === output.address,
    );
    if (!matchingLaunchpad) continue;

    yield* World.resolve(insertCardanoPayment, {
      tx_hash: txId,
      amount: output.coin,
      payment_address: matchingLaunchpad.cardanoPaymentAddress,
      block_height: data.blockHeight,
    });
    // ... item validation and participation upsert
  }
});
```

The two handlers write to the same `participations` and `launchpad_user_items` tables, so a downstream consumer (the portal UI, an off-chain fulfillment service) sees a uniform view regardless of which chain the buyer paid on.

## Running the template locally

The Preorder template ships as a one-command stack: PGLite, Hardhat, YACI DevKit, Dolos, the sync node, and the frontend all come up together under the EffectStream orchestrator.

```bash
git clone https://github.com/effectstream/effectstream.git --branch v-next-bun-start
cd effectstream/templates/preorder
bun install
bun run dev
```

The orchestrator starts each component on a dedicated port:

| Component         | Tool             | Port                              |
|-------------------|------------------|-----------------------------------|
| Database          | PGLite           | 5432                              |
| EVM Chain         | Hardhat          | 8545                              |
| Cardano Node      | YACI DevKit      | 10000 (admin), 3001 (node)        |
| Cardano Indexer   | Dolos            | 50051 (gRPC), 3000 (Blockfrost)   |
| Sync Node API     | EffectStream     | 9999                              |
| Frontend          | Vite + Fastify   | 10599                             |

Open http://localhost:10599 and the full launchpad is live against the local devnets — you can mint test ERC-20s and ADA, buy items with each, and watch the participations land in PostgreSQL in real time.

The same `start.dev.ts` config also drives the E2E test suite (`bun run test`), which covers infrastructure boot, native ETH purchase, ERC-20 purchase, validation (supply limits, underpayment), Cardano ADA payment, the REST API, and the frontend build.

## Offline by design

The launchpad isn't deployed as a single shared site, and that's a deliberate decision. Each presale campaign is its own EffectStream deployment: separate database, separate sync node, separate frontend. Three reasons:

1. **Sync cost** — if every campaign shared one deployment, each new launch would pay the sync cost of every chain ever monitored. Independent deployments keep sync times bounded per campaign.
2. **Operator independence** — a creator can take their campaign down without affecting anyone else's; an operator can hard-fork the template to add custom validation, accept exotic payment tokens, or wire in their own KYC.
3. **Devnet-first development** — the YACI DevKit + Hardhat stack runs entirely on the developer's machine. You can iterate on contract logic, test edge cases (underpayment, supply exhaustion, refund flows), and validate the full multi-chain pipeline before touching mainnet. The same template config and tests carry over to testnet and mainnet deployments unchanged.

The trade-off is that there's no single hosted demo to click through. Instead, anyone can clone the template and have a full multi-chain launchpad running on their machine in under five minutes — and that local stack is the same stack a real campaign would deploy to production.

## What this gets you

Creators get a turnkey platform for multi-chain NFT sales: deploy a campaign, configure tiers and pricing, accept payments from both Cardano and EVM wallets through a single interface. Buyers get a familiar e-commerce experience no matter which chain they're on.
