# Cardano Templates (YACI DevKit + Dolos)

Cardano local dev uses three services, started by `launchCardano`:

1. **YACI DevKit** — local Cardano devnet with a faucet at `localhost:10000` and web UI at `localhost:8090`
2. **Dolos** — lightweight Cardano node exposing UTxO-RPC (gRPC at `localhost:50051`) and a Blockfrost-compatible API at `localhost:3000`
3. **cardano-submit-tx** — one-shot process that submits initial transactions (e.g., stake delegation to bootstrap the pool). **Filter this out in dev** — see below.

## Frontend uses Lucid Evolution (no batcher)

Cardano templates typically have **no batcher**: the frontend builds, signs, and submits transactions directly via Lucid. The node API is GET-only.

Required packages:
- `@lucid-evolution/lucid`
- `@lucid-evolution/provider`
- `@lucid-evolution/utils`
- `@lucid-evolution/core-types`

`Lucid.new()` connects to the Dolos Blockfrost provider at `http://localhost:3000`. For dev wallets, `generateSeedPhrase()` creates a new wallet; fund it via the YACI faucet.

## YACI faucet field name is `adaAmount`

The topup endpoint at `POST http://localhost:10000/local-cluster/api/addresses/topup` expects `{ address, adaAmount }`, NOT `{ address, amount }`. Wrong field name returns HTTP 400. Topups take ~5 seconds to produce UTxOs.

## Lucid provider overrides for YACI+Dolos

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

## YACI POSIX vs wall-clock time mismatch

`genesis.systemStart` (used for on-chain POSIX time via Shelley genesis) differs from `devnet.startTime` (used for Lucid's `SLOT_CONFIG_NETWORK["Custom"].zeroTime`). The offset (often hours) must be subtracted from on-chain POSIX values when comparing to `Date.now()`:

```ts
const epochOffset = systemStartMs - SLOT_CONFIG_NETWORK["Custom"].zeroTime;
const wallClockMs = cardanoPosixMs - epochOffset;
```

Failing this causes time-lock comparisons (e.g. `canClaim`) to never become true.

## YACI genesis pool

YACI DevKit creates one genesis stake pool:
- Pool hash: `7301761068762f5900bde9eb7c1c15b09840285130f5b0f53606cc57`
- Bech32: `pool1wvqhvyrgwch4jq9aa84hc8q4kzvyq2z3xr6mpafkqmx9wce39zy`

Use this pool for delegation tests. The `cardanoPoolDelegation` primitive detects delegations to it via UTxO-RPC cert scanning.

## Five Cardano primitives

All use `CARDANO_UTXORPC_PARALLEL` sync protocol via Dolos:

| Primitive | Fields | Use |
|---|---|---|
| `CardanoPoolDelegation` | `address` (staking cred hash), `pool` (pool keyhash), `epoch` | Stake delegation detection — eligibility, governance |
| `CardanoMintBurn` | `policy`, `asset`, `quantity` | Native token mint/burn tracking |
| `CardanoTransfer` | `address`, `amount`, ... | ADA/token transfers |
| `CardanoDelayedAsset` | ... | Delayed asset claim tracking |
| `CardanoProjectedNFT` | ... | Projected NFT state changes |

### `cardanoPoolDelegation` carries no ADA amount

Delegation certificates emit `{ address, pool, epoch }` only — they do not include delegated ADA. To get the amount, query the wallet's UTxO balance separately (`lucid.utxosAt(address)` or Blockfrost).

### `CardanoProjectedNFT` emits duplicates

Each lock event is inserted twice (once for UTxO consumed, once for UTxO produced). Frontends querying `cardano_projected_nft` must deduplicate by `(current_tx_id, current_output_index, status)`.

## BUG: filter `CARDANO_SUBMIT_TX` in dev

`launchCardano()` always returns a `CARDANO_SUBMIT_TX` process that submits an initial stake-pool delegation. In dev with a frontend-driven faucet (Faucet button calling YACI), this generates unwanted delegation events in the DB. Filter it out:

```ts
...launchCardano("@my-template/contracts-cardano", {
  cwd: path.join(root, "packages/contracts-cardano"),
}).filter((p) => p.name !== CardanoNames.CARDANO_SUBMIT_TX),

{
  name: "sync",
  dependsOn: [
    DbNames.PGLITE_WAIT,
    EvmNames.GENERATE_MOD,
    // CardanoNames.CARDANO_SUBMIT_TX,  // removed in dev
    CardanoNames.DOLOS_MINIBF_WAIT,
  ],
},
```

Keep `CARDANO_SUBMIT_TX` in `start.test.ts` if tests need pre-funded wallets.
