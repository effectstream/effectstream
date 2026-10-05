# Bridge nodes in containers (`compose.bridge.yml`)

`compose.bridge.yml` runs **one bridge node in live mode** as a container: PGLite and the node
(sync, state machine, API, relayer, delivery into Passport accounts), started by `start.live.ts`
through the orchestrator. It starts no chain and no prover. It is parameterised by environment
only, so a stack can include it once per deployment, for example two bridges for two SPL mints
side by side:

```sh
docker compose -p bridge-x --env-file x.env -f deploy/standin/compose.bridge.yml up -d
docker compose -p bridge-y --env-file y.env -f deploy/standin/compose.bridge.yml up -d
```

It is the reusable piece of the stand-in integration run (plan 00058 P5): two deployments, X and
Y, next to a Midnight 2.x devnet, a `solana-test-validator` and Night Market's relay.

## What the container needs

**A prepared template volume** (`BRIDGE_TEMPLATE_VOLUME`). The image (`oven/bun:1.3.11` by
default) holds nothing but Bun. The repository comes from a Docker volume that already has:

1. the repository at `/work/repo` (`BRIDGE_TEMPLATE_DIR` defaults to
   `/work/repo/templates/solana-midnight-bridge`);
2. `bun install` at the repository root and in the template, then `bash ./link.sh`;
3. the compiled bridge contract: `bash packages/contracts-midnight/scripts/compile.sh`;
4. the Passport bundle, when the node delivers into Passport accounts:
   `bun run delivery:import-bundle <key volume>/account`, which copies it out of a VERIFIED
   Night Market key volume into the gitignored `packages/delivery-passport/bundle/account`;
5. the deployment file `deployments/<BRIDGE_DEPLOYMENT>.json`, written by the two deploys below.

Two nodes can share one volume: each has its own database (`/data`, a volume of its project) and
its own midnight-js private-state store (a volume mounted over `midnight-level-db-deploy`).

> [!IMPORTANT]
> **A restart re-syncs.** The node's database does **not** survive a restart of the container,
> even though it lives in `/data/pglite` (Effectstream engine issue 00063: the PGlite gateway loses
> its data when it is stopped, by SIGTERM or SIGKILL). After any restart (a crash,
> `docker compose restart`, `stop` and `start`) the node re-syncs every transfer from the
> deployment's start heights. That is safe: the contract's `mintedLocks` and the Solana release
> receipts refuse a second mint or release, so nothing is delivered twice (in the stand-in runs, a
> container killed mid-delivery delivered exactly once). But the re-sync takes longer as the chains
> grow, and a contract lock that was `undeliverable(not-a-contract)` is `observed` again for one
> grace window before it is classified again.

**A secrets directory per deployment** on the host (`BRIDGE_SECRETS_HOST_DIR`, mode 700, files
600), mounted read-only at `/secrets`:

| File | Used by |
|---|---|
| `solana-operator.json` | Solana deploy, program operator, mint signatures |
| `solana-bridge-program.json` | the program's keypair (the deploy) |
| `solana-user.json` | optional: the depositor the CLI locks from, and `--user-tokens` |
| `midnight-operator.seed` | Midnight deploy and wallet mints (needs DUST) |
| `midnight-delivery.seed` | composed deliveries into contracts (needs DUST) |
| `midnight-user.seed` | optional: a wallet recipient |
| `storage-password` | optional: the midnight-js private-state password |

A Midnight `.seed` file holds a hex seed of 32 to 64 bytes (`0x` optional; a 64-byte BIP-39 seed
from Lace or a shared test wallet derives the same addresses as that wallet), a BIP-39 mnemonic of 12
to 24 words, or either of them on a `WALLET=`, `SEED=` or `MNEMONIC=` line.

The keys must be fresh: off loopback, every script refuses the public dev seeds and the
committed local Solana keys. Fund the Midnight seeds with NIGHT and register it for DUST before
the node starts, and the Solana operator from a faucet.

## Variables

| Variable | Required | Meaning |
|---|---|---|
| `BRIDGE_HOST` | yes | the node's host name on the stack network; the default public API host |
| `BRIDGE_DEPLOYMENT` | yes | the deployment file in `deployments/` |
| `BRIDGE_SECRETS_HOST_DIR` | yes | the secrets directory on the host |
| `BRIDGE_TEMPLATE_VOLUME` | yes | the prepared volume |
| `BRIDGE_STACK_NETWORK` | yes | the existing Docker network of the chains and provers |
| `BRIDGE_API_PORT` | yes | host port for the API, bound to 127.0.0.1 |
| `SOLANA_DEVNET_RPC_URL` | one of the two | the Solana RPC; a validator on the host is `http://host.docker.internal:<port>` |
| `SOLANA_DEVNET_RPC_URL_FILE` | one of the two | a file holding the RPC URL, e.g. `/secrets/solana-rpc-url` (mode 600) in the secrets directory: for a provider URL with an API key, which then never appears in an env file, `docker inspect` or a log |
| `MIDNIGHT_NETWORK_ID`, `MIDNIGHT_NODE_HTTP`, `MIDNIGHT_INDEXER_HTTP`, `MIDNIGHT_INDEXER_WS` | yes | the Midnight network |
| `MIDNIGHT_PROOF_SERVER_URL` | yes | the DUST prover (9.0.0-rc.6 for dust/9) |
| `MIDNIGHT_CONTRACT_PROOF_SERVER_URL` | yes | the contract prover (9.0.0-rc.8) |
| `BRIDGE_PUBLIC_API` | no | `api` in `GET /deployment`; default `http://$BRIDGE_HOST:9999` |
| `BRIDGE_RECORD_NAME`, `BRIDGE_RECORD_SYMBOL` | no | `name` and `symbol` in the record |
| `BRIDGE_DELIVERY_ADAPTERS` | no | default `passport`; set it empty to turn delivery into contracts off |
| `PASSPORT_BUNDLE_DIR` | no | default: the delivery-passport package's `bundle/account` |
| `BRIDGE_DELIVERY_NOT_FOUND_GRACE_MS` | no | default 600000 |
| `BRIDGE_NODE_IMAGE`, `BRIDGE_MEM_LIMIT`, `BRIDGE_TEMPLATE_DIR` | no | `oven/bun:1.3.11`, `4g`, see above |
| `BRIDGE_SOLANA_GETBLOCK_CONCURRENCY`, `BRIDGE_SOLANA_GETBLOCK_MIN_INTERVAL_MS`, `BRIDGE_SOLANA_STEP_SIZE`, `BRIDGE_SOLANA_RATE_LIMIT_RETRIES`, `BRIDGE_SOLANA_RATE_LIMIT_BACKOFF_MS`, `BRIDGE_SOLANA_MAX_TX_VERSION` | no | how the node reads Solana blocks (template README, Configuration): 8 `getBlock` calls in flight, 24-slot steps, version-1 transactions |
| `BRIDGE_ORCHESTRATOR_CONFIG` | no | the orchestrator config, default `start.live.ts` (a test can pass one where the node process is not critical, as `packages/tests/start.test.ts` does) |
| `BRIDGE_ORCHESTRATOR_API` | no | `1` starts the orchestrator's process API on the container's port 4747 (not published, but reachable on the stack network): for tests that stop or kill the node process alone. Off by default |

## Deploying a bridge for a node

The deploys run in the template's environment (any container with the volume), with the same
Midnight and Solana variables and `BRIDGE_SECRETS_DIR=/secrets`:

```sh
# Solana: deploy the program (the Agave CLI), create a 6-decimal test mint, Initialize, mint test tokens
SOLANA_EXPECTED_GENESIS_HASH=$(solana genesis-hash --url "$SOLANA_DEVNET_RPC_URL") \
  bun run packages/contracts-solana/scripts/deploy-devnet.ts --out standin-x --user-tokens 600
# Midnight: the bridge contract, sealing that mint and the operator's key
MIDNIGHT_STORAGE_PASSWORD=… bun run packages/contracts-midnight/deploy.ts --mode stagenet --out standin-x
# The public record (I-3 (c)) a token registry is generated from
bun run bridge:record --mode live --api http://bridge-x:9999 --name X --symbol X
```

`deploy-devnet.ts` runs `solana program deploy` itself when the program is not deployed yet. The
Agave release has no Linux arm64 build, so on an arm64 host the program can be deployed with the
host's Agave CLI first (`solana program deploy build/bridge.so --keypair <operator>
--upgrade-authority <operator> --program-id <program keypair> --use-rpc`); `deploy-devnet.ts`
then sees the operator's program and only creates the mint and initializes it.

## Using it

- `GET /transfers`, `GET /transfers/:id`, `GET /recipients/contract/:address` and
  `GET /deployment` on `http://127.0.0.1:$BRIDGE_API_PORT` (or `http://$BRIDGE_HOST:9999` on the
  stack network). The healthcheck answers once the API does; `GET /deployment` answers 503 until
  the node has checked its record against both chains.
- The CLI, from any container with the volume: `bun run bridge:to-midnight --mode live --api
  http://bridge-x:9999 --amount 500 --account <Passport account>`.
- Logs: `/data/logs/<start time>/sync.log` (one directory per container start).
- Re-sync from the start heights: restart the container (see the note above: every restart
  re-syncs today; deleting `/data/pglite` first makes it explicit).
- Teardown: `docker compose -p bridge-x -f deploy/standin/compose.bridge.yml down -v`.
