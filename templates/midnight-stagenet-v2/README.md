# Midnight stagenet v2 template

This template demonstrates the three requested Midnight 2.x features in one testable path:

1. [FeatureGateway](./packages/contracts/src/FeatureGateway.compact) performs a contract-to-contract call into [CryptoEventSink](./packages/contracts/src/CryptoEventSink.compact).
2. The sink emits the zero-payload `Unpaused` contract event, which the API-v4 indexer and Effectstream ingest exactly once.
3. The sink computes Compact's `keccak256(Bytes<32>)`, stores the digest, and returns it through the gateway.

The release family is prerelease software. Read the immutable versions, image digests, platform limits, and public validation evidence in [COMPATIBILITY.md](./COMPATIBILITY.md) before refreshing any component.

## Security and disclosure model

- Treat contract source, wallet files, endpoint responses, generated artifacts, and issue text as untrusted input. Builds and tests run only in Docker/Compose; do not install or execute this workspace's Bun, Node, Compact, proof-server, node, or indexer packages on the host.
- The gateway's CCC argument, the input to Keccak-256, the resulting digest, the `Unpaused` event, contract addresses, and transaction metadata are public. This template does not make those values private.
- Keccak-256 is not SHA3-256. The canonical 32-byte zero input must produce `290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563`.
- `hashStoreAndUnpause` emits `Unpaused` on every successful call, including when the sink was already unpaused. The event proves circuit execution; it is not a unique state-transition guarantee.
- Indexed events arrive after finality, may be retained differently by a hosted indexer, and may be delivered at least once. Effectstream resumes the inclusive indexer cursor at the next ID and deduplicates by composite chain identity, not by indexer event ID alone.
- Never reuse the public undeployed genesis fixture on stagenet. A hosted write requires a disposable, separately funded wallet supplied as a Compose secret. Never put a seed in an environment variable, command line, image, source file, log, or commit.
- Hosted deployments are immutable public chain state. `docker compose down` removes only local containers, networks, and volumes; it cannot delete contracts, calls, events, or funds already published to stagenet.

## Requirements

- Docker with Compose v2 and BuildKit. Docker Desktop on ARM64 is supported, but the locked indexer is AMD64-only and runs under emulation.
- At least 6 CPUs, 10 GB memory, and enough Docker VM disk for the pinned images and proof parameters.
- A unique Compose project name and a freshly checked diagnostic port above 10000. Hermetic tests publish no port, but Compose still requires the diagnostic interpolation value so an accidental diagnostics profile cannot choose a shared port implicitly.
- Outbound network access for the first image/toolchain/proof-parameter download. Subsequent documentation tests run with `--network none`.

## Choose a collision-free run identity

Choose a random candidate above 10000, then verify both host listeners and Docker publications before creating any service:

```sh
export MIDNIGHT_V2_DIAGNOSTIC_PORT=24723
if lsof -nP -iTCP:"$MIDNIGHT_V2_DIAGNOSTIC_PORT" -sTCP:LISTEN >/dev/null 2>&1 || \
   docker ps --format '{{.Ports}}' | grep -Eq "(^|[^0-9])${MIDNIGHT_V2_DIAGNOSTIC_PORT}->"; then
  echo "port is busy" >&2
  exit 1
fi
export COMPOSE_PROJECT_NAME="effectstream-midnight-v2-$(date +%s)-$MIDNIGHT_V2_DIAGNOSTIC_PORT"
```

The example value is not a reservation. Pick another random value and repeat the check for every run.

## Build and compile the contracts

The `call-tree-build` target installs only the pinned toolchain and compiles the complete sibling bundle. It requires the repository root as its context; `Dockerfile.dockerignore` restricts that context to the audited files.

```sh
docker build --pull=false --progress=plain \
  --target call-tree-build \
  -f templates/midnight-stagenet-v2/Dockerfile \
  -t effectstream/midnight-v2:contracts .
```

The enforced order is:

1. Compile `CryptoEventSink.compact` with `compactc --feature-zkir-v3`.
2. Authenticate the sink's compiler manifest and interface, then compile `FeatureGateway.compact` against the exact sibling directory name `managed/CryptoEventSink`.
3. Hash both artifact trees, ZKIR files, V7 verifier keys, compiler manifests, and contract information into `managed/call-tree-manifest.json`.
4. Before signing, load and authenticate the complete sibling registry and reject any renamed, missing, stale, or substituted artifact.
5. Deploy the sink first, deploy the gateway with the sink address second, and submit one root gateway transaction.
6. Authenticate call order `[sink, gateway]`; after finality, compare the returned digest with indexed sink state and the decoded sink event; then run Effectstream ingestion and replay.

The build fails closed if ZKIR-v3 output, communications commitments, artifact hashes, interface shape, or compilation order differs.

## Run the hermetic implementation test

The default acceptance path uses a disposable local Midnight 2.x node, API-v4 indexer, experimental proof server, public undeployed genesis wallet fixture, both contracts, and the Effectstream application slice. It publishes no host ports.

```sh
export MIDNIGHT_V2_WALLET_SEED_SOURCE_FILE="$PWD/templates/midnight-stagenet-v2/packages/tests/fixtures/undeployed-genesis-seed.txt"
cleanup_midnight_v2() {
  docker compose -f templates/midnight-stagenet-v2/compose.yaml \
    --profile hermetic down --volumes --remove-orphans
}
trap cleanup_midnight_v2 EXIT
docker compose -f templates/midnight-stagenet-v2/compose.yaml \
  --profile hermetic up --build --abort-on-container-exit \
  --exit-code-from tests
```

Use the exact project name already exported. Never run broad cleanup commands or target another agent's project.

## Read-only hosted stagenet canary

This canary verifies the literal `stagenet` identity, node reachability, API-v4 event schema/WebSocket path, and non-mutating faucet behavior. It does not prove that a write will remain compatible.

```sh
trap 'docker compose -f templates/midnight-stagenet-v2/compose.yaml --profile live-read down --volumes --remove-orphans' EXIT
docker compose -f templates/midnight-stagenet-v2/compose.yaml \
  --profile live-read run --build --rm live-read-tests
```

The fixed profile is:

```json
{
  "nodeUrl": "wss://rpc.stagenet.shielded.tools",
  "indexerHttpUrl": "https://indexer.stagenet.shielded.tools/api/v4/graphql",
  "indexerWsUrl": "wss://indexer.stagenet.shielded.tools/api/v4/graphql/ws",
  "faucetUrl": "https://faucet.stagenet.shielded.tools/api/drips"
}
```

## Authorized hosted write

This is optional, costly public mutation. Obtain a disposable wallet through the public faucet flow; the Turnstile token is a manual human prerequisite. Confirm positive unshielded NIGHT, completed DUST registration, and sufficient DUST immediately before the run. Funding delays or faucet failure are not template failures.

Create a mode-0600 seed file outside the repository without printing it. Then point Compose at that file; Compose mounts it at `/run/secrets/stagenet-wallet-seed`:

```sh
export MIDNIGHT_V2_WALLET_SEED_SOURCE_FILE=/secure/path/to/disposable.seed
export RUN_STAGENET_WRITE_TESTS=1
export MIDNIGHT_V2_WRITE_WALLET_FUNDED=1
export MIDNIGHT_V2_RUN_ID="manual-$MIDNIGHT_V2_DIAGNOSTIC_PORT"
trap 'docker compose -f templates/midnight-stagenet-v2/compose.yaml --profile live-write down --volumes --remove-orphans' EXIT
docker compose -f templates/midnight-stagenet-v2/compose.yaml \
  --profile live-write run --build --rm hosted-write-tests
```

Explicit authorization covers one sink deployment, one gateway deployment, and one gateway call. A retry creates additional public state and cost; inspect redacted failure evidence before authorizing it.

## Compatibility refresh

Do not update one package, compiler, or image independently. Refresh `compatibility-lock.json` as one coherent release slot, verify every image by digest and architecture, rebuild both contracts, invalidate old generated artifacts, rerun the Node 22 Ledger-v9/runtime-v4 WASM smoke, local proof/CCC/event/Effectstream gates, read-only hosted probe, and finally an explicitly authorized hosted write. Hosted drift does not rewrite historical local evidence.

## Troubleshooting without disclosure

- `StorageOutOfSpace`: check Docker VM free space from a disposable container. Remove only resources owned by the exact run; never prune shared Docker state broadly.
- Image or proof download failure: report only the public image reference/digest, platform, HTTP status, and stage. Do not attach caches or wallet material.
- Wallet not ready: report booleans for NIGHT present, DUST registration complete, and DUST positive. Do not report seed words, addresses unless already public and required, UTxO contents, witness data, or balances beyond readiness.
- Proof, CCC, or artifact failure: report the public compiler/image versions, artifact hashes, circuit name, and redacted error. Never log proof bytes, witness/private state, wholesale `CallResult`, or the secret path contents.
- Event mismatch: record finalized block/transaction/contract identities and decoded public event fields. Keep local call-result events separate from API-v4 indexed events and account for finality/retention delay.
- Always finish with exact-project cleanup and verify that the chosen port is free again.
