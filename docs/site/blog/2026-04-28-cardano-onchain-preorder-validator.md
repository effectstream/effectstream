---
slug: cardano-onchain-preorder-validator
title: "A Presale Contract on Cardano: On-Chain Purchase Receipts"
authors: [effectstream]
tags: [cardano, aiken, plutus, preorder, presale, utxorpc, technical]
---

A presale (a launchpad / preorder) sells a catalog of items before they exist: a buyer commits funds now, and the project records who bought what so it can fulfil later. The thing you actually want to guarantee is simple to say and surprisingly subtle to enforce: **a participation should only be recorded if the buyer really paid for it** — the right amount, to the right address, while the sale is open, and (optionally) crediting whoever referred them.

This post is about doing that guarantee *on-chain* on Cardano, with a small **Aiken minting-policy validator** that issues a "purchase receipt" only when the payment rules are met — and about where the rest of the presale logic (catalog, prices, conversion rates) lives so the whole thing stays deterministic. The same app also runs the EVM flow, and the Cardano contract is built to be **compatible with that EVM presale** — same catalog, same referral model, same recorded state — which we'll come back to once the Cardano picture is clear.

<!-- truncate -->

## The presale, as a contract

A presale needs four on-chain facts to be true at purchase time:

1. the **buyer authorized** this purchase,
2. they **paid at least the price** to the project's address,
3. the purchase happened **inside the sale window**, and
4. if there's a **referrer**, that referrer was paid their cut (and you can't refer yourself).

Everything else — what an item costs, how many are left, who has bought how much — is bookkeeping that can live off-chain *as long as the four facts above can't be faked*.

## Why a receipt has to be minted

The instinct is to put a script on the payment address and have it "check the payment." Cardano doesn't work that way. A Plutus validator runs only when a UTxO is **spent**, a token is **minted/burned**, or a reward is **withdrawn** — never when funds are merely *sent to* an address. There is no hook that fires "at deposit time."

So to validate *at purchase time*, with no shared on-chain state, the purchase transaction **mints a token**. Minting runs a **minting policy** in the same transaction as the payment, and that policy can demand — atomically — that the four facts hold. We call the minted token a **purchase receipt**: you cannot obtain one (and therefore cannot get a recorded participation) unless you paid correctly.

A second eUTxO fact shapes the design: **validators cannot read transaction metadata.** The `ScriptContext` exposes inputs, outputs, mint, validity range, signatories, datums and redeemers — not auxiliary data. So anything the *validator* must check has to travel in the **redeemer**. We keep human-readable purchase details in label-42 metadata for the off-chain indexer, but the validator never trusts it.

## The validator

The policy is parameterised at build time by the project's payment-credential hash, the referrer reward rate, and the sale window. On each mint it enforces:

```aiken
validator launchpad_receipt(
  payment_credential_hash: ByteArray,
  referrer_reward_bps: Int,
  sale_start: Int,
  sale_end: Int,
) {
  mint(redeemer: PurchaseRedeemer, policy_id: PolicyId, self: Transaction) {
    // (1) the buyer signed the transaction
    // (2) the tx validity range is fully inside [sale_start, sale_end]
    // (3) an output pays >= redeemer.claimed_lovelace to the project address
    // (4) if redeemer.referrer is set: it isn't the buyer, and an output pays it
    //     >= claimed_lovelace * referrer_reward_bps / 10000
    // (5) EXACTLY one receipt minted: assetName == buyer pkh, qty 1
    and { buyer_signed?, within_window?, paid_enough?, referral_ok?, mint_ok? }
  }
  else(_) { fail }
}
```

The `buyer`, `referrer`, and `claimed_lovelace` live in the redeemer because the policy must check them; the receipt's asset name is the buyer's verification-key hash, so the indexer can recover *who* paid straight from the mint.

Referral is **opt-in and buyer-supplied** — and worth being precise about, because it's easy to over-claim. *If* the redeemer names a referrer, the policy requires they be paid `referrer_reward_bps` of the price and that they aren't the buyer. It is deliberately **not** a hard guarantee: nothing forces a buyer to name a referrer. Someone who bypasses the UI can simply omit it and still get a perfectly valid receipt — they just get a transaction with no reward at the mint. The worst case of "gaming" it is that nobody gets credited; the purchase itself is never broken, and an honest UI fills the referrer in for you. (The EVM presale behaves identically — there the referrer is a caller-supplied argument too.)

## Prices, conversion, and rates — set on the L2

Item prices in a presale shouldn't be denominated in any one coin (ETH wei? lovelace? a stablecoin's 6 decimals?), and they shouldn't suffer floating-point drift. So each item carries **one unitless integer price `P`** (think "≈ USD"), and each accepted coin carries a conversion rate **`(x, n)`**. The amount owed in that coin's smallest unit is computed as **exactly**:

```
amount = P · x · 10^n        // pure integer / BigInt math — no rounding error
```

The coin table is one row per coin — `token / type / x / n` (+ decimals for display):

| token | type      | x   | n  | meaning                              |
|-------|-----------|-----|----|--------------------------------------|
| eth   | wei       | 5   | 14 | `P · 5·10^14` wei   (≈ $1 per unit)  |
| usdc  | microusdc | 1   | 6  | `P · 1·10^6`  micro-USDC             |
| ada   | lovelace  | 435 | 4  | `P · 435·10^4` lovelace (≈ $1)       |

So a `P = 5` item is `2.5·10^15` wei, `5·10^6` micro-USDC, or `2.175·10^7` lovelace — each derived independently, none converted *through* another.

These rates are **configuration, and configuration is set through the chain.** The presale's admin contract is the **EffectstreamL2** inbox: an admin submits a `set-coin` (or `create-campaign` / `set-product`) command on-chain, signed by the admin key, and the state machine applies it in block order. Updating a rate is a transaction, not a config-file edit — which means every node replays the exact same rates at the exact same heights, and the conversion stays deterministic. The Cardano validator is parameterised with the same `referrer_reward_bps` the admin configured, so the on-chain reward check and the recorded state agree.

## Ingestion: the generic UTxORPC primitive

The receipt mints are picked up with the generic **`Utxorpc:Generic`** primitive and a `mints_asset` predicate keyed on the receipt policy id:

```ts
.addPrimitive((sp) => sp.parallelUtxoRpc, () => ({
  name: "CardanoReceipt",
  type: PrimitiveTypeUtxorpcGeneric,
  stateMachinePrefix: "cardano-payment",
  predicate: { match: { cardano: { mints_asset: { policy_id: RECEIPT_POLICY_ID } } } },
}))
```

Dolos filters server-side for transactions that mint our receipt, and the primitive forwards the **raw protobuf transaction** as `{ hash, bytes }`. The state machine deserializes it (`cardano.Tx.fromBinary`), recovers the buyer pkh from the receipt token, sums the lovelace paid to the project address, and reads the items + referrer from metadata. The policy id is the single source of truth that must agree byte-for-byte across the off-chain tx builder, the sync predicate, and the state machine — so it's computed once (`build-validator.ts` applies the parameters and writes `temp/receipt-policy-id.txt`) and all three read the same file.

## The deterministic state machine

The validator guarantees the *per-transaction* invariants; the state machine owns the *bookkeeping* — and it's the same machine that handles the EVM flow, which is what makes the two chains **compatible**: one catalog, one referral model, one set of `participations` / `payments` tables. After decoding a receipt it recomputes the required amount from the configured price and the coin's `(x, n)`, applies the referral discount, checks supply, records the participation + a row in the unified `payments` ledger (valid/invalid), and emits an event the UI subscribes to. An EVM purchase and a Cardano purchase land as rows of the same shape, priced by the same unitless `P`.

So there are two layers of defense: the chain refuses to issue a receipt for an unsigned, under-funded, out-of-window, or mis-referred payment; and the state machine refuses to credit items whose metadata doesn't match the configured catalog and rates.

## Using it

`buyItemsCardano` builds the whole transaction — mint the receipt, pay the project, attach metadata, set the validity window, add the signer, and (optionally) pay the referrer:

```ts
// pay exactly the required lovelace → validator accepts → recorded valid
await buyItemsCardano(lucid, [[1, 1]], requiredLovelace);

// with a referrer → an output pays them their reward; self-referral is rejected on-chain
await buyItemsCardano(lucid, [[1, 1]], requiredLovelace, requiredLovelace, referrer);

// claim the required amount but underpay → YACI rejects the minting policy at submit
await buyItemsCardano(lucid, [[1, 1]], requiredLovelace, 1_000_000n);
```

## Running it

```bash
cd templates/preorder
bun install
bun run dev   # PGLite + Hardhat + YACI DevKit + Dolos + sync node + frontend
```

The orchestrator applies the validator parameters (computing the receipt policy id), brings up the chains and the sync node, and seeds a campaign + coin rates. From there, a Cardano purchase only lands in the database if it could mint a receipt — which it could only do by actually paying the project, as the signer, inside the sale window, with the referrer (if any) correctly rewarded.

## Hardening: specializing the contract

This design deliberately splits work: the validator proves *payment happened correctly*, and the L2 state machine is the authority on *catalog, prices, supply, and conversion rates*. That split is the right default — small validator, flexible config, rates you can re-tune with a transaction. But if you don't want to trust the L2 to verify a given fact, you can move it on-chain incrementally:

1. **Bind metadata to the receipt.** Set the receipt's asset name to `blake2b_256(canonical(items, buyer))` and have the validator require that exact name; the indexer recomputes the same hash and rejects on mismatch. Now the items can't disagree with what the chain validated — without trusting metadata at all.
2. **Move pricing on-chain.** Pass the price table (and the coin `(x, n)` rates) as a validator parameter, put the purchased items in the redeemer, and have the policy compute `required = Σ P_i · x · 10^n · qty_i` itself. The L2 no longer decides the price — it only records the outcome. (Cost: re-parameterising and re-deploying the policy whenever the catalog or a rate changes, which is exactly the flexibility you'd be trading away.)
3. **Enforce supply on-chain.** True global supply caps need shared state — a single "counter" UTxO threaded through every purchase, which serialises buyers and invites contention. The practical answer is a **sequencer/batcher** that orders purchase requests against one state UTxO; that's real work, and it's why the default leaves supply to the deterministic state machine.
4. **Tighten the window and the reward bearer.** Replace the dev-open `0 … 99999999999999` sale bounds with real POSIX-ms values, and decide whether the referrer reward is *deducted from* the price (project bears it) or *added on top* (buyer bears it) by adjusting the project-output check in `paid_enough` accordingly.

Each step trades flexibility for a stronger on-chain guarantee. Start from the split, and specialize only the facts you can't afford to leave to the L2.
