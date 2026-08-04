# Cardano

`packages/contracts-cardano/` — Cardano dev environment config (YACI DevKit + Dolos) + scripts. No EVM-style contracts; logic typically lives in Plutus/Aiken scripts deployed via Lucid from the frontend.

> **See also (concept docs).**
> - Cardano chain overview + YACI / Dolos / browser wallets: `docs/site/docs/home/200-chains/203-cardano.md` (the doc has more detail than this file on per-primitive payload fields — cross-reference when documenting STM transitions)
> - Per-package: `docs/site/docs/home/500-packages/530-chains/cardano-contracts.md`
> - Five Cardano-specific primitives: `docs/site/docs/home/100-components/118-primitives.md` (Cardano section)

## Tools (probe before scaffolding)

(no extra system tools — `bun` is enough; YACI and Dolos are vendored through their `@effectstream/npm-*` packages)

## Local dev environment

`launchCardano` starts three services:

1. **YACI DevKit** — local Cardano devnet with a faucet at `localhost:10000`; `localhost:8090` is the cardano-submit-api port.
2. **Dolos** — lightweight Cardano node exposing UTxO-RPC (gRPC at `localhost:50051`) and a Blockfrost-compatible API at `localhost:3000`.
3. **cardano-submit-tx** — one-shot process that submits initial transactions (e.g. stake delegation to bootstrap the pool). **Filter this out in dev** — see Sharp edges.

## Required `launchCardano` package scripts

(Names verified against `packages/build-tools/orchestrator/scripts/launch-cardano.ts` on engine `0.102.0` — earlier skill versions had slightly wrong names that the cardano-delegation reference template also still uses. If the launcher complains "missing script X", the launcher script is the source of truth.)

- `devkit:start`, `devkit:wait`
- `dolos:fill-template`, `dolos:start`, `dolos:wait`
- `cardano-submit-tx` (note: hyphen, NOT `cardano:submit-tx`)

There is no `dolos:minibf-wait` script — that process is synthesized internally by the launcher itself; you only need to depend on `CardanoNames.DOLOS_MINIBF_WAIT` in `start.dev.ts`.

## Sync protocol + primitives

Sync protocol: `CARDANO_UTXORPC_PARALLEL` (via Dolos). Cardano-specific primitives (in addition to `PrimitiveTypeUtxorpcGeneric`):

| Primitive | Fields | Use |
|---|---|---|
| `CardanoPoolDelegation` | `address` (staking cred hash), `pool` (pool keyhash), `epoch` | Stake delegation detection — eligibility, governance |
| `CardanoMintBurn` | `policy`, `asset`, `quantity` | Native token mint/burn tracking |
| `CardanoTransfer` | `address`, `amount`, ... | ADA/token transfers |
| `CardanoDelayedAsset` | ... | Delayed asset claim tracking |
| `CardanoProjectedNFT` | ... | Projected NFT state changes |

## Batcher adapters

(none — Cardano templates typically submit transactions directly from the browser via Lucid; the node API stays GET-only)

## Orchestrator wiring

```ts
...launchCardano("@my-template/contracts-cardano", {
  cwd: path.join(root, "packages/contracts-cardano"),
}).filter((p) => p.name !== CardanoNames.CARDANO_SUBMIT_TX),

{
  name: "sync",
  dependsOn: [
    DbNames.PGLITE_WAIT,
    EvmNames.GENERATE_MOD,
    // CardanoNames.CARDANO_SUBMIT_TX,  // removed in dev — see Sharp edges
    CardanoNames.DOLOS_MINIBF_WAIT,
  ],
},
```

## Sharp edges

### `exact_address` predicate is base64, NOT hex

The `CARDANO_UTXORPC_PARALLEL` sync protocol's `has_address` predicate has a quirk: `exact_address` is base64-encoded raw address bytes, but `payment_part` and `delegation_part` are hex. The sync layer at `packages/node-sdk/sync/src/sync-protocols/utxorpc/utils.ts:57` does `atob(exact_address)` while the other two fields go through `hexStringToUint8Array`.

**Symptom of getting it wrong:** the predicate filters out every block silently — no STM transition ever runs for the watched address, no DB rows, no errors. Looks like the sync is broken but actually it's matching nothing.

Convert from Lucid's bech32 → hex → base64 once at config build time:

```ts
import { getAddressDetails } from "@lucid-evolution/utils";

const watchAddressBech32 = process.env.WATCH_ADDRESS ?? "...";
const addrHex = getAddressDetails(watchAddressBech32).address.hex;
const addrBytes = Buffer.from(addrHex, "hex");
const exactAddressB64 = addrBytes.toString("base64");

// Use exactAddressB64 in the primitive config:
.addPrimitive(/* ... */, (network) => ({
  // ...
  predicates: { has_address: { exact_address: exactAddressB64 } },
}))
```

### Filter `CARDANO_SUBMIT_TX` in dev

`launchCardano()` always returns a `CARDANO_SUBMIT_TX` process that submits an initial stake-pool delegation. In dev with a frontend-driven faucet (Faucet button calling YACI), this generates unwanted delegation events in the DB. Filter it out as shown in **Orchestrator wiring** above. Keep `CARDANO_SUBMIT_TX` in `start.test.ts` if tests need a pre-funded wallet.

### YACI faucet field name is `adaAmount`

The topup endpoint at `POST http://localhost:10000/local-cluster/api/addresses/topup` expects `{ address, adaAmount }`, NOT `{ address, amount }`. Wrong field name returns HTTP 400. Topups take ~5 seconds to produce UTxOs.

### Lucid provider overrides for YACI+Dolos

Dolos does NOT support tx evaluation (`evaluateTx`), and YACI's submit endpoint requires `application/cbor`. Override both on the Blockfrost provider:

```ts
const provider = new Blockfrost(DOLOS_URL, "dev");

provider.evaluateTx = async () => {
  return [{
    redeemer_tag: "spend",
    redeemer_index: 0,
    ex_units: { mem: 10_000_000, steps: 5_000_000_000 },
  }];
};

provider.submitTx = async (tx: string): Promise<string> => {
  const res = await fetch(`${YACI_URL}/local-cluster/api/tx/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/cbor" },
    body: hexToBytes(tx),
  });
  if (!res.ok) throw new Error(`TX submit failed (${res.status}): ${await res.text()}`);
  return (await res.text()).replace(/^"|"$/g, "");
};
```

### Lucid wallet load fails with `Cannot read properties of undefined (reading 'nativeScriptFromJson')`

This is a Lucid Evolution / cardano-multiplatform-lib (CSL) WASM init failure. `nativeScriptFromJson` lives in CSL; the "undefined" object is CSL itself — it didn't initialize before Lucid tried to call into it. Common causes (in order of frequency):

1. **CSL WASM not loaded before Lucid is first used.** Lucid's lazy init does NOT await CSL module load. If `Lucid.new()` (or any wallet-load call) fires synchronously on a button click before the WASM has finished streaming, you get this error. Fix: explicitly `await Lucid.new(...)` inside an async event handler, AND make sure the page has had at least one tick after mount before the user can click — or pre-warm CSL with a no-op call (e.g. `getAddressDetails("addr_test1...")`) at module init.
2. **`vite-plugin-top-level-await` was added back.** This plugin pulls Lucid into a polyfill path that breaks WASM init in Bun's build. Vite's `build.target: "esnext"` already supports top-level await natively. The skill's `references/frontend.md` § 1 rule "Do NOT use `vite-plugin-top-level-await`" applies to Cardano templates too — the symptom here is exactly the error pattern this section is about.
3. **CSL version skew between Lucid Evolution sub-packages.** Pin `@lucid-evolution/lucid`, `@lucid-evolution/provider`, `@lucid-evolution/utils`, `@lucid-evolution/core-types`, and `@lucid-evolution/wallet` to the same minor (e.g. all `0.4.x`). Mismatched versions can leave one of them holding a stale CSL reference.

**Phase C interaction tests catch this** — see `references/tests.md` § "Phase C — interaction tests". A page-load smoke test will NOT catch it because the error fires on first wallet call, after `pageerror` has already been counted as zero.

### YACI POSIX vs wall-clock time mismatch

`genesis.systemStart` (used for on-chain POSIX time via Shelley genesis) differs from `devnet.startTime` (used for Lucid's `SLOT_CONFIG_NETWORK["Custom"].zeroTime`). The offset (often hours) must be subtracted from on-chain POSIX values when comparing to `Date.now()`:

```ts
const epochOffset = systemStartMs - SLOT_CONFIG_NETWORK["Custom"].zeroTime;
const wallClockMs = cardanoPosixMs - epochOffset;
```

Failing this causes time-lock comparisons (e.g. `canClaim`) to never become true.

### `cardanoPoolDelegation` carries no ADA amount

Delegation certificates emit `{ address, pool, epoch }` only — they do not include delegated ADA. To get the amount, query the wallet's UTxO balance separately (`lucid.utxosAt(address)` or Blockfrost).

### `CardanoProjectedNFT` emits duplicates

Each lock event is inserted twice (once for UTxO consumed, once for UTxO produced). Frontends querying `cardano_projected_nft` must deduplicate by `(current_tx_id, current_output_index, status)`.

### YACI genesis pool (for delegation tests)

YACI DevKit creates one genesis stake pool:
- Pool hash: `7301761068762f5900bde9eb7c1c15b09840285130f5b0f53606cc57`
- Bech32: `pool1wvqhvyrgwch4jq9aa84hc8q4kzvyq2z3xr6mpafkqmx9wce39zy`

Use this pool for delegation tests. The `cardanoPoolDelegation` primitive detects delegations to it via UTxO-RPC cert scanning.

## Frontend / wallet integration

Cardano templates typically have **no batcher** — the frontend builds, signs, and submits transactions directly via Lucid Evolution. The node API is GET-only.

Required packages:
- `@lucid-evolution/lucid`
- `@lucid-evolution/provider`
- `@lucid-evolution/utils`
- `@lucid-evolution/core-types`

`Lucid.new()` connects to the Dolos Blockfrost provider at `http://localhost:3000`. For dev wallets, `generateSeedPhrase()` creates a new wallet; fund it via the YACI faucet (`{ address, adaAmount }` — see Sharp edges).

The Fastify static server must include proxies for `/api/*` (engine), `/yaci/*`, `/dolos/*` and a CBOR content-type parser — see `references/frontend.md` for the canonical setup.
