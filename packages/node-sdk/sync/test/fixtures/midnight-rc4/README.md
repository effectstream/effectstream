# Midnight rc.4 decoder corpus

These fixtures are immutable GraphQL snapshots from a disposable Midnight 2.x
stack. They are real finalized transactions and ledger events, not synthetic
wire payloads. Every transaction and event reports protocol version `2000000`.

## Source stack

- Capture time: 2026-08-23, after the indexer had finalized block 254.
- Compose project: `effectstream-00016-m4-13580`.
- Network ID: `undeployed`.
- Node: `midnightntwrk/midnight-node:2.0.0-rc.4`, local image ID
  `sha256:caf93d6f9fb3630c906ef3e714c151655377f3d28f907d17545de1870514da2e`.
- Indexer: `midnightntwrk/indexer-standalone:4.4.0-rc.1`, local image ID
  `sha256:5d79f3a20da9ed86236c7f7dc9d93b1beeb0b0c47c9c43a791041322eb80b74e`.
- Proof server: `midnightntwrk/proof-server:9.0.0-rc.5`, local image ID
  `sha256:d96a4d0f3f0f10f82698288443f2873a32fed180eb8f93c0bae83572c0a187a9`.
- Indexer source: `/api/v4/graphql`. The capture selected block hash,
  height, protocol version, timestamp, parent, and each transaction's hash,
  protocol version, raw bytes, contract action address, unshielded spent/created
  outputs, raw zswap ledger events, zswap root, and transaction result.

The stack was started and checked with:

```sh
ENV_FILE=/tmp/effectstream-00016-m4-13580.env ./up.sh
ENV_FILE=/tmp/effectstream-00016-m4-13580.env ./verify.sh
```

Funding was generated with the demo-infra toolkit:

```sh
ENV_FILE=/tmp/effectstream-00016-m4-13580.env ./scripts/fund-wallet.sh \
  de1100000000000000000000000000000000000000000000000000000000a11ce \
  --shielded-amount 100000000

ENV_FILE=/tmp/effectstream-00016-m4-13580.env ./scripts/fund-wallet.sh \
  de1100000000000000000000000000000000000000000000000000000000b0b00 \
  --from-seed de1100000000000000000000000000000000000000000000000000000000a11ce \
  --amount 1000000 --shielded-amount 50000000 --no-dust
```

The deploy/call cases use the repository counter source at
`e2e/shared/contracts/midnight/contract-counter/src/counter.compact`, mounted
read-only and compiled in disposable Docker with
`compact-toolchain:0.33.0-rc.2`. Its generated
`compiler/contract-manifest.json` SHA-256 was
`217bbe58580880341fe04ea9e9195ce130f89ac78e8b68438a0ff46a425a3029`.
The v9-only capture process used the genesis-2 seed to deploy contract
`3f9b35fec2b6f7a069ee41999217ef90fda0ecbcb05d054549242650cbce1a63`,
then called `increment`, `mint_shielded(d4…d4, 1000000, nonce)`, and
`mint_unshielded(e5…e5, 1000000, genesis-2-address)`.

## Cases

| Fixture | Height | Block | Transaction | Coverage |
|---|---:|---|---|---|
| `fund-genesis-to-alice.json` | 45 | `8987d1fa…aae70` | `490def5c…e6fbc` | NIGHT spends/creates, nullifier, commitments, root |
| `fund-alice-to-bob-with-shielded-input.json` | 72 | `19f0c4f5…16c52` | `2f29a591…cb311` | shielded-input nullifier, NIGHT spends/creates, commitments, root |
| `counter-deploy.json` | 234 | `d8aba571…c8fcd` | `1dac099b…a8f9e` | deploy raw transaction and root |
| `counter-increment.json` | 239 | `663f17a0…09080` | `3c5cf600…6c3af` | contract call raw transaction and root |
| `counter-mint-shielded.json` | 247 | `4e9157d8…2b2c9` | `16005a23…40818` | shielded mint and commitment |
| `counter-mint-unshielded.json` | 254 | `62eb5ec0…6cffb` | `c570f640…12d70` | unshielded mint/create |

Each zswap event retains the exact indexer `raw` input and an `expected`
object decoded during capture directly with
`@midnightntwrk/ledger-v9@1.0.0-rc.3`. Each transaction likewise retains its
exact serialized `raw` input; mint expectations were produced from its applied
contract-call transcripts. Tests compare the production decoders to these
pinned values and separately assert the indexer's unshielded rows and roots.

## Integrity

```text
a9482a98e7745439464a87ed4d172992dd7b8615f15eb42479a3574f0259d07e  counter-deploy.json
007db6ce86eebe0aba7ef9654e33893a6e4644f30d028fbef43d7c88b5175a62  counter-increment.json
bc02ca34a5a8951f92ba1403181e4f64e9bf3153aa1e15727972da71334e1872  counter-mint-shielded.json
b3f04e2a8a04526fe28a656d48e5ca1a3c5497c886562a6e893a555a9dd27f00  counter-mint-unshielded.json
9be8e50e209e1d8328b4efa92a2f85f18044b95966a9a537e896bf1d75f51eba  fund-alice-to-bob-with-shielded-input.json
cb89697ffa07fe2a520eef0c8d286e3b82ab8a4ce4c26c05e7b5d6a56977986b  fund-genesis-to-alice.json
```
