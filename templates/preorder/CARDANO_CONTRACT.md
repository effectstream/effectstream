# Add an On‑Chain Cardano Validator (Aiken) to the Preorder Template

> **Audience:** an automated coding agent executing this end‑to‑end with **no other context**.
> Everything you need is in this file. Read it top to bottom before touching code.
> All paths are relative to the template root `templates/preorder/` unless stated otherwise.

---

## 0. What you are building (the one‑paragraph summary)

Today the preorder template accepts Cardano payments by having a buyer send ADA to a **plain
payment address** with item info in **transaction metadata**. Nothing is validated on‑chain — the
sync node’s state machine (STM) does all checks off‑chain. You will add an **Aiken minting‑policy
validator** that gates each purchase *atomically with the payment*: a buyer can only mint a
"purchase receipt" token if, **in the same transaction**, they (a) signed it, (b) paid at least the
claimed amount to the launchpad address, and (c) did so inside the sale window. The sync node then
watches for these receipt mints using the **generic UTxORPC primitive + a predicate**, decodes the
transaction, and records the purchase — now able to *trust* that payment actually happened on‑chain.

You are explicitly using **`UtxorpcGenericPrimitive` (`type: "Utxorpc:Generic"`) + a `mints_asset`
predicate**, not the builtin `Cardano:Transfer` primitive. The consequence (see §1) is that the STM
receives the **raw protobuf‑serialized transaction** and must deserialize it itself. This file gives
you a ready‑made decoder for that.

---

## 1. Cardano facts you MUST internalize (these drive the whole design)

These are non‑obvious and getting them wrong will waste hours. Read carefully.

1. **A validator does NOT run when funds are *sent to* a script/address. It runs only when a UTxO is
   *spent*, a token is *minted/burned*, or a reward is *withdrawn*.**
   → Therefore you cannot validate a "deposit" to a payment address. To validate *at purchase time*
   with no shared state, the purchase transaction must **mint a token**, which runs a **minting
   policy** in the same transaction as the payment. That is the design here.

2. **Plutus validators CANNOT read transaction metadata.** The `ScriptContext` exposes inputs,
   outputs, mint, validity range, signatories, datums, and redeemers — **not** auxiliary
   data/metadata.
   → Any value the *validator* must check (the buyer, the claimed amount) is carried in the
   **redeemer**. The label‑42 metadata is kept only as a convenience for the STM and is **NOT
   trusted by the validator**. The STM independently re‑checks prices (defense in depth).

3. **The generic primitive forwards the raw protobuf tx, not parsed fields.**
   `UtxorpcGenericPrimitive.getPayload()` emits `{ hash, bytes }` where `bytes` is the hex of
   `cardano.Tx.toBinary()` (a `@utxorpc/spec` protobuf‑es **v1** message). The STM must call
   `cardano.Tx.fromBinary(...)` to get outputs/metadata/assets. (The builtin `Cardano:Transfer`
   primitive pre‑parses these; we are deliberately not using it.)

4. **Validity ranges need correct slot config.** `validFrom`/`validTo` are POSIX‑ms in Lucid but
   become slots on‑chain. You must seed `SLOT_CONFIG_NETWORK["Custom"]` from YACI’s devnet start time
   (helper provided) or the validator’s window check will compare garbage.

5. **The minting `policy_id` must be byte‑identical** across three places: the off‑chain tx builder,
   the sync `predicate`, and the STM. It changes whenever the validator’s **parameters** change. So
   compute it **once** and write it to a file that all three read.

6. **Aggregate state (total supply, per‑user cumulative spend) cannot cheaply live on‑chain** in the
   eUTxO model — a shared "counter" UTxO causes transaction contention. Keep those checks in the STM
   (exactly as the EVM path already does). The validator only enforces per‑transaction invariants.

---

## 2. Current state (what exists today — for orientation)

- **`packages/contracts-cardano/`** — YACI DevKit + Dolos + Lucid Evolution helpers. No on‑chain
  script. `cardano-helpers.ts` has `sendAdaPayment()` (pay to address + metadata label 42).
  `constants.ts` exports `CARDANO_PAYMENT_ADDRESS`.
- **`packages/node/config.dev.ts`** — registers a `CARDANO_UTXORPC_PARALLEL` sync protocol and a
  `Cardano:Transfer` primitive with `stateMachinePrefix: "cardano-payment"` and `predicate: {}`.
- **`packages/node/grammar.ts`** — `"cardano-payment": builtinGrammars.cardanoTransfer`.
- **`packages/node/state-machine.ts`** — a `cardano-payment` transition that reads pre‑parsed
  `parsedInput.outputs` + `parsedInput.metadata`, matches `cardanoPaymentAddressHex`, validates item
  prices (wei → lovelace via `ETH_TO_ADA_RATE`), and writes `cardano_payments` /
  `launchpad_participations` / `launchpad_user_items` / `launchpad_users`.
- **`packages/node/launchpad-config.ts`** — `launchpadsData[0]` has `cardanoPaymentAddress`,
  `cardanoPaymentAddressHex`, item `prices` keyed by `ZERO_ADDRESS`; exports `ETH_TO_ADA_RATE` and
  `ZERO_ADDRESS`.
- **DB schema** (`packages/database/migrations/000-init.sql`) already has all needed tables. **No
  migration changes required.**

You will **replace** the `cardano-payment` grammar entry, primitive, and STM transition body. The
prefix name `"cardano-payment"` is kept to minimize churn; only its grammar shape and handler change.

A working precedent for an Aiken validator wired into Effectstream lives in
`templates/projected-nft-preorder/` (loads `plutus.json` via Lucid, watches a script via a builtin
primitive). Copy its slot‑config and validator‑loading idioms where noted.

---

## 3. Target architecture & data flow

```
Buyer (Lucid Evolution tx):
  mintAssets({ [policyId+buyerPkh]: 1 }, redeemer=PurchaseRedeemer{buyer, claimed_lovelace})
  + attach minting policy (PlutusV3, param-applied)
  + pay.ToAddress(CARDANO_PAYMENT_ADDRESS, { lovelace: payAmount })
  + attachMetadata(42, { p:"preorder", w:[buyerPkh...], i:[[id,qty],...] })   // for STM only
  + validFrom/validTo within sale window
  + addSigner(buyer)
        │  submit → YACI node runs the minting policy on-chain (REJECTS if invalid)
        ▼
Dolos indexes the block (UTxORPC :50051)
        │
        ▼
Sync node: CARDANO_UTXORPC_PARALLEL protocol
  → UtxorpcGenericPrimitive (type "Utxorpc:Generic")
  → predicate { match:{ cardano:{ mints_asset:{ policy_id: RECEIPT_POLICY_ID } } } }
  → emits STM input "cardano-payment" with { hash, bytes }
        │
        ▼
STM "cardano-payment" transition:
  cardano.Tx.fromBinary(bytes)
  → find receipt token (policyId) → buyerPkh = its asset name
  → sum lovelace paid to cardanoPaymentAddressHex
  → read items from metadata label 42
  → re-check price (wei→lovelace), supply (aggregate, off-chain)
  → write cardano_payments / participations / user_items / users; emit PreorderPlaced
```

Validator value‑add over today: you cannot obtain a receipt (and thus a recorded participation)
without an **on‑chain‑enforced** payment to the right address, by the signing buyer, within the sale
window. Item‑level pricing and supply remain authoritative in the STM (same philosophy as the EVM
contract, which also leaves those off‑chain).

---

## 4. Step 1 — Write & build the Aiken validator

### 4.1 Install the Aiken toolchain (if missing)

```bash
# Preferred: aikup version manager
curl -sSfL https://install.aiken-lang.org | bash
aikup install v1.1.9        # or latest stable
# OR Homebrew:
# brew install aiken-lang/tap/aiken
aiken --version              # verify
```

### 4.2 Create the Aiken project under `packages/contracts-cardano/aiken/`

`packages/contracts-cardano/aiken/aiken.toml`:

```toml
name = "preorder/launchpad-receipt"
version = "0.0.0"
compiler = "v1.1.9"
plutus = "v3"
license = "MIT"

[repository]
user = "preorder"
project = "launchpad-receipt"
platform = "github"

[[dependencies]]
name = "aiken-lang/stdlib"
version = "v2.2.0"
source = "github"
```

`packages/contracts-cardano/aiken/validators/launchpad_receipt.ak`:

```aiken
use aiken/collection/dict
use aiken/collection/list
use aiken/interval.{Finite}
use cardano/address.{Script, VerificationKey}
use cardano/assets.{PolicyId, lovelace_of, tokens}
use cardano/transaction.{Output, Transaction}

/// Purchase intent. NOTE: this is the REDEEMER (validators cannot read metadata),
/// so the data the policy enforces must live here.
pub type PurchaseRedeemer {
  buyer: ByteArray,
  // verification-key hash of the buyer (28 bytes)
  claimed_lovelace: Int,
}

// payment_credential_hash : payment part of the launchpad CARDANO_PAYMENT_ADDRESS
// sale_start / sale_end    : POSIX milliseconds bounding the sale window
validator launchpad_receipt(
  payment_credential_hash: ByteArray,
  sale_start: Int,
  sale_end: Int,
) {
  mint(redeemer: PurchaseRedeemer, policy_id: PolicyId, self: Transaction) {
    let Transaction { outputs, mint, extra_signatories, validity_range, .. } =
      self

    // (1) buyer authorized the transaction
    let buyer_signed = list.has(extra_signatories, redeemer.buyer)

    // (2) tx validity range fully inside [sale_start, sale_end]
    let within_window =
      when (
        validity_range.lower_bound.bound_type,
        validity_range.upper_bound.bound_type,
      ) is {
        (Finite(lo), Finite(hi)) -> lo >= sale_start && hi <= sale_end
        _ -> False
      }

    // (3) some output pays >= claimed_lovelace to the launchpad payment address
    let paid_enough =
      list.any(
        outputs,
        fn(o) {
          pays_to(o, payment_credential_hash) && lovelace_of(o.value) >= redeemer.claimed_lovelace
        },
      )

    // (4) EXACTLY one receipt minted under this policy: assetName == buyer pkh, qty 1
    let minted = tokens(mint, policy_id) |> dict.to_pairs()
    let mint_ok = minted == [Pair(redeemer.buyer, 1)]

    and {
      buyer_signed?,
      within_window?,
      paid_enough?,
      mint_ok?,
    }
  }

  else(_) {
    fail
  }
}

fn pays_to(o: Output, hash: ByteArray) -> Bool {
  when o.address.payment_credential is {
    VerificationKey(h) -> h == hash
    Script(h) -> h == hash
  }
}
```

> **⚠️ Iterate with `aiken check`.** The four checks above are the *contract logic* and must not
> change. The exact stdlib symbol names/namespaces drift between stdlib versions (e.g.
> `cardano/transaction` vs `aiken/transaction`, `validity_range.lower_bound.bound_type`,
> `dict.to_pairs`). If `aiken check` reports unknown imports/fields, fix the **API names** to match
> the installed stdlib while preserving the logic. Do not give up and stub the validator.

### 4.3 Build → produce `plutus.json`

```bash
cd packages/contracts-cardano/aiken
aiken check          # must pass
aiken build          # writes ./plutus.json
cp plutus.json ../plutus.json   # the off-chain code loads it from contracts-cardano/plutus.json
cd -
```

Commit both `aiken/` sources and the generated `packages/contracts-cardano/plutus.json`. (The repo
convention — see `projected-nft-preorder` — is to commit the compiled `plutus.json`; the orchestrator
does **not** run `aiken build`.)

The validator’s entry in `plutus.json` will have a `title` like
`launchpad_receipt.launchpad_receipt.mint`. The loader below matches by the `launchpad_receipt`
prefix, so the exact suffix does not matter.

---

## 5. Step 2 — Off‑chain: apply params, compute the policy id, build purchase tx

### 5.1 `packages/contracts-cardano/build-validator.ts` (NEW)

Applies the validator parameters and writes the single source of truth for the policy id + applied
script. Run once (before sync starts) — wired into the orchestrator in §8.

```ts
import fs from "node:fs";
import path from "node:path";
import {
  applyParamsToScript,
  applyDoubleCborEncoding,
  mintingPolicyToId,
  paymentCredentialOf,
} from "@lucid-evolution/utils";
import { CARDANO_PAYMENT_ADDRESS } from "./constants.ts";

const __dirname = import.meta.dirname!;

// Dev: open sale window. Production: set real POSIX-ms bounds.
const SALE_START = 0n;
const SALE_END = 99_999_999_999_999n;

const plutus = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "plutus.json"), "utf-8"),
);
const v = plutus.validators.find((x: any) =>
  String(x.title).startsWith("launchpad_receipt")
);
if (!v) throw new Error("launchpad_receipt validator not found in plutus.json");

const paymentHash = paymentCredentialOf(CARDANO_PAYMENT_ADDRESS).hash;

// Param order MUST match the validator signature: (payment_credential_hash, sale_start, sale_end)
const appliedScript = applyParamsToScript(
  applyDoubleCborEncoding(v.compiledCode),
  [paymentHash, SALE_START, SALE_END],
);

const policy = { type: "PlutusV3" as const, script: appliedScript };
const policyId = mintingPolicyToId(policy);

const outDir = path.resolve(__dirname, "temp");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "receipt-policy-id.txt"), policyId);
fs.writeFileSync(path.join(outDir, "receipt-applied-script.txt"), appliedScript);
fs.writeFileSync(
  path.join(outDir, "receipt-params.json"),
  JSON.stringify(
    { paymentHash, saleStart: String(SALE_START), saleEnd: String(SALE_END) },
    null,
    2,
  ),
);
console.log("[build-validator] PlutusV3 receipt policy id:", policyId);
```

> If at runtime the policy id seems wrong (tx rejected with "policy not found" / mismatch), the
> double‑CBOR wrapping is the usual culprit. Try `applyParamsToScript(v.compiledCode, [...])`
> **without** `applyDoubleCborEncoding`, or wrap the *result* instead. Use whichever makes
> `mintingPolicyToId` agree with the policy id YACI reports. Pin it once and never change it.

### 5.2 Add slot config + a purchase helper to `packages/contracts-cardano/cardano-helpers.ts`

Add the slot‑config helper (copied from `projected-nft-preorder/.../cardano-tx-helpers.ts`) and a new
`buyItemsCardano()`. Keep the existing exports. New imports needed at the top of the file:

```ts
import {
  Constr,
  Data,
  SLOT_CONFIG_NETWORK,
} from "@lucid-evolution/lucid";
import {
  applyParamsToScript,            // not strictly needed here; harmless if unused
  mintingPolicyToId,
  paymentCredentialOf,
  toUnit,
} from "@lucid-evolution/utils";
import fs from "node:fs";
import path from "node:path";
```

Append these functions:

```ts
let slotConfigInitialized = false;

/** Seed Lucid's "Custom" slot config from YACI so validFrom/validTo map to correct slots. */
export async function ensureYaciSlotConfig(force = false): Promise<void> {
  if (slotConfigInitialized && !force) return;
  const res = await fetch(`${YACI_ADMIN_URL}/local-cluster/api/admin/devnet`);
  const devnet = await res.json();
  SLOT_CONFIG_NETWORK["Custom"] = {
    zeroTime: devnet.startTime * 1000,
    zeroSlot: 0,
    slotLength: 1000,
  };
  slotConfigInitialized = true;
}

function loadReceiptPolicy() {
  const __dirname = import.meta.dirname!;
  const appliedScript = fs
    .readFileSync(path.resolve(__dirname, "temp/receipt-applied-script.txt"), "utf-8")
    .trim();
  const policy = { type: "PlutusV3" as const, script: appliedScript };
  return { policy, policyId: mintingPolicyToId(policy) };
}

/**
 * Build & submit a purchase: mint 1 receipt token (assetName = buyer pkh), pay `payLovelace`
 * to the launchpad address, attach label-42 metadata for the STM.
 *
 * `claimedLovelace` is what the on-chain validator checks (paid >= claimed).
 * `payLovelace` lets tests underpay (payLovelace < claimedLovelace) to prove on-chain rejection.
 */
export async function buyItemsCardano(
  lucid: LucidEvolution,
  items: [number, number][],
  claimedLovelace: bigint,
  payLovelace: bigint = claimedLovelace,
): Promise<{ txHash: string; policyId: string; buyerPkh: string }> {
  await ensureYaciSlotConfig(true);
  const { policy, policyId } = loadReceiptPolicy();

  const buyerAddr = await lucid.wallet().address();
  const buyerPkh = paymentCredentialOf(buyerAddr).hash; // 28-byte hex
  const unit = toUnit(policyId, buyerPkh);               // assetName = buyer pkh

  // Redeemer PurchaseRedeemer { buyer: ByteArray, claimed_lovelace: Int } -> Constr(0, [...])
  const redeemer = Data.to(new Constr(0, [buyerPkh, claimedLovelace]));

  // metadata `w` (sender) is chunked to <=64 chars like the existing sendAdaPayment()
  const w = buyerPkh.length > 64
    ? [buyerPkh.slice(0, 64), buyerPkh.slice(64)]
    : [buyerPkh];

  const now = Date.now();
  const tx = lucid
    .newTx()
    .mintAssets({ [unit]: 1n }, redeemer)
    .attach.MintingPolicy(policy)
    .pay.ToAddress(CARDANO_PAYMENT_ADDRESS, { lovelace: payLovelace })
    .attachMetadata(42, { p: "preorder", w, i: items.map(([id, qty]) => [id, qty]) })
    .validFrom(now - 10_000)
    .validTo(now + 60_000)
    .addSigner(buyerAddr);

  // localUPLCEval:false → use provider.evaluateTx stub; real validation happens at YACI submit.
  const signed = await (await tx.complete({ localUPLCEval: false })).sign.withWallet().complete();
  const txHash = await signed.submit();
  console.log(`[Lucid] Purchase TX submitted: ${txHash} (policy=${policyId}, buyer=${buyerPkh})`);
  await lucid.awaitTx(txHash);
  return { txHash, policyId, buyerPkh };
}
```

> `CARDANO_PAYMENT_ADDRESS` and `YACI_ADMIN_URL` are already defined/imported in this file. Reuse the
> existing ones; do not redeclare.

---

## 6. Step 3 — Sync node: generic primitive + predicate + tx decoder

### 6.1 `packages/node/cardano-receipt.ts` (NEW) — single source of the policy id for the node

```ts
import fs from "node:fs";
import path from "node:path";

let policyId = "";
try {
  policyId = fs
    .readFileSync(
      path.resolve(import.meta.dirname!, "../contracts-cardano/temp/receipt-policy-id.txt"),
      "utf-8",
    )
    .trim();
} catch {
  console.warn("[cardano-receipt] receipt-policy-id.txt not found yet — predicate will match nothing");
}

export const RECEIPT_POLICY_ID = policyId;
```

### 6.2 `packages/node/decode-utxorpc-tx.ts` (NEW) — deserialize the protobuf tx in the STM

The generic primitive gives `{ hash, bytes }`; `bytes` is hex of `cardano.Tx.toBinary()`. This decodes
it, reusing the exact extraction logic the builtin `Cardano:Transfer` primitive uses.

```ts
import { cardano } from "@utxorpc/spec";
import { hexStringToUint8Array, uint8ArrayToHexString } from "@effectstream/utils";

export interface DecodedOutput {
  index: number;
  address: string; // hex of raw address bytes (matches launchpad cardanoPaymentAddressHex)
  coin: string;    // lovelace as decimal string
  assets: { policyId: string; assetName: string; amount: string }[];
}

export interface DecodedTx {
  txId: string;
  outputs: DecodedOutput[];
  metadata: Record<string, unknown> | null; // { "42": [ {k,v}, ... ] }
}

function bigIntToString(bi: cardano.BigInt): string {
  const inner = bi.bigInt;
  if (inner.case === "int") return String(inner.value);
  if (inner.case === "bigUInt") {
    let r = 0n;
    for (const b of inner.value) r = (r << 8n) | BigInt(b);
    return String(r);
  }
  if (inner.case === "bigNInt") {
    let r = 0n;
    for (const b of inner.value) r = (r << 8n) | BigInt(b);
    return String(-r);
  }
  return "0";
}

function assetQuantityToString(asset: cardano.Asset): string {
  const q = asset.quantity;
  if (q.case === "outputCoin" || q.case === "mintCoin") return bigIntToString(q.value);
  return "0";
}

function metadatumToJson(m: cardano.Metadatum): unknown {
  const inner = m.metadatum;
  if (!inner || inner.case === undefined) return null;
  switch (inner.case) {
    case "int": return String(inner.value);
    case "bytes": return uint8ArrayToHexString(inner.value);
    case "text": return inner.value;
    case "array": return inner.value.items.map(metadatumToJson);
    case "map":
      return inner.value.pairs.map((p) => ({
        k: p.key ? metadatumToJson(p.key) : null,
        v: p.value ? metadatumToJson(p.value) : null,
      }));
    default: return null;
  }
}

function metadataToJson(metadata: cardano.Metadata[]): Record<string, unknown> | null {
  if (!metadata || metadata.length === 0) return null;
  const result: Record<string, unknown> = {};
  for (const entry of metadata) {
    result[String(entry.label)] = entry.value ? metadatumToJson(entry.value) : null;
  }
  return result;
}

export function decodeUtxorpcTx(bytesHex: string): DecodedTx {
  const tx = cardano.Tx.fromBinary(hexStringToUint8Array(bytesHex));
  const txId = uint8ArrayToHexString(tx.hash);

  const outputs: DecodedOutput[] = tx.outputs.map((out, index) => {
    const address = uint8ArrayToHexString(out.address);
    const coin = out.coin?.bigInt.case === "int"
      ? String(out.coin.bigInt.value)
      : out.coin?.bigInt.case === "bigUInt"
      ? (() => {
          let r = 0n;
          for (const b of out.coin!.bigInt.value as Uint8Array) r = (r << 8n) | BigInt(b);
          return String(r);
        })()
      : "0";

    const assets: DecodedOutput["assets"] = [];
    for (const ma of out.assets) {
      const policyId = uint8ArrayToHexString(ma.policyId);
      for (const a of ma.assets) {
        assets.push({
          policyId,
          assetName: uint8ArrayToHexString(a.name),
          amount: assetQuantityToString(a),
        });
      }
    }
    return { index, address, coin, assets };
  });

  const metadata = metadataToJson(tx.auxiliary?.metadata ?? []);
  return { txId, outputs, metadata };
}
```

> `cardano.Tx.fromBinary` is the protobuf‑es **v1** static deserializer (the codebase uses
> `payload.tx.toBinary()`, confirming v1). If `@utxorpc/spec` resolves to a v2 build in this repo
> later, swap to `fromBinary(cardano.TxSchema, bytes)`. As of `@utxorpc/spec@^0.18.1` (the version the
> sync package depends on) the v1 form above is correct.

### 6.3 Edit `packages/node/grammar.ts` — point `cardano-payment` at the generic grammar

Replace the file with:

```ts
import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "@effectstream/concise";
import { buyItemsGrammar } from "./primitives.ts";

// UtxorpcGenericPrimitive forwards { hash, bytes }; the STM decodes `bytes` itself.
export const utxorpcGenericGrammar = [
  ["hash", Type.String()],
  ["bytes", Type.String()],
] as const;

export const grammar = {
  "buy-items": buyItemsGrammar,
  "cardano-payment": utxorpcGenericGrammar,
} as const satisfies GrammarDefinition;
```

(Remove the old `import { builtinGrammars } from "@effectstream/sm/grammar";` line.)

### 6.4 Edit `packages/node/config.dev.ts` — swap the primitive + add the predicate

Add imports near the top:

```ts
import { PrimitiveTypeUtxorpcGeneric } from "@effectstream/sm/builtin";
import { RECEIPT_POLICY_ID } from "./cardano-receipt.ts";
```

Remove the old import of `PrimitiveTypeCardanoTransfer` if it is now unused.

Replace the **second `.addPrimitive(...)`** block (the one whose `type` is
`PrimitiveTypeCardanoTransfer` / `name: "CardanoTransfer"`) with:

```ts
.addPrimitive(
  (syncProtocols) => (syncProtocols as any).parallelUtxoRpc,
  () => ({
    name: "CardanoReceipt",
    type: PrimitiveTypeUtxorpcGeneric, // "Utxorpc:Generic"
    startBlockHeight: 1,
    stateMachinePrefix: "cardano-payment",
    // Match any tx whose outputs carry a token of our receipt policy.
    // (Client-side matching in the sync layer guarantees correctness even if
    //  Dolos server-side filtering is loose.)
    predicate: RECEIPT_POLICY_ID
      ? { match: { cardano: { mints_asset: { policy_id: RECEIPT_POLICY_ID } } } }
      : {},
  }),
)
```

> **Why `mints_asset` works:** the sync predicate matcher checks tx **outputs** for an asset of the
> given `policy_id`. The receipt token is sent to the buyer in an output, so the purchase tx matches.
> No `userDefinedPrimitives` registration is needed — `Utxorpc:Generic` is a builtin already in the
> runtime registry. (Only the custom `EVM:BUY-ITEMS` primitive needs registration in `main.dev.ts`;
> leave that untouched.)

### 6.5 Edit `packages/node/state-machine.ts` — rewrite the `cardano-payment` transition

Add imports at the top:

```ts
import { decodeUtxorpcTx } from "./decode-utxorpc-tx.ts";
import { RECEIPT_POLICY_ID } from "./cardano-receipt.ts";
```

Replace the **entire** `stm.addStateTransition("cardano-payment", function* (data) { ... })` block
with:

```ts
stm.addStateTransition(
  "cardano-payment",
  function* (data) {
    const { bytes } = data.parsedInput as { hash: string; bytes: string };

    let tx;
    try {
      tx = decodeUtxorpcTx(String(bytes));
    } catch (e) {
      console.log("[STM:cardano-payment] failed to decode tx bytes:", String(e));
      return;
    }

    // Dev: single launchpad. (Generalize by matching the payment address below.)
    const launchpad = launchpadsData[0];
    if (!launchpad) return;

    // (a) confirm the receipt token is present and recover the buyer pkh (= asset name)
    let buyerPkh: string | null = null;
    let paidLovelace = 0n;
    for (const out of tx.outputs) {
      for (const a of out.assets) {
        if (RECEIPT_POLICY_ID && a.policyId === RECEIPT_POLICY_ID) buyerPkh = a.assetName;
      }
      if (out.address === launchpad.cardanoPaymentAddressHex) {
        paidLovelace += BigInt(out.coin);
      }
    }
    if (!buyerPkh) {
      console.log("[STM:cardano-payment] no receipt token found; ignoring tx", tx.txId);
      return;
    }

    // (b) parse label-42 metadata for items + sender (same shape as before: { "42": [ {k,v} ] })
    let metaItems: [number, number][] | null = null;
    let metaSender: string | null = null;
    try {
      const label42 = (tx.metadata as any)?.["42"];
      if (Array.isArray(label42)) {
        const pEntry = label42.find((e: any) => e.k === "p");
        if (pEntry?.v === "preorder") {
          const wEntry = label42.find((e: any) => e.k === "w");
          if (wEntry?.v) {
            metaSender = Array.isArray(wEntry.v) ? wEntry.v.join("") : String(wEntry.v);
          }
          const iEntry = label42.find((e: any) => e.k === "i");
          if (Array.isArray(iEntry?.v)) {
            metaItems = iEntry.v.map((pair: any) => [Number(pair[0]), Number(pair[1])]);
          }
        }
      }
    } catch {
      // best-effort
    }

    // Always record the raw payment (output index 0 to the payment address is fine for dev)
    yield* World.resolve(insertCardanoPayment, {
      tx_hash: tx.txId,
      output_index: 0,
      payment_address: launchpad.cardanoPaymentAddress || launchpad.cardanoPaymentAddressHex || "",
      amount: paidLovelace.toString(),
      block_height: data.blockHeight,
    });

    if (!metaItems || !metaSender) {
      console.log(`[STM:cardano-payment] receipt minted but no item metadata: tx=${tx.txId}`);
      return;
    }

    const wallet = metaSender.toLowerCase();

    // (c) DEFENSE IN DEPTH: recompute required cost from config (wei -> lovelace) for CLAIMED items.
    // The on-chain policy guaranteed buyer signed + paid >= claimed within the window; the STM is the
    // authority on item validity & pricing (mirrors the EVM path). If metadata items don't match the
    // paid amount, mark invalid.
    let totalCostLovelace = 0n;
    let itemsValid = true;
    for (const [itemId, quantity] of metaItems) {
      const item = launchpad.items.find((i) => i.id === itemId);
      if (!item) {
        itemsValid = false;
        break;
      }
      if ("prices" in item) {
        const priceWei = BigInt((item as any).prices[ZERO_ADDRESS] ?? "0");
        totalCostLovelace += (priceWei * ETH_TO_ADA_RATE) / 1_000_000_000_000n * BigInt(quantity);
      }
    }
    const participationValid = itemsValid && paidLovelace >= totalCostLovelace;

    if (!participationValid) {
      console.log(
        `[STM:cardano-payment] invalid: tx=${tx.txId} paid=${paidLovelace} required=${totalCostLovelace} itemsValid=${itemsValid}`,
      );
    }

    yield* World.resolve(upsertUser, {
      launchpad: launchpad.address,
      wallet,
      payment_token: ZERO_ADDRESS,
      total_amount: paidLovelace.toString(),
      last_referrer: ZERO_ADDRESS,
      last_participation_valid: participationValid,
      chain: "cardano",
    });

    yield* World.resolve(insertParticipation, {
      launchpad: launchpad.address,
      wallet,
      payment_token: ZERO_ADDRESS,
      payment_amount: paidLovelace.toString(),
      referrer: ZERO_ADDRESS,
      item_ids: metaItems.map(([id]) => id).join(","),
      item_quantities: metaItems.map(([, qty]) => qty).join(","),
      tx_hash: tx.txId,
      block_height: data.blockHeight,
      preconditions_met: true,
      participation_valid: participationValid,
      chain: "cardano",
    });

    if (participationValid) {
      yield* World.resolve(deleteUserItems, { launchpad: launchpad.address, wallet });
      for (const [itemId, quantity] of metaItems) {
        yield* World.resolve(insertUserItems, {
          launchpad: launchpad.address,
          wallet,
          item_id: itemId,
          quantity,
        });
      }
    }

    data.emit(AppEvents.PreorderPlaced, {
      buyer: wallet,
      launchpad: launchpad.address,
      itemIds: metaItems.map(([id]) => id),
      quantities: metaItems.map(([, qty]) => qty),
      paymentToken: ZERO_ADDRESS,
      paymentAmount: paidLovelace.toString(),
      participationValid,
    });

    console.log(
      `[STM:cardano-payment] processed receipt tx=${tx.txId} wallet=${wallet} valid=${participationValid}`,
    );
  },
);
```

> The existing imports `insertCardanoPayment`, `upsertUser`, `insertParticipation`,
> `deleteUserItems`, `insertUserItems`, `launchpadsData`, `ZERO_ADDRESS`, `ETH_TO_ADA_RATE`,
> `AppEvents`, and `World` are already present in `state-machine.ts`. Do not re‑import them.

---

## 7. Step 4 — package.json dependency changes

### `packages/node/package.json` — add the protobuf spec used by the decoder

Add to `dependencies` (match the version the sync package uses):

```json
"@utxorpc/spec": "^0.18.1"
```

### `packages/contracts-cardano/package.json` — add a build‑validator script

Add to `scripts`:

```json
"validator:apply": "bun ./build-validator.ts"
```

`@lucid-evolution/utils` and `@lucid-evolution/lucid` are already dependencies; `applyParamsToScript`,
`applyDoubleCborEncoding`, `mintingPolicyToId`, `paymentCredentialOf`, `toUnit`, `Constr`, `Data`,
`SLOT_CONFIG_NETWORK` all come from those. No new Cardano deps.

Run `bun install` from the template root after editing.

---

## 8. Step 5 — Orchestrator wiring (`start.dev.ts`)

The policy id must exist **before** the sync node starts (config + STM read it). Add a one‑shot step
that runs `build-validator.ts`, and make `sync` depend on it.

Insert this process object into the `processes` array (after the `launchCardano(...)` spread, before
the `sync` entry):

```ts
{
  name: "cardano-validator",
  description: "Apply Aiken validator params + compute receipt policy id",
  cwd: path.join(root, "packages/contracts-cardano"),
  args: ["run", "build-validator.ts"],
  waitToExit: true,
  type: "system-dependency",
  critical: true,
  dependsOn: [],
},
```

Then add `"cardano-validator"` to the `sync` process’s `dependsOn` array (alongside
`DbNames.PGLITE_WAIT` and `EvmNames.GENERATE_MOD`):

```ts
dependsOn: [
  DbNames.PGLITE_WAIT,
  EvmNames.GENERATE_MOD,
  "cardano-validator",
],
```

> `build-validator.ts` only reads the committed `plutus.json` and writes `temp/*`. It needs YACI
> only via `CARDANO_PAYMENT_ADDRESS` decoding (pure, no network), so it has no runtime deps on YACI/
> Dolos and can run as soon as the repo is present.

---

## 9. Step 6 — Tests

Add `packages/tests/stm/cardano-receipt-purchase.test.ts` (NEW). Mirrors the existing `assertSQL`
polling style used elsewhere in `packages/tests/`.

```ts
import { assert, assertSQL } from "../helpers.ts";
import type { Client } from "pg";
import { initLucid, buyItemsCardano } from "@preorder/contracts-cardano/helpers";

export async function cardanoReceiptPurchaseTest(db: Client) {
  const lucid = await initLucid();

  // Item 1 ("Iron Helm") price = 2_000_000_000_000_000 wei.
  // lovelace = wei * ETH_TO_ADA_RATE(8500) / 1e12  = 2e15 * 8500 / 1e12 = 17_000_000 lovelace.
  const requiredLovelace = 17_000_000n;

  // (1) Happy path: pay exactly the required amount → validator accepts, STM records valid participation.
  let okTxHash = "";
  await assert("Cardano receipt purchase submits on-chain", async () => {
    const { txHash } = await buyItemsCardano(lucid, [[1, 1]], requiredLovelace);
    okTxHash = txHash;
    return Boolean(txHash);
  });

  await assertSQL(
    "Cardano purchase recorded as valid participation",
    db,
    () => `SELECT * FROM launchpad_participations WHERE tx_hash = '${okTxHash}' AND chain = 'cardano'`,
    (rows) => rows.length > 0,
    (rows) => (rows[0] as any).participation_valid === true,
  );

  await assertSQL(
    "Cardano payment row recorded",
    db,
    () => `SELECT * FROM cardano_payments WHERE tx_hash = '${okTxHash}'`,
    (rows) => rows.length > 0,
  );

  // (2) Negative path: claim the required amount but underpay → on-chain validator REJECTS at submit.
  await assert("Underpaying purchase is rejected on-chain", async () => {
    try {
      await buyItemsCardano(lucid, [[1, 1]], requiredLovelace, 1_000_000n /* pay < claimed */);
      return false; // should not reach here
    } catch {
      return true; // YACI rejected the tx because the minting policy failed
    }
  });
}
```

> Adapt the `assertSQL` signature to match `packages/tests/helpers.ts` exactly (read it first — some
> variants take a literal query string rather than a thunk). Register this test in the test runner
> (`packages/tests/run-tests.ts`) in **Phase B**, next to the existing `cardano-payment` test.

Existing tests that only `INSERT` into `cardano_payments` directly (e.g. `stm/cardano-payment.test.ts`)
still pass — the DB schema is unchanged.

---

## 10. Execution checklist (do these in order; stop & fix at any failing gate)

1. **Toolchain** — install Aiken (§4.1); `aiken --version` works.
2. **Validator** — create `aiken/aiken.toml` + `aiken/validators/launchpad_receipt.ak` (§4.2).
   - Gate: `cd packages/contracts-cardano/aiken && aiken check` → **passes** (fix stdlib API names if not).
3. **Build** — `aiken build`; copy `plutus.json` to `packages/contracts-cardano/plutus.json` (§4.3).
   - Gate: `plutus.json` contains a validator whose `title` starts with `launchpad_receipt`.
4. **Apply params** — add `build-validator.ts` (§5.1) + `validator:apply` script (§7).
   - Gate: `cd packages/contracts-cardano && bun run validator:apply` prints a policy id and writes
     `temp/receipt-policy-id.txt`, `temp/receipt-applied-script.txt`.
5. **Off‑chain helper** — add `ensureYaciSlotConfig` + `buyItemsCardano` to `cardano-helpers.ts` (§5.2).
6. **Node deps** — add `@utxorpc/spec` to `packages/node/package.json` (§7); `bun install` at root.
7. **Decoder + policy module** — add `decode-utxorpc-tx.ts` and `cardano-receipt.ts` (§6.1, §6.2).
8. **Grammar** — edit `grammar.ts` (§6.3).
9. **Config** — edit `config.dev.ts`: import `PrimitiveTypeUtxorpcGeneric` + `RECEIPT_POLICY_ID`,
   swap the primitive + predicate (§6.4).
10. **STM** — rewrite the `cardano-payment` transition (§6.5).
    - Gate: `cd packages/node && bun run check` (tsc) → no type errors.
11. **Orchestrator** — add the `cardano-validator` step + `sync` dependency (§8).
12. **Tests** — add `cardano-receipt-purchase.test.ts`; register in `run-tests.ts` (§9).
13. **Full run**:
    - `bun run dev` from the template root (brings up PGLite + Hardhat + YACI + Dolos + sync + frontend).
    - Confirm logs: `[build-validator] PlutusV3 receipt policy id: <hex>` and the sync node starts
      with the `CardanoReceipt` primitive.
    - `bun run test` → the new Phase‑B test passes (happy path recorded; underpayment rejected).
14. **Manual sanity** (optional): tail sync logs and confirm a purchase tx logs
    `[STM:cardano-payment] processed receipt tx=… valid=true`.

If a step fails, fix it before proceeding — later steps depend on earlier artifacts (esp. the policy
id file from step 4).

---

## 11. Gotchas & failure modes (quick reference)

- **"Policy not found" / predicate matches nothing** → policy id mismatch. Ensure
  `build-validator.ts`’s CBOR encoding (with/without `applyDoubleCborEncoding`) produces the *same*
  policy id that `mintingPolicyToId(loadReceiptPolicy().policy)` produces in `cardano-helpers.ts`.
  They both read `temp/receipt-applied-script.txt`, so as long as that file is the source, they agree.
- **Tx rejected at submit with a script error** → the validator logic failed for real. Check: buyer
  in `extra_signatories` (you called `.addSigner`), output to the launchpad address ≥ claimed, validity
  range finite & inside `[saleStart, saleEnd]`, exactly one token `(policyId, buyerPkh, 1)` minted.
- **Validity window check fails** → `ensureYaciSlotConfig` not called or YACI restarted (call with
  `force=true` per tx, as the helper does).
- **`cardano.Tx.fromBinary` is not a function** → protobuf‑es version drift; use the v2 form
  `fromBinary(cardano.TxSchema, bytes)` (see note in §6.2).
- **STM never fires** → predicate didn’t match (policy id empty because `validator:apply` ran after
  sync, or `temp/receipt-policy-id.txt` missing). Verify the orchestrator dependency ordering (§8).
- **PlutusV3 rejected by YACI** → recompile the Aiken project with `plutus = "v2"` in `aiken.toml`
  and change both `type: "PlutusV3"` occurrences (`build-validator.ts`, `loadReceiptPolicy`) to
  `"PlutusV2"`.

---

## 12. Security boundary & production hardening (read before shipping beyond the demo)

This design deliberately keeps the validator **small** and leaves item‑level pricing/supply in the
STM (matching how the EVM contract also offloads those). Be explicit about what is and isn’t enforced:

- **Enforced on‑chain:** buyer signature, payment ≥ `claimed_lovelace` to the launchpad address, sale
  window, exactly one receipt minted per buyer pkh.
- **NOT enforced on‑chain:** that `claimed_lovelace`/metadata items match a real catalog price; total
  supply caps; per‑user cumulative limits. The **STM re‑checks prices** from `launchpad-config` and
  marks `participation_valid=false` on mismatch, so the worst case (claiming expensive items in
  metadata while paying for cheap ones) is caught off‑chain — the purchase is recorded **invalid**.

**To raise on‑chain guarantees for production:**

1. **Bind metadata to the redeemer.** Set the receipt `assetName = blake2b_256(canonical(items,
   buyer))`, have the validator require that exact asset name, and have the STM recompute the same
   hash from metadata and reject on mismatch. Now metadata cannot disagree with what was validated.
2. **Move item pricing on‑chain.** Pass a `priceTable: List<(Int, Int)>` (itemId → lovelace) as a
   validator parameter; put the purchased items in the **redeemer**; have the policy compute
   `required = Σ price[id]*qty` and require `paid ≥ required`. Then the STM can trust item validity
   too (carry items in the redeemer; decode redeemers from the tx witnesses instead of metadata).
3. **Supply caps.** True global supply enforcement needs shared state → either accept STM‑only
   enforcement (current approach) or introduce a **batcher/sequencer** that orders purchase requests
   and applies them against a single state UTxO (out of scope here; significant work, and the reason
   the EVM contract also leaves supply to the STM).
4. **Real sale window.** Set `SALE_START`/`SALE_END` in `build-validator.ts` to actual POSIX‑ms bounds
   rather than the dev‑open `0 … 99999999999999`.
```
