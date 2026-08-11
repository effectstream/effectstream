# Midnight stagenet 2.x feature template plan

- Status: implementation in progress; C01-C12 complete, C13 is next
- Prepared: 2026-08-10
- Repository: `/Users/edwardalvarado/effectstream-d`
- Baseline branch: `v-next`
- Baseline commit: `097b507b81c10e370431c891bec433a06bfb6dd8`

## 1. Objective

Add an isolated, reproducible Effectstream template for the hosted Midnight 2.x stagenet that proves all three new protocol/language capabilities in one transaction:

1. a contract-to-contract call;
2. an on-chain contract event, observed both locally and after indexer finality; and
3. a Compact 0.33 cryptographic primitive (`keccak256`) compiled and proved with ZKIR v3.

The proposed template name is `templates/midnight-stagenet-v2`. It will not replace or silently upgrade `templates/evm-midnight-v2`, which currently targets the Midnight node 1.0/Ledger 8 generation.

The required hosted endpoints are:

```json
{
  "stagenet": {
    "nodeUrl": "wss://rpc.stagenet.shielded.tools",
    "indexerHttpUrl": "https://indexer.stagenet.shielded.tools/api/v4/graphql",
    "indexerWsUrl": "wss://indexer.stagenet.shielded.tools/api/v4/graphql/ws",
    "faucetUrl": "https://faucet.stagenet.shielded.tools/api/drips"
  }
}
```

Working interpretation: “new crypto” means the new Compact 0.33 cryptographic primitives, not issuance of a new currency/token. `keccak256` is the smallest useful proving path. If the intended meaning is a new native token, that is a distinct scope decision because it adds token economics, wallet funding, and ledger-event behavior.

## 2. Safety and trust boundary

The issue text, referenced repositories, network responses, packages, compiler artifacts, generated contract artifacts, and downloaded container layers are untrusted inputs.

Implementation and testing must follow these constraints:

- Repeat the Git safety gate in section 10 before implementation. Stop immediately if it fails.
- Run all installs, compilers, generators, application code, tests, proof tooling, and reference code only in disposable Docker/Compose containers. Do not execute project or reference scripts directly on the host.
- Do not mount the Docker socket, SSH agent, Git credentials, cloud credentials, host package caches, or the home directory into a container.
- Prefer an image build that copies only the required source. If a bind mount is unavoidable for development, mount source read-only and write generated output to a named volume.
- Pin package versions exactly and pin release images by digest after compatibility is established. Do not use `latest`, floating tags, caret ranges, or install scripts piped from the network.
- Keep the existing Ledger 8/WASM dependency tree isolated from the new Ledger 9/on-chain-runtime-v4 tree. Loading both generations in the same Bun process is a known collision risk.
- Treat contract call results as privacy-sensitive. Never log complete `CallResult`, proof material, private state, witness values, wallet seeds, signing keys, or raw secret-bearing transactions.
- The required live test uses an externally supplied, disposable, prefunded stagenet wallet delivered as a Docker secret. It must not call the faucet automatically.
- The public faucet is optional readiness only. `POST /api/drips` requires a Turnstile token and changes external state. Baseline probing is limited to non-mutating `OPTIONS`; no drip was requested.
- Use unique deployment/test identifiers and filter indexed results by the deployed contract address, transaction hash, and starting block. Never assume the public stagenet is otherwise quiescent.
- Tear down test containers and named volumes after a run. Preserve only explicitly requested logs/reports, with secrets redacted.

## 3. What was researched

### 3.1 Current Effectstream implementation

The current template and shared packages are from the Midnight 1.x generation:

- `templates/evm-midnight-v2/Dockerfile` installs Compact `+0.31.0` and launches a local node/indexer/proof stack.
- `templates/evm-midnight-v2/package.json` uses Effectstream `0.102.0`, wallet address format `3.1.2`, and a Ledger 8 override.
- `packages/chains/midnight-contracts/package.json` uses the Midnight.js 4.1.1 family, Compact runtime 0.16, Compact.js 2.5.1, Ledger 8, and on-chain runtime v3.
- `packages/chains/midnight-contracts/src/midnight-env.ts` defaults local development to indexer API v3 and derives unknown hosted networks under `*.midnight.network`; it has no explicit `shielded.tools` stagenet profile. Explicit environment overrides exist, but they do not constitute a validated 2.x configuration.
- `packages/node-sdk/sync/src/sync-protocols/midnight/MidnightClient.ts` can fetch blocks, contract state, ZSwap records, unshielded outputs, roots, and mint data. It does not select or type `contractEvents`.
- `packages/node-sdk/sm/primitives/src/builtin.ts` has no Midnight contract-event primitive.
- The existing Compact example is a single counter-style contract. It contains no contract-to-contract call, `emit`, or ZKIR-v3 cryptography.
- `templates/run-template-tests.ts` runs enabled templates directly with Bun and assumes shared ports. The new template must add a Docker entry point and then be registered only after its Docker test is deterministic.

The basic block query emitted by the current `MidnightClient` is accepted by the live API v4 endpoint, but that only shows backward compatibility for the selected fields. It does not make the old deployment/proof/wallet packages compatible with node 2.x and does not provide event ingestion.

### 3.2 Local reference repositories

Both references were inspected statically only; none of their code was executed.

- `/Users/edwardalvarado/compact-end-2-end` was clean at `aa344546edb71a88dddcdd82f28998480df279e9` on `main`.
- `/Users/edwardalvarado/midnight-ref-ai` was at `d328aa380a0553f46c7af27ba33f0fd05f7ab38b` and already had a modified `zswap-offer-messages-FINDINGS.md`. It was treated as read-only and left unchanged.

`compact-end-2-end/versions.json` records an older feature-harness matrix:

| Component | Reference value |
| --- | --- |
| Node/toolkit | `midnightntwrk/midnight-node:2.0.0-rc.4` |
| Indexer | `4.4.0-pre-alpha.16-l91r3-n2r3-bridge-and-events-epics-contract-zswap-16c656df` |
| Proof server | `9.0.0-rc.5_experimental` |
| Compact manager | `0.5.1` |
| Compact compiler | manifest says `0.33.0-rc.1`; Docker build source uses tag `compactc-v0.33.0-rc.2` |
| Compact language/runtime | language `0.25`; runtime `0.18.0-rc.1` |
| Compact.js | `2.5.5-rc.6` |
| Midnight.js | `5.0.0-beta.4` family |
| Ledger/on-chain runtime | Ledger v9 `1.0.0-rc.3`; runtime v4 `4.0.0-rc.3` |
| Host runtime inside container | Node `>=22`; pnpm `11.4.0` in the reference |

That beta.4 matrix remains useful as implementation evidence, but it is not the selected template lane. Beta.4 has no supported local MIP-0002 event surface, and its pre-alpha indexer predates fixes present in the first Ledger-9/node-2 release candidate. It cannot implement the required local-versus-indexed event assertion.

The selected lane is the coherent `midnight-ref-ai/versions/v2.0.0-rc.4.json` slot, cross-checked against its checked-out Midnight.js and wallet manifests:

| Component | Locked value |
| --- | --- |
| Midnight.js packages | `5.0.0-beta.6` |
| Compact.js | `2.5.5-rc.7` |
| Compact compiler/language/runtime | `0.33.0-rc.1` / `0.25` / `0.18.0-rc.1` |
| Ledger/on-chain runtime | `@midnightntwrk/ledger-v9@1.0.0-rc.3` / `@midnightntwrk/onchain-runtime-v4@4.0.0-rc.3` |
| Platform JS | `3.0.0` |
| Wallet SDK | `@midnightntwrk/wallet-sdk@2.0.0-beta.2`; address format `4.0.0-beta.2`; aligned sibling versions from that barrel manifest |
| Node/indexer | `2.0.0-rc.4` / `4.4.0-rc.1` |
| Proof server for this template | `9.0.0-rc.5_experimental`—the plain rc.5 image cannot prove ZKIR-v3 circuits |
| Application runtime | Node `>=22`; Bun may install/launch but does not execute the v2 provider/WASM path |

The `compactc-v0.33.0-rc.2` value under the slot's `sourceRefs` identifies the source checkout used for research. It does not replace the compiler `0.33.0-rc.1` asset that Midnight.js beta.6 documents, compiles in CI, and requires for its artifact manifest. The implementation pins rc.1.

Useful static reference fixtures are:

- CCC: `/Users/edwardalvarado/compact-end-2-end/regression/contracts/cross-contract-calls/write-then-read/`
- events: `/Users/edwardalvarado/compact-end-2-end/cases/patterns/events/`
- Keccak prove/verify: `/Users/edwardalvarado/compact-end-2-end/cases/features/keccak256/`
- larger CCC example: `/Users/edwardalvarado/compact-end-2-end/dapps/no-witness-dex/`

Important constraints established by those fixtures:

- A callee cannot use witnesses/private state in the current CCC phase.
- Cross-contract arguments that are impure/private must be explicitly disclosed.
- Constructors cannot perform CCC or emit events.
- Recursion/reentrancy is guarded; purity must match the declared interface.
- All artifacts in a call tree must come from one compiler generation. Interface/artifact directory names are significant because the caller binds the callee verifier key.
- Compile the callee before the caller, deploy the callee before the root, register ZK configurations for the full call tree, and fetch state at a pinned block.
- `CallResult.calls` is ordered with callees before the root.
- Compact events are from a fixed catalog. Beta.6 skips `Misc` end-to-end because its unusually large `emitMisc` circuit still needs a proof-server fix; this template must use `Unpaused` and must not add a `Misc` test until a later locked stack documents that fix.
- Events are indexer-retained observations, not consensus state. Local execution events and finalized indexed events are separate assertions.
- `keccak256` and the new secp256k1 operations require `--feature-zkir-v3`.
- A later-than-0.33.0-rc.2 compiler fix mentions shielded ZSwap operations inside CCC callees; the first template should avoid shielded coin operations in the callee.

### 3.3 Official/public evidence

There is no public official support matrix for the exact bundle currently deployed behind this stagenet. The official stable support matrix still describes Ledger 8, and the official network page does not list stagenet. Therefore compatibility must be detected, not inferred.

The endpoint family itself is corroborated by official sources:

- [Midnight Indexer stagenet QA environment](https://github.com/midnightntwrk/midnight-indexer/blob/v4.4.0-rc.2/qa/tests/environment/model.ts)
- [Midnight Faucet stagenet E2E configuration](https://github.com/midnightntwrk/midnight-faucet-api/blob/main/tests/src/e2e/setup/envConfig.ts)
- [Faucet public API documentation](https://github.com/midnightntwrk/midnight-faucet-api/blob/main/README.md#public-api-api)

The selected public prerelease family is:

- Midnight.js [5.0.0-beta.6](https://github.com/midnightntwrk/midnight-js/releases/tag/v5.0.0-beta.6), with the exact dependency bundle in its [protocol manifest](https://github.com/midnightntwrk/midnight-js/blob/v5.0.0-beta.6/packages/protocol/package.json)
- Compact compiler `0.33.0-rc.1`, as pinned by the beta.6 development/migration documentation; Compact.js [2.5.5-rc.7](https://github.com/midnightntwrk/midnight-sdk/releases/tag/compact-js-v2.5.5-rc.7)
- Indexer [4.4.0-rc.1](https://github.com/midnightntwrk/midnight-indexer/releases/tag/v4.4.0-rc.1)
- Ledger v9 `1.0.0-rc.3`, on-chain runtime v4 `4.0.0-rc.3`, Compact runtime `0.18.0-rc.1`, and platform JS `3.0.0`

Why this lane is fixed rather than provisional:

- beta.6 adds local call-tree log forwarding; the checked-out source/API exposes it as `result.public.logEvents`, decoded with `ContractLog.decodeAll`. Some release prose calls the additive field `events`, but the implementation and generated API agree on `logEvents`.
- indexer rc.1 is the first real Ledger-9/node-2 release candidate with contract-event queries.
- the live `specVersion=2000000` falls in indexer rc.1's `[2_000_000, 2_001_000)` Ledger-v9 gate.
- `networkId` is the literal `stagenet`, matching the wallet's StageNet enum and address encoding.

The locked packages are still not proof that hosted stagenet accepts a ZKIR-v3 Keccak proof. That separate verify-side risk is tested early in C11.

Official feature references:

- [Compact CCC callee](https://github.com/LFDT-Minokawa/compact/blob/compactc-v0.33.0-rc.2/test-center/composable/Basic/Inner.compact), [caller](https://github.com/LFDT-Minokawa/compact/blob/compactc-v0.33.0-rc.2/test-center/composable/Basic/Outer.compact), and [TypeScript test](https://github.com/LFDT-Minokawa/compact/blob/compactc-v0.33.0-rc.2/test-center/ts/composable/basic.ts)
- [CCC draft specification](https://github.com/LFDT-Minokawa/compact/blob/compactc-v0.33.0-rc.2/coips/coip-0002.md)
- [Midnight.js `CallResult` API](https://github.com/midnightntwrk/midnight-js/blob/v5.0.0-beta.6/docs/api/midnight-js/%40midnight-ntwrk/midnight-js-contracts/interfaces/CallResult.md)
- [Compact event catalog](https://github.com/LFDT-Minokawa/compact/blob/compactc-v0.33.0-rc.2/compiler/midnight-events.ss)
- [Local versus indexed event ADR](https://github.com/midnightntwrk/midnight-js/blob/v5.0.0-beta.6/docs/adr/0002-compact-js-owns-local-execution-events.md)
- [Compact 0.33 crypto changelog](https://github.com/LFDT-Minokawa/compact/blob/compactc-v0.33.0-rc.2/CHANGELOG.md) and [Keccak/ECDSA example](https://github.com/LFDT-Minokawa/compact/blob/compactc-v0.33.0-rc.2/examples/ecdsa/example_one.compact)

## 4. Basal state measured on 2026-08-10

### 4.1 Repository safety gate

Before any research execution:

- `git fetch --prune origin v-next` succeeded.
- `git merge --ff-only origin/v-next` reported “Already up to date.”
- branch: `v-next`
- HEAD: `097b507b81c10e370431c891bec433a06bfb6dd8`
- upstream divergence: `0 0`
- worktree: clean
- local-only/unpushed commits: none

Only this planning document is intentionally added after that gate. No source, lockfile, configuration, or generated artifact in the repository was changed.

### 4.2 Isolation and ports

Docker Desktop 29.1.3 on arm64 was used. No project or reference code was run on the host.

The free host range reserved for the assessment was `22000-22099`. The actual run published only loopback ports `22000-22009`. Each port was checked against host listeners and existing Docker publications before the run. The test container received no host mounts, secrets, credential agents, or Docker socket and was removed at exit.

Future runs must re-check rather than assume this range remains free. Compose ports must be overrideable so concurrent agents can select another contiguous range above 10000.

### 4.3 Current template image build

The existing template was built from the baseline commit:

```text
docker build --progress=plain \
  --label effectstream.baseline.commit=097b507b81c10e370431c891bec433a06bfb6dd8 \
  -t effectstream-midnight-baseline:097b507b templates/evm-midnight-v2
```

Result: PASS.

- image ID: `sha256:b4250a816c4bf21efd2aaa626a3001ae9e0881302d00ae4e727acc81831c0568`
- image size: approximately 691 MB
- container runtimes observed: Bun `1.3.14`, Node `24.19.0`
- Compact manager `0.5.1` installed compiler `+0.31.0`
- Solidity and Compact compilation completed
- an existing Forge diagnostic about a modifier-style base constructor call appeared, after which the existing Hardhat fallback deployed successfully; build exit was zero

### 4.4 Current full template test

The built image was run as a disposable container with 6 CPUs, 10 GB memory, a PID limit, `no-new-privileges`, and loopback-only publications in the reserved range.

Result: FAIL at the top-level test command, with the protocol/application path mostly healthy.

- 24 checks passed and 1 check was recorded failed.
- Compact compilation, local node/indexer/proof readiness, contract deployment, synchronization, EVM tests, cross-chain tests, backend, and state-machine checks passed.
- A real local Midnight increment transaction was finalized as `000c88aa8910f20c5508c684791b20859687ac96621b0a5869f5d97d76b1d1d872` at block 17.
- The resulting value synchronized to the database and API.
- The frontend Vite build exhausted its default V8 heap (`Reached heap limit`), and the render server then timed out after 60 seconds. This caused exit code 1.
- Duplicate Polkadot CJS/ESM package warnings were also present.

This is a pre-existing baseline failure in the current template/harness, not evidence that the new stagenet issue is implemented. It must be kept separate in regression reporting. The new template's test command must return zero; it must not copy the current harness behavior of catching a failed phase, printing a mostly-passing summary, and still leaving an ambiguous result.

### 4.5 Non-mutating live stagenet probes

All probes ran in disposable `oven/bun:1` containers without mounts or secrets.

| Probe | Result |
| --- | --- |
| Indexer HTTP GraphQL `{ __typename }` | PASS, HTTP 200 with `Query` |
| Node WSS `system_health` | PASS, 6 peers, not syncing |
| Indexer GraphQL WSS `graphql-transport-ws` handshake | PASS, `connection_ack` |
| Faucet `OPTIONS` only | PASS, HTTP 204; no drip requested |
| Node `system_chain` | `Midnight Stagenet` |
| Node `system_version` | `2.0.0-d9729c13` |
| Runtime version | `specVersion=2000000`, `transactionVersion=4` |
| Current Effectstream default block selection sent to API v4 | PASS at height 452910, `protocolVersion=2000000` |

API v4 introspection also confirmed `contractEvents` and event-aware fields. `ContractEvent` exposes identity/raw/version/protocol/contract/transaction data; implementations include `MiscContractEvent`, pause/unpause, shielded mint/burn/spend/receive, and unshielded mint/burn/spend/receive.

### 4.6 Baseline conclusion

| Capability | Current state |
| --- | --- |
| Reach hosted node/indexer endpoints | Available |
| Basic current block query against API v4 | Available |
| Explicit first-class stagenet configuration | Missing |
| Node 2/Ledger 9/Midnight.js 5 deployment/proof path | Missing and incompatible with current package line |
| CCC artifact compilation/deployment/call-tree handling | Missing |
| Contract event selection, decoding, filtering, and Effectstream primitive | Missing |
| Compact 0.33 ZKIR-v3 crypto compile/prove/verify | Missing |
| Integrated Docker test for all three features | Missing |

The issue is therefore confirmed as an absent feature path, not a transient endpoint outage. The network is reachable, but the current implementation cannot deliver or test the requested template.

## 5. Proposed template behavior

Use two deliberately small contracts compiled from the same pinned toolchain.

### 5.1 `CryptoEventSink` callee

Properties:

- no witnesses or private ledger state;
- public `lastDigest: Bytes<32>` initialized to zero;
- public `paused: Boolean` initialized to true;
- exported `hashStoreAndUnpause(value: Bytes<32>): Bytes<32>` circuit;
- computes `keccak256<Bytes<32>>(value)`;
- stores and returns the disclosed digest;
- changes `paused` to false and emits the catalog `Unpaused {}` event.

Using `Unpaused` keeps the event semantically honest and exercises the smallest standard event proof. Do not add a `Misc` path on this lock: beta.6's own event suite skips `emitMisc` pending a proof-server-side fix.

This contract is intentionally a single-call smoke fixture. `hashStoreAndUnpause` emits `Unpaused` whenever it is called, including a later call after `paused` is already false. Consumers must not interpret this fixture's event as a general state-transition guarantee; the tests deploy a fresh sink and call it once.

### 5.2 `FeatureGateway` root

Properties:

- declares the exact public interface of `CryptoEventSink`;
- stores the typed callee reference supplied to its constructor;
- has no constructor call or constructor event;
- exported `run(value: Bytes<32>): Bytes<32>` discloses the CCC argument and calls `sink.hashStoreAndUnpause(...)`;
- returns the callee's digest.

The compile and deploy order is strict:

1. compile `CryptoEventSink` with `--feature-zkir-v3`;
2. expose its generated interface/verifier artifact under the exact name the gateway expects;
3. compile `FeatureGateway` with the same compiler and only the feature flags required by its own emitted circuits;
4. deploy `CryptoEventSink`;
5. construct and deploy `FeatureGateway` with the typed sink address;
6. register/fetch ZK configurations for the entire call tree;
7. call only `FeatureGateway.run` for the integrated assertion.

One successful root transaction must prove:

- its returned digest equals an independently computed Keccak-256 vector (not SHA3-256);
- the indexed sink ledger has the same `lastDigest` and `paused=false` at the finalized block;
- `CallResult.calls` contains the sink before the gateway and both addresses are the expected deployments;
- `ContractLog.decodeAll(result.public.logEvents)` exposes exactly one local `Unpaused` event emitted by the sink;
- the API v4 indexer later exposes exactly that event for the sink and root transaction;
- Effectstream ingests the finalized event once, survives restart/replay without duplication, and feeds the configured state-machine transition.

## 6. Commit-sized implementation checkpoints

The checkpoints below are intentionally narrow and ordered. Each code checkpoint must:

1. begin from the previous passing checkpoint;
2. change only the listed scope;
3. add its own test in the same commit;
4. run that test in Docker/Compose and exit zero;
5. leave no test container, Compose project, or unexpected generated file behind; and
6. become a commit before the next checkpoint begins.

Generated Compact artifacts should be built in the container and kept in a container layer or named volume unless a runtime genuinely requires checked-in output. Commit source, build scripts, lock metadata, and artifact assertions—not incidental generated files.

The suggested commit messages are boundaries, not authorization to commit. Do not create a checkpoint commit when its required test fails.

Each test block is meant to be independently runnable. When a block starts with `docker run` and references `effectstream/midnight-v2:cNN`, first build that exact checkpoint from the current tree:

```text
docker build --progress=plain \
  -f templates/midnight-stagenet-v2/Dockerfile \
  -t effectstream/midnight-v2:cNN .
```

Do not reuse an image tag built from an earlier checkpoint. C01, C03, and C04 show specialized build targets because creating or validating that target is part of the checkpoint itself.

### Checkpoint overview

| ID | Bounded deliverable | Proof required before commit |
| --- | --- | --- |
| C00 | Clean/fetched Git safety gate | Clean `v-next`, divergence `0 0`; no commit |
| C01 | Empty isolated template and Docker test shell | Scaffold image builds and offline smoke exits zero |
| C02 | Read-only stagenet/image probe and beta.6 compatibility lock | Fixtures, live read, image pull/digest/platform checks pass |
| C03 | Pinned Compact 0.33/ZKIR-v3 compiler/proof toolchain | Compiler identity and minimal Keccak prove/verify pass |
| C04 | Standalone `CryptoEventSink` contract build | Sink compiles and its artifacts validate |
| C05 | `FeatureGateway` and complete call-tree build | Sink-first/gateway-second compile and binding checks pass |
| C06 | Contract compiler and crypto negative tests | Positive vectors and expected compiler failures pass |
| C07 | Explicit stagenet network profile | URL/default/override/redaction unit tests pass |
| C08 | Node-22-isolated Midnight v2 provider package | Package graph, provider, and real WASM tests pass |
| C09 | Call-tree artifact/ZK configuration loader | Ordering, missing, duplicate, and mismatch tests pass |
| C10 | Local sink deploy and direct call | Deploy/prove/state/Keccak/local-event test passes |
| C11 | Early hosted Keccak/ZKIR-v3 verification gate | One minimal authorized hosted deploy/call proves node-side V3 verification |
| C12 | Local gateway deploy and CCC call | Full root/callee call-tree test passes |
| C13 | API v4 contract-event query and decoder | GraphQL fixture/compatibility tests pass |
| C14 | `Midnight:ContractEvent` primitive | Filter/dedup/replay primitive tests pass |
| C15 | Minimal template node/database/state machine | Synthetic event-to-state test passes |
| C16 | Full local Compose integration | Deploy/call/index/restart/replay E2E passes |
| C17 | Containerized live read-only canary | Current hosted version/schema/WS checks pass |
| C18 | Secret-gated live write canary implementation | Gate/redaction/local substitute tests pass |
| C19 | Actual hosted integrated validation and final lock | One authorized live gateway transaction passes all assertions |
| C20 | Regression and CI/template registration | New suite passes; old baseline has no new failures |
| C21 | Reproduction and security documentation | Fresh Docker-only walkthrough and link checks pass |

### C00 — repeat the Git safety gate

Scope:

- Run section 10 exactly.
- The reviewed plan must already be committed, or otherwise removed from the implementation worktree by the user; it cannot remain an unexplained untracked file.
- Do not stash, delete, commit, switch away from, or overwrite an unexpected user file.

Required test: the two status checks are empty, `v-next` equals `origin/v-next`, and divergence is `0 0`.

Pass condition: the repository is demonstrably clean and fast-forwarded. Otherwise **FULL STOP**.

Commit: none.

### C01 — scaffold only the isolated template and Docker test shell

Scope:

- Add `templates/midnight-stagenet-v2` with `Dockerfile.dockerignore`, `Dockerfile`, `compose.yaml`, `package.json`, lockfile, and a `packages/tests` shell.
- Keep the repository root as the Docker build context because later checkpoints require shared `packages/`. Do not add `templates/midnight-stagenet-v2/.dockerignore`: Docker would ignore that file for a root-context build. BuildKit must use `templates/midnight-stagenet-v2/Dockerfile.dockerignore`, whose per-Dockerfile rules take precedence over the root `.dockerignore`.
- Make the per-Dockerfile ignore file an allowlist for the template, root manifests/lockfiles, and only the shared package paths actually needed by the current checkpoint. Expand it deliberately when a later checkpoint introduces another shared package.
- Add unique Compose project naming, exact cleanup, and an overrideable diagnostic host-port map.
- Do not add contracts, Midnight providers, wallet code, deployment code, or Effectstream state logic yet.
- Keep automated test services internal to the Compose network. Host ports are only for explicit diagnostics and must come from a newly checked range above 10000.

Required Docker test:

```text
docker build --target scaffold-test \
  -f templates/midnight-stagenet-v2/Dockerfile \
  -t effectstream/midnight-v2:c01 .
docker run --rm --network none effectstream/midnight-v2:c01
```

Pass condition: BuildKit reports the per-Dockerfile ignore rules in use, the image builds from the allowlisted root context, the offline smoke exits zero, image inspection shows no excluded repository paths, host/reference files, or secrets, and no container remains. A test-only excluded sentinel must be absent from the image/context stage so this cannot pass while silently using only the root `.dockerignore`.

Suggested commit: `chore(template): scaffold isolated Midnight v2 template`

### C02 — add read-only probes and lock the beta.6/rc.1 lane

Scope:

- Add a small containerized probe for node WSS, indexer HTTP GraphQL, indexer GraphQL WSS, and optional faucet `OPTIONS`.
- Add captured response fixtures so parser tests work without the network.
- Lock exactly the beta.6/Compact-rc.1 matrix in section 3.2. Retain beta.4 only as reference evidence; it is not a fallback because it lacks the required local event surface.
- Verify that node `2.0.0-rc.4`, indexer `4.4.0-rc.1`, and proof server `9.0.0-rc.5_experimental` are publicly pullable and resolve to recordable immutable digests. Do not substitute the plain proof-server rc.5 tag.
- Inspect each image manifest for `linux/arm64`, because the assessment/target Docker Desktop host is arm64. If only `linux/amd64` exists, mark the image as emulation-dependent and require C03's bounded startup/prove/verify smoke.
- Record node/runtime observations, GraphQL schema fingerprint, exact locked versions, image digests/platforms, `networkId: "stagenet"`, and `hostedZkirV3Verification: "unverified"` in `compatibility-lock.json` plus `COMPATIBILITY.md`.
- Do not initialize a wallet, request funds, deploy, prove, or submit a transaction.

Required Docker tests:

```text
docker run --rm --network none effectstream/midnight-v2:c02 \
  bun run test:compatibility:fixtures
docker run --rm effectstream/midnight-v2:c02 \
  bun run test:live:read
docker buildx imagetools inspect <locked-node-image>@<digest>
docker buildx imagetools inspect <locked-indexer-image>@<digest>
docker buildx imagetools inspect <locked-proof-image>@<digest>
docker compose -f templates/midnight-stagenet-v2/compose.yaml \
  --project-name effectstream-midnight-v2-c02-<run-id> \
  --profile image-preflight pull
```

Pass condition: offline fixtures pass; the live endpoint identifies `Midnight Stagenet`, spec version `2000000`, Ledger-v9 event fields, and the exact network ID; drift fails with a clear redacted error; every locked image is pullable by digest; and native/emulated platform status is recorded. The release lane is fixed, while hosted ZKIR-v3 verification remains explicitly unverified until C11.

Suggested commit: `test(midnight-v2): probe network and local-stack images`

### C03 — pin and verify the Compact compiler/proof toolchain

Scope:

- Install Compact manager `0.5.1` in its own Docker stage and install the published compiler with `compact update 0.33.0-rc.1`; do not reproduce the reference repository's patched Nix/source build.
- Pin the installed compiler asset/checksum/banner, language `0.25`, runtime `0.18.0-rc.1`, Node `>=22`, and package-manager versions.
- Add one tiny throwaway Keccak circuit used only to prove that `--feature-zkir-v3` is recognized.
- Start the locked `9.0.0-rc.5_experimental` proof-server image on a private Compose network and use the tiny circuit for a real local prove/verify smoke with an explicit timeout. Assert the circuit produces verifier-key `[v7]`/proof V3 material; the plain proof image is an expected negative fixture.
- For a native `linux/arm64` image, record startup/prove/verify timing. For an amd64-only image, set `platform: linux/amd64`, exercise Docker emulation, and enforce a documented maximum duration. Failure, unsupported instructions, or impractical timeout rejects the locked lane before contract work.
- Start/version-smoke the locked node and indexer images on the chosen platform as well; full chain health remains C10.
- Do not add either template contract in this checkpoint.

Required Docker test:

```text
docker build --target compiler-test \
  -f templates/midnight-stagenet-v2/Dockerfile \
  -t effectstream/midnight-v2:c03 .
docker run --rm --network none effectstream/midnight-v2:c03 \
  bun run test:compiler-smoke
docker compose -f templates/midnight-stagenet-v2/compose.yaml \
  --project-name effectstream-midnight-v2-c03-<run-id> \
  --profile toolchain-smoke up --build --abort-on-container-exit \
  --exit-code-from toolchain-tests
```

Pass condition: the reported compiler identity is exactly rc.1; the smoke circuit compiles with ZKIR v3 and yields the expected v7/V3 artifacts; one bounded prove/verify succeeds only with the experimental proof image; node/indexer images start sufficiently for version checks; timings/platforms are recorded; and rc.2, the plain proof image, a mismatched compiler, or unusable emulation fails the checkpoint.

Suggested commit: `build(midnight-v2): pin Compact 0.33 ZKIR v3 toolchain`

### C04 — add and compile `CryptoEventSink` by itself

This is the first contract checkpoint and must stand alone. It proves the repository can build a real requested contract before any deployment or CCC work begins.

Scope:

- Add only the `CryptoEventSink` Compact source and its package/build script.
- Implement `lastDigest`, `paused`, `keccak256`, and the `Unpaused` emission described in section 5.1.
- Compile with `compactc --feature-zkir-v3 <source> managed/CryptoEventSink`. Never pass `--no-communications-commitment`, because that would remove CCC integrity.
- Treat `ZKIR not found` on stderr as a hard failure even if `compactc` exits successfully.
- Validate the generated TypeScript module, ledger description, proving/verifier keys, and compiler metadata; ship `compiler/contract-manifest.json` together with every artifact it authenticates, and pin the manifest's SHA-256.
- Keep the contract at seven or fewer exported circuits; the template uses only the single required feature circuit.
- Do not add the gateway, providers, wallet, or deployment scripts.

Required Docker test:

```text
docker build --target contract-test \
  -f templates/midnight-stagenet-v2/Dockerfile \
  -t effectstream/midnight-v2:c04 .
docker run --rm --network none effectstream/midnight-v2:c04 \
  bun run test:compile:sink
```

Pass condition: a clean container compiles the sink from source, every expected artifact and the integrity manifest exist and are non-empty, `NodeZkConfigProvider` accepts them in fail-closed mode, metadata matches C03, no skipped-ZKIR warning occurred, and a second clean build produces the same manifest/checksums except explicitly documented nondeterministic fields.

Suggested commit: `feat(midnight-v2): compile crypto event sink contract`

### C05 — add and compile `FeatureGateway` and the full call tree

Scope:

- Add only the gateway interface/source and the call-tree compile orchestration.
- Compile the sink first and expose its interface/verifier artifact under the exact name expected by `FeatureGateway`.
- Place both managed bundles as siblings under one artifact root. The callee output directory must be named exactly `CryptoEventSink`, matching the gateway's declared `contract CryptoEventSink { ... }` interface. Baseline execution found that Compact 0.33 accepts the external CCC declaration without linking a sibling artifact, so the repository build guard—not `compactc` itself—must resolve and authenticate `managed/CryptoEventSink/compiler/contract-info.json` before compiling the gateway.
- Compile the gateway second with the same rc.1 compiler. Use `--feature-zkir-v3` only for circuits that themselves require Keccak/secp; events and CCC alone do not require the flag. Record the ZKIR/proof version of every exported circuit.
- Never pass `--no-communications-commitment`, trap `ZKIR not found` on stderr, and enforce seven or fewer exported circuits per deployable contract.
- Produce a call-tree manifest that binds logical interface name, artifact path/checksum, compiler-manifest hash, verifier key, and ZKIR version.
- Do not deploy or initialize a wallet.

Required Docker test:

```text
docker run --rm --network none effectstream/midnight-v2:c05 \
  bun run test:compile:call-tree
```

Pass condition: both contracts compile from a clean state in the required order, use one compiler generation, retain communications commitments, pass fail-closed artifact-manifest checks, and the explicit gateway build guard resolves only the authenticated sibling `CryptoEventSink`. Reversing the build order, renaming the directory, emitting a skipped-ZKIR warning, or substituting a fixture artifact must fail. The first two are build-orchestration failures because the compiler does not enforce sibling linkage by itself.

Suggested commit: `feat(midnight-v2): compile gateway contract call tree`

### C06 — add contract compiler and crypto negative tests

Scope:

- Add known Keccak-256 vectors, including all-zero input and a value ending in `0x00`, using an independent pinned Keccak implementation rather than SHA3-256.
- Assert the ledger-writing/provable Keccak fixture fails without `--feature-zkir-v3`; baseline execution confirms a pure Keccak circuit intentionally remains flag-free because it never enters ZKIR.
- Add negative fixtures for a witness/private-state callee, constructor CCC, constructor event, undisclosed impure CCC argument, undeclared event, purity mismatch, and recursive/reentrant interface. Baseline execution classifies constructor/argument/event/type-cycle cases as compiler failures, while witness-bearing callees and purity mismatches are explicit template-policy failures derived from authenticated compiler metadata because Compact accepts those source units independently.
- Add a minimal `KeccakHostedProbe` test fixture with one `hashAndStore(Bytes<32>)` circuit, public `lastDigest`, no event, and no CCC. C11 uses it to isolate hosted ZKIR-v3 verification from all other new features.
- Add Compact 0.33 migration fixtures: numeric literals used as `Field` must use an explicit `as Field` cast, and Ledger-8 `ContractState[v6]` fixtures must be rejected rather than migrated into Ledger-9 `ContractState[v8]`.
- Keep all negative contracts as test fixtures, never template examples.

Required Docker test:

```text
docker run --rm --network none effectstream/midnight-v2:c06 \
  bun run test:contracts
```

Pass condition: positive fixtures compile and match vectors; every negative fixture fails for its expected diagnostic rather than merely returning a nonzero exit for an unrelated reason.

Suggested commit: `test(midnight-v2): cover contract compiler and crypto boundaries`

### C07 — add the explicit stagenet network profile

Scope:

- Extend the relevant Effectstream network/config schema with literal `networkId`, validated `nodeUrl`, `indexerHttpUrl`, `indexerWsUrl`, required `proofServerUrl`, and `faucetUrl`.
- Add `networkId: "stagenet"` and the four requested hosted defaults to the new template. `proofServerUrl` points to the template's local experimental proof-server service even when node/indexer are hosted; there is no public prover.
- Define environment override precedence, protocol validation, rejection of embedded URL credentials, and redacted error formatting.
- Do not add deployment/provider behavior.

Required Docker test:

```text
docker run --rm --network none effectstream/midnight-v2:c07 \
  bun run test:network-profile
```

Pass condition: network ID/endpoints are exact, omitting the proof server fails before wallet/provider construction, valid overrides win, malformed/insecure URLs fail, secrets are redacted, and existing v1/local profiles remain byte-for-byte equivalent in their tests.

Suggested commit: `feat(config): add explicit Midnight stagenet v2 profile`

### C08 — add an isolated Midnight v2 provider package

Scope:

- Add `packages/chains/midnight-contracts-v2` for the selected Ledger 9/on-chain-runtime-v4/Midnight.js 5 family.
- Add provider construction and typed interfaces only; no deployment or transaction submission yet.
- Keep Ledger 8/runtime-v3 dependencies in the existing package unchanged.
- Run the v2 provider/deployment package under pinned Node `>=22`; Bun remains only the monorepo package manager/task launcher. Connect the Bun Effectstream process to the Node worker/container through a typed, versioned, redacted IPC/RPC boundary.
- Import protocol types only through `@midnight-ntwrk/midnight-js-protocol/ledger` and `/onchain-runtime`. Do not import the protocol WASM packages directly from application code.
- Force one copy of each protocol WASM package using the beta.6 migration-guide resolutions:

```json
{
  "resolutions": {
    "@midnightntwrk/ledger-v9": "1.0.0-rc.3",
    "@midnightntwrk/onchain-runtime-v4": "4.0.0-rc.3",
    "@midnight-ntwrk/platform-js": "3.0.0",
    "@midnight-ntwrk/compact-runtime": "0.18.0-rc.1"
  }
}
```

- Pin Midnight.js packages to `5.0.0-beta.6`, Compact.js to `2.5.5-rc.7`, and the complete wallet barrel (new no-hyphen `@midnightntwrk` scope) exactly as follows:

```json
{
  "@midnightntwrk/wallet-sdk": "2.0.0-beta.2",
  "@midnightntwrk/wallet-sdk-abstractions": "3.0.0-beta.0",
  "@midnightntwrk/wallet-sdk-address-format": "4.0.0-beta.2",
  "@midnightntwrk/wallet-sdk-capabilities": "4.0.0-beta.2",
  "@midnightntwrk/wallet-sdk-dust-wallet": "5.0.0-beta.2",
  "@midnightntwrk/wallet-sdk-facade": "5.0.0-beta.2",
  "@midnightntwrk/wallet-sdk-hd": "3.1.0-beta.1",
  "@midnightntwrk/wallet-sdk-indexer-client": "1.3.0-beta.1",
  "@midnightntwrk/wallet-sdk-node-client": "2.0.0-beta.2",
  "@midnightntwrk/wallet-sdk-prover-client": "2.0.0-beta.2",
  "@midnightntwrk/wallet-sdk-runtime": "1.0.6-beta.0",
  "@midnightntwrk/wallet-sdk-shielded": "4.0.0-beta.2",
  "@midnightntwrk/wallet-sdk-unshielded-wallet": "4.0.0-beta.2",
  "@midnightntwrk/wallet-sdk-utilities": "1.2.0"
}
```
- Under Node, actually exercise Ledger v9 and on-chain-runtime-v4 WASM with a deterministic in-memory encode/decode/state operation. A successful module import or provider construction against fakes is insufficient.
- Type-check the v2 package through a strict consumer fixture. Basal execution found declaration errors internal to the pinned prerelease `compact-js`/`thread-stream` graph, so this consumer check uses `skipLibCheck`; it still resolves and exercises the package's exported types.
- Reject duplicate package copies and `instanceof`/type identity splits before provider construction; never load Ledger 8 and Ledger 9 in one process.
- The legacy `packages/chains/midnight-contracts` package has no direct `*.test.*`/`*.spec.*` files at this baseline. C08 therefore authenticates its complete 16-file tree as unchanged; the external Ledger-8 wallet regression remains part of C20's affected-package gate.

Required Docker test:

```text
docker run --rm --network none effectstream/midnight-v2:c08 \
  node packages/tests/run-v2-provider-tests.mjs
docker run --rm --network none effectstream/midnight-v2:c08 \
  node packages/tests/run-v2-wasm-smoke.mjs
```

Pass condition: dependency versions exactly match the lock and resolve to one physical copy; provider objects construct against fakes without network access or keys under Node 22+; a real deterministic Ledger-v9/runtime-v4 WASM operation succeeds under Node; the typed Bun-to-Node boundary round-trips a redacted fixture; the old v1 package tests still pass; and collision guards reject duplicate or mixed-runtime processes.

Suggested commit: `feat(midnight): add isolated v2 provider package`

### C09 — add the call-tree artifact and ZK configuration loader

Scope:

- Load the C05 manifest, validate artifact checksums, and discover the complete root/callee tree.
- Construct one fail-closed `new NodeZkConfigProvider(managed/<ContractName>, { verify: "require", expectedManifestHash })` per deployable contract, using the exact sibling directories emitted in C05. This is the beta.6 constructor shape; the manifest hash is an integrity option, not a positional argument.
- Construct the proof-provider registry with `nodeZkConfigRegistry(<parent-of-managed>)` so the entire root/callee call tree is available during proving; do not point it at only the gateway bundle.
- Resolve ZK configurations once per implementation and preserve callee-first/root-last ordering.
- Add block-pinned state-query interfaces for both contracts.
- Reject missing, duplicate, stale, or address/verifier-key-mismatched implementations before wallet signing.
- Do not deploy or submit a transaction.

Required Docker test:

```text
docker run --rm --network none effectstream/midnight-v2:c09 \
  bun run test:call-tree-loader
```

Pass condition: the valid fixture produces exactly `[sink, gateway]`, one provider per implementation, and a registry rooted at the shared managed parent; each corrupted fixture fails before the fake signer is called; logs contain no raw call/proof data.

Suggested commit: `feat(midnight-v2): validate contract call-tree artifacts`

### C10 — deploy and call only the sink on a local 2.x stack

Scope:

- Add pinned local node/indexer/proof services and health checks to Compose.
- Add phased deployment and transaction submission sufficient for one contract.
- Initialize the local test wallet with unshielded NIGHT, perform DUST registration when required (or prove that its NIGHT UTXOs are already registered), and assert a sufficient local fee budget before submission; use the same wallet-readiness code that C11 will exercise against hosted stagenet.
- Deploy only `CryptoEventSink` and call it directly with a fixed vector.
- Assert returned digest, finalized `lastDigest`, `paused=false`, and exactly one local `Unpaused` event decoded with `ContractLog.decodeAll(result.public.logEvents)`.
- Do not deploy the gateway or run Effectstream ingestion.

Required Compose test:

```text
docker compose -f templates/midnight-stagenet-v2/compose.yaml \
  --project-name effectstream-midnight-v2-c10-<run-id> \
  --profile sink-e2e up --build --abort-on-container-exit \
  --exit-code-from sink-tests
```

Pass condition: all services become healthy, one direct sink transaction proves and finalizes, assertions pass, and exact-project cleanup removes containers/volumes. If diagnostics expose host ports, they must use a freshly verified range above 10000.

Basal execution (2026-08-10): **pass**. The isolated Compose run used no published host ports, deployed `CryptoEventSink`, finalized one direct call at local block 13, returned and stored `290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563`, set `paused=false`, and decoded exactly one non-degraded `unpaused` local event. The independent pinned Noble oracle agreed with the contract's Keccak-256 result. The deterministic local seed's five genesis NIGHT UTXOs were already registered and had positive DUST, so the shared readiness path proved `already-registered` rather than submitting a redundant registration; C11 must still register a hosted wallet when necessary. The proof-server image has no `curl`, so its health check uses shell built-ins and `/proc/net/tcp`. Exact-project cleanup left no checkpoint containers or volumes. C08 provider/WASM and C09 call-tree regressions also passed afterward under Docker with `--network none`.

Suggested commit: `feat(midnight-v2): deploy and prove sink locally`

### C11 — verify hosted ZKIR-v3 Keccak before CCC integration

This is an early external compatibility gate, not the full hosted template validation. It isolates the plan's highest-risk assumption before later application and CCC checkpoints accumulate around it.

Scope:

- Require explicit authorization and a disposable prefunded stagenet wallet supplied as a Docker secret; skip before provider initialization when either is absent.
- Run the local pinned `9.0.0-rc.5_experimental` proof server and connect it to the hosted node/indexer. There is no public prover fallback.
- Verify the wallet holds unshielded NIGHT, perform the required DUST registration, and wait until the wallet reports sufficient DUST to pay fees before deployment.
- Deploy only C06's minimal `KeccakHostedProbe`; submit one `hashAndStore` call with a known Keccak-256 vector. Do not deploy the sink/gateway, emit an event, run CCC, or start Effectstream.
- Capture the starting finalized block, deployed address, transaction hash, node/runtime observations, verifier-key/proof versions, and finalized public digest. Redact wallet, witness, proof, and private-state material.
- On success, change only `hostedZkirV3Verification` in the compatibility lock from `unverified` to `validated`, with redacted evidence.
- Never automate the public Turnstile faucet. As a separate coordination question, ask the team whether a documented authenticated funding API exists; do not make the checkpoint depend on an undocumented endpoint.

Required Compose test:

```text
RUN_STAGENET_WRITE_TESTS=1 \
MIDNIGHT_V2_WALLET_SEED_SOURCE_FILE=/absolute/path/to/disposable.seed \
docker compose -f templates/midnight-stagenet-v2/compose.yaml \
  --project-name effectstream-midnight-v2-c11-<run-id> \
  --profile hosted-keccak run --rm hosted-keccak-tests
```

Pass condition: the hosted node accepts the deployed V7 verifier key and one locally produced V3 Keccak proof, finalizes the transaction, and exposes the expected digest in contract state. If funding/authorization is absent, C11 is blocked. If hosted verification rejects valid locally proven material, **HARD STOP** and reopen scope with the user; secp256k1 is not a non-V3 crypto fallback.

Basal execution (2026-08-10): **pass**. A read-only Docker-secret preflight first proved that public genesis seed `…0001` is funded on the hosted stagenet as well as local `undeployed`: one native UTXO was already registered and DUST was positive, with no write submitted. The authorized isolated Compose run then started the pinned experimental proof server, deployed the one-circuit/no-event/no-CCC `KeccakHostedProbe`, and finalized its call at block 457723. Stagenet accepted the compiler-manifest `0582a9ab211b163df40d56b20015c71c92e7405c1fc5e922ae4f773e6e782ce0`, ZKIR v3, V7 verifier key, and proof-server `9.0.0-rc.5` output; indexed `lastDigest` was `290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563`. Public transaction hashes are recorded in `COMPATIBILITY.md`; wallet secret, witness, proof bytes, and private state are not. No host port was published; `23471` was freshly checked and reserved only as the required diagnostic interpolation value.

Schedule risk: acquiring unshielded NIGHT may require a human Turnstile step, and DUST registration/accrual adds a second readiness wait. This can block the gate without indicating a code failure.

Suggested commit: `test(midnight-v2): validate hosted ZKIR v3 Keccak`

### C12 — deploy the gateway and prove the CCC path locally

Scope:

- Deploy sink first, then construct/deploy gateway with the typed sink address.
- Submit one root `FeatureGateway.run` call.
- Assert returned digest, sink state at the finalized block, expected addresses, and `CallResult.calls` order `[sink, gateway]`.
- Assert the sink's local and directly queried indexed `Unpaused` event correlate to the root transaction.
- Add one pre-submission artifact/address substitution rejection with no state/event change.
- Do not add the shared Effectstream event primitive yet.

Required Compose test:

```text
docker compose -f templates/midnight-stagenet-v2/compose.yaml \
  --project-name effectstream-midnight-v2-c12-<run-id> \
  --profile ccc-e2e up --build --abort-on-container-exit \
  --exit-code-from ccc-tests
```

Pass condition: one root transaction proves all three contract features locally and the negative substitution is rejected before submission.

Basal execution (2026-08-10): **pass**. The isolated no-host-port Compose run deployed sink `025f…c778` then gateway `2037…e2cb`; one gateway root transaction finalized at local block 16 with call order `[sink, gateway]`, returned/stored the canonical zero-vector Keccak-256 digest, and exposed exactly one non-degraded sink `unpaused` locally. API v4 indexed the correlated `Unpaused` event for the root transaction (event id 53, indexer transaction id 28), and block-hash-pinned sink state agreed with the call-tree state. A substituted sink address was rejected by the authenticated call-tree loader before submission, with sink state and event IDs unchanged. The initial basal attempt additionally proved the constructor's typed boundary: a raw `Uint8Array` address fails before gateway deployment; the correct Compact contract argument is `{ bytes: Uint8Array }`. Exact-project cleanup removed all containers, volumes, and the private network; diagnostic value `23472` was freshly checked but never published.

Suggested commit: `feat(midnight-v2): prove gateway contract-to-contract call`

### C13 — add API v4 event selection and decoding

Scope:

- Extend `MidnightClient.ts` and its types with an opt-in `contractEvents` selection.
- Require `ContractEventFilter.contractAddress` in every event query and use explicit inline fragments plus `__typename` for supported concrete variants.
- Normalize block, indexer transaction ID, emitter/event identity, protocol version, raw data, and typed fields. Treat all GraphQL amount fields as decimal strings; never coerce them through JavaScript `number`.
- Follow beta.6's fail-fast mapper policy for an unknown future `__typename`; never silently discard or partially normalize an unsupported variant.
- Keep the query behind the API-v4/beta feature gate and preserve the API-v3 query exactly when contract events are disabled.
- Do not add primitive routing or state-machine behavior.

Required Docker test:

```text
docker run --rm --network none effectstream/midnight-v2:c13 \
  bun run test:midnight-event-decoder
```

Pass condition: all recorded API v4 variants decode, large decimal amounts remain lossless strings, a missing contract address and malformed/missing fields fail clearly, unknown variants fail explicitly, and the API v3 query snapshot is unchanged when events are disabled.

Basal execution (2026-08-10): **pass**. The Dockerfile-specific allowlist was expanded by exactly three audited shared-package files (30 package files total in the context), and the `effectstream/midnight-v2:c13` image ran with `--network none` and no published ports. Four tests with 29 assertions decoded all 11 concrete API-v4 variants, preserved the maximum u128 decimal as a string, normalized emitter/protocol/indexer-transaction/chain-transaction/block identity, and rejected unknown variants, malformed fields, invalid address kinds, missing contract filters, an empty type filter, and a non-v4 feature gate. The disabled branch produced the pre-C13 API-v3 block query byte-for-byte. Diagnostic value `24713` was freshly checked free but never published.

Suggested commit: `feat(sync): decode Midnight API v4 contract events`

### C14 — add `Midnight:ContractEvent` and exactly-once behavior

Scope:

- Register the new primitive in config, fetcher dispatch, built-ins, exports, and grammar surfaces.
- Require the emitting contract address and support additional filters for concrete event type and optional typed fields. An event-type-only whole-network query is invalid.
- Treat `fromId` as inclusive: persist the last accepted indexer ID and resume at `lastId + 1`; separately tolerate at-least-once WebSocket delivery and overlapping block-range replay.
- Define and test a composite deduplication key from authoritative indexer fields; do not assume `id` or `transactionId` alone is a global chain identity. The indexer transaction ID is not the chain transaction hash; resolve/store the hash separately when needed.
- Use fixed `toBlock` boundaries for any paged backfill because offsets are stable only inside that snapshot.
- Cover reconnect, overlapping ranges, restart, replay, event ordering, and a simulated reorg.

Required Docker test:

```text
docker run --rm --network none effectstream/midnight-v2:c14 \
  bun run test:midnight-contract-event-primitive
```

Pass condition: fixtures produce deterministic primitives exactly once, filters cannot accidentally select the whole network, and all existing Midnight primitive tests pass.

Basal execution (2026-08-10): **pass**. The frozen root workspace installed inside the audited Docker build from 446 package files plus 27 E2E manifests; tests ran in `effectstream/midnight-v2:c14` with `--network none` and no published ports. The 23-test/84-assertion suite registered `Midnight:ContractEvent` across config, fetch dispatch, built-ins, exports, and grammar; required an API-v4 URL and one 32-byte emitter; exercised concrete-type and typed-field filters; preserved separate chain and indexer transaction identities; rejected a block/event hash race; and produced one deterministic primitive for duplicate/overlapping delivery. A JSON-serializable cursor snapshot carried the last accepted event ID across restart, resumed the indexer's inclusive cursor at `lastId + 1`, tolerated replay, and rewound from a simulated reorg; the composite identity changed when block/transaction identity changed even with the same event and indexer transaction IDs. Existing API-v3 query, API-v4 decoder, zswap decoder, mint decoder, and token-mint primitive tests also passed. A non-gating focused `tsc` diagnostic expanded through existing package re-exports and reproduced unrelated baseline type failures (address-type expansion, OpenTelemetry namespace, legacy decorator signatures, and UTxO RPC types); the command was not weakened or made part of C14, and C20 retains the repository-wide regression comparison. Diagnostic value `24714` was freshly checked free but never published.

Suggested commit: `feat(sm): add Midnight contract-event primitive`

### C15 — add the minimal Effectstream application slice

Scope:

- Add the template database schema, node configuration, one state-machine transition, and a small query/API surface.
- Store indexer transaction ID, separately resolved chain transaction hash, emitting sink address, digest, composite event identity, and processed count.
- Start synchronization at the captured deployment block.
- Test this slice with a synthetic C14 primitive; do not require a chain in this checkpoint.

Required Docker test:

```text
docker run --rm --network none effectstream/midnight-v2:c15 \
  bun run test:state-machine
```

Pass condition: one synthetic event creates one row/result, the same event applied twice still counts once, and a nonmatching emitter/type changes nothing.

Basal execution (2026-08-10): **pass**. The template's frozen Bun lock now includes its node workspace and test-only PGlite `0.3.16`; `effectstream/midnight-v2:c15` ran with `--network none` and no published ports. Three tests with nine assertions created the Postgres-compatible schema in an embedded database, built the stagenet/API-v4 node and `Midnight:ContractEvent` configuration at deployment block 42, applied one synthetic `Unpaused` primitive enriched with a block-pinned sink digest, and exposed both event-detail and summary queries. Reapplying the same composite event identity left the processed count at one, and substituted emitter/type inputs made no database change. The schema stores the indexer transaction row ID separately from the chain transaction hash, plus emitter, digest, block identity, event identity, and processed row count. Diagnostic value `24715` was freshly checked free but never published.

Suggested commit: `feat(template): persist Midnight contract events`

### C16 — join the pieces in one local Compose E2E

Scope:

- Connect C12's deployed contracts to C13-C15's event ingestion and state machine.
- Add the template's deterministic `test:hermetic` and default `test` scripts.
- Restart the Effectstream node and replay an overlapping block range.
- Keep all services internal to Compose unless explicit loopback diagnostics are enabled.

Required Compose test:

```text
docker compose -f templates/midnight-stagenet-v2/compose.yaml \
  --project-name effectstream-midnight-v2-c16-<run-id> \
  --profile hermetic up --build --abort-on-container-exit \
  --exit-code-from tests
```

Pass condition: compile, deploy, root call, Keccak result, call tree, local event, finalized indexed event, primitive, database row, state-machine output, restart, and replay all pass; processed count remains one; the command exits zero and swallows no failed phase.

Basal execution (2026-08-10): **pass**. With diagnostic interpolation value `24716` freshly checked free, the exact Compose gate ran under project `effectstream-midnight-v2-c16-20260810-24716`; the hermetic profile published no ports (all four services had empty Docker port bindings). The build recompiled the sink-first/root-last ZKIR-v3 call tree. Using the undeployed genesis seed only inside the container, the Node v2 process deployed both contracts, rejected a substituted callee address before submission, proved one gateway call, returned the independent Keccak-256 vector, observed call order `[sink, gateway]`, decoded one non-degraded local sink event, read the sink digest at the exact call block, and found one finalized indexed `Unpaused` event. That process then exited before the separately rooted Bun/Effectstream application ran, so Ledger-v9 and the legacy workspace dependency tree never loaded in one process. The application queried the same block through the shared API-v4 `MidnightClient`, invoked the actual `MidnightContractEventPrimitive`, persisted its composite identity and block-pinned digest through the C15 transition, and reported one row. A second Bun process reopened the same PGlite directory, rewound to the deployment range, replayed the duplicated indexed event, received `applied: false`, and still reported one row. The `tests` service exited zero; Compose's expected abort-on-test-exit teardown stopped the indexer afterward. The template's default `test` and explicit `test:hermetic` scripts now select this gate.

Suggested commit: `test(template): add hermetic Midnight v2 feature E2E`

### C17 — add the reusable live read-only canary

Scope:

- Promote C02's probe into `test:live:read` with bounded timeouts and a redacted report.
- Check chain/version/runtime, HTTP GraphQL, GraphQL WSS, latest/pinned block, schema fingerprint, and optional faucet `OPTIONS`.
- Compare the observations with the compatibility lock and report drift without changing the lock.
- Make no wallet/faucet/deployment calls.

Required Docker test:

```text
docker compose -f templates/midnight-stagenet-v2/compose.yaml \
  --project-name effectstream-midnight-v2-c17-<run-id> \
  --profile live-read run --rm live-read-tests
```

Pass condition: all current endpoints respond as expected, drift behavior is tested against fixtures, output is redacted, and no external state changes.

Basal execution (2026-08-10): **pass**. With inactive-diagnostics interpolation value `24717` freshly checked free, the frozen image first ran C17's compatibility, drift, and redaction fixtures under `--network none`; the compatible fixture produced no drift, mutations to the spec version and schema fingerprint produced both expected drift paths, and a credential/query/fragment-bearing URL was reduced to its origin/path with every sentinel removed. The exact `live-read` Compose command then made only bounded reads: hosted node identity/runtime/health and latest-plus-pinned block hash, HTTP GraphQL schema and latest-plus-pinned block, GraphQL WebSocket protocol acknowledgement, and faucet `OPTIONS`. It observed node `2.0.0-d9729c13`, spec `2000000`, transaction version `4`, six peers, a non-syncing node, the locked API-v4 schema fingerprint and all eleven contract-event variants, WSS `graphql-transport-ws`, and faucet status `204`; node and indexer pinned-block round trips were internally consistent at their independently observed heights. The machine report contained only redacted endpoint URLs and public compatibility data. The compatibility lock was compared but not changed, the service published no ports, and no wallet, faucet drip, proof, deployment, or transaction code was initialized.

Suggested commit: `test(midnight-v2): add live read-only stagenet canary`

### C18 — implement the secret-gated live write canary

Scope:

- Add `test:live:write` orchestration, bounded finality polling, unique run IDs/start blocks, and redacted machine-readable reporting.
- Require both `RUN_STAGENET_WRITE_TESTS=1` and a readable Docker secret containing a disposable prefunded wallet.
- Skip before provider/deployment initialization when authorization or funding is absent.
- Never call the faucet.
- Test behavior against the local C16 stack and fake secrets in this checkpoint; do not require a real credential to commit the implementation.

Required Compose tests:

```text
docker compose -f templates/midnight-stagenet-v2/compose.yaml \
  --project-name effectstream-midnight-v2-c18-<run-id> \
  --profile live-write-test up --build --abort-on-container-exit \
  --exit-code-from live-write-tests
```

Pass condition: missing authorization skips cleanly, malformed supplied credentials fail, the authorized local substitute path succeeds, and no key/witness/proof internals appear in logs or image layers.

Suggested commit: `test(midnight-v2): add secret-gated write canary`

### C19 — validate one real hosted integrated transaction and finalize the lock

Scope:

- This checkpoint requires explicit authorization and an externally supplied disposable prefunded wallet.
- Reuse a newly funded disposable wallet or the authorized C11 wallet only through the same Docker-secret boundary. Verify unshielded NIGHT, completed DUST registration, and sufficient DUST immediately before submission.
- Schedule risk: the public faucet requires a human-obtained Turnstile token, and this plan does not automate it. Funding and DUST readiness are manual prerequisites, so C19 may remain blocked indefinitely even when C01-C18 are correct.
- Capture the starting finalized block; deploy sink then gateway; submit one gateway call; validate local result/call tree; wait for finality; query exact state/event; run Effectstream from the start block; verify exactly once.
- Update only public/redacted compatibility evidence and mark the integrated template/network result validated; do not silently alter the release matrix fixed at C02.
- Do not store the wallet, secret path, proof data, wholesale `CallResult`, or unrelated stagenet data.

Required Compose test:

```text
RUN_STAGENET_WRITE_TESTS=1 \
docker compose -f templates/midnight-stagenet-v2/compose.yaml \
  --project-name effectstream-midnight-v2-c19-<run-id> \
  --profile live-write run --rm live-write-tests
```

Pass condition: one authorized hosted root transaction satisfies every section 5 assertion and the redacted evidence matches the finalized lock. If authorization/funding is unavailable, this checkpoint is blocked and the issue is not yet complete; do not weaken or bypass it.

Suggested commit: `test(midnight-v2): validate hosted stagenet feature path`

### C20 — run regression gates and register the template

Scope:

- Run affected shared-package suites and the new hermetic template suite.
- Re-run the current `evm-midnight-v2` baseline in the same Docker resource profile and compare against the recorded 24-pass/1-fail baseline.
- Add `midnight-stagenet-v2` to `templates/run-template-tests.ts` only after its hermetic command is deterministic.
- Update CI change detection and add scheduled/manual live-read and trusted live-write jobs. Never expose write secrets to untrusted pull requests.

Required Docker tests:

```text
docker run --rm --network none effectstream/midnight-v2:c20 \
  bun run test:affected
docker compose -f templates/midnight-stagenet-v2/compose.yaml \
  --project-name effectstream-midnight-v2-c20-<run-id> \
  --profile hermetic up --abort-on-container-exit \
  --exit-code-from tests
```

Pass condition: the new suite exits zero, shared v1/API-v3 behavior has no regression, and the old template has no failure beyond the separately recorded frontend heap baseline. A new failure blocks registration.

Suggested commit: `ci(templates): register Midnight stagenet v2 checks`

### C21 — finish reproduction and security documentation

Scope:

- Document Docker-only build/test commands, compatibility refresh, diagnostic port selection, Compose cleanup, prefunded-wallet injection, cost/funding, public disclosure, event retention, prerelease drift, immutable deployment cleanup limitations, and redacted troubleshooting.
- Include the exact source-to-compile-to-deploy dependency order.
- Test the README from a fresh exported source tree using Docker only.

Required test:

```text
docker run --rm --network none effectstream/midnight-v2:c21 \
  bun run test:docs
```

Pass condition: links/commands/config examples validate, the offline walkthrough works from a fresh tree, and documentation contains no local absolute path, credential, or claim of deterministic live-stagenet availability.

Suggested commit: `docs(template): document Midnight v2 reproduction and safety`

## 7. Checkpoint test policy

### 7.1 Test levels

| Level | Environment | Allowed network/state | Used by |
| --- | --- | --- | --- |
| T0 | Disposable Docker container | `--network none`; no external state | C01, C02 fixture test, C03 compiler test, C04-C09, C13-C15, C20 affected-package test, C21 |
| T1 | Unique local Compose project | Private Compose network; disposable local chain/DB state | C03 toolchain smoke, C10, C12, C16, C18, C20 hermetic Compose test |
| T2 | Disposable Docker/Compose client | Read-only outbound registry/stagenet access | C02 image/live preflight, C17 |
| T3 | Secret-gated Compose client | Explicitly authorized stagenet deployment/call | Minimal Keccak gate C11; integrated validation C19 |

### 7.2 Definition of a passing checkpoint

A checkpoint is passable only when:

- its required command returns exit code zero;
- every asserted subtest ran—no caught exception may be converted into a passing summary;
- expected-failure tests check the intended diagnostic;
- logs contain no secrets or privacy-sensitive call/proof values;
- tests use a clean image build, not undeclared host package caches;
- `docker compose down --volumes --remove-orphans` targets the exact project after local-stack tests;
- reserved diagnostic ports are free again;
- `git diff --check` passes; and
- `git status --short` contains only the checkpoint's intended files before commit and is clean after commit.

### 7.3 Port and concurrency policy

- Default automated T0/T1 tests should publish no host ports; their test driver runs inside the container/Compose network.
- If a diagnostic endpoint must be visible, bind it to `127.0.0.1` using environment-substituted ports from a freshly checked contiguous range above 10000.
- The research range `22000-22099` is historical evidence, not a reservation.
- Every Compose invocation uses a unique project name containing the checkpoint and run ID.
- Port preflight checks both host listeners and Docker publications, then aborts before service creation on any conflict.

### 7.4 Compatibility and regression policy

- C02 fixes one complete beta.6/rc.1 lane. Beta.4 remains historical implementation evidence only and is not a recovery lane because it lacks the required local event surface.
- The release matrix is fixed at C02; hosted ZKIR-v3 status changes from unverified to validated only at C11; the full template/network result becomes validated only at C19.
- If C03-C10 fails for a genuine compatibility reason, stop at that checkpoint. Preserve redacted evidence, research a new complete beta.6-compatible release slot, update the whole lock in a dedicated checkpoint, invalidate prior generated artifacts, and rerun from C03.
- If valid locally proven ZKIR-v3 material fails hosted verification at C11, **HARD STOP** for a scope decision. Do not substitute secp256k1, fall back to beta.4, or proceed to CCC integration/application work; both requested crypto candidates require V3.
- If C12-C18 exposes a release incompatibility, follow the same whole-slot recovery rule and rerun from C03 through the failed checkpoint. Never borrow an individual package/compiler/image from another release family.
- If C19 fails, first distinguish hosted drift, funding/DUST readiness, proof verification, CCC binding, indexing/finality, and Effectstream ingestion. Only a proven release incompatibility reopens the complete lock; an application defect returns to its owning checkpoint.
- Suggested recovery commit: `chore(midnight-v2): update coherent compatibility lock`; it must record the reason/evidence and the invalidated artifact hashes.
- API v4 event fields remain opt-in so existing API v3 queries do not change.
- Ledger 8/runtime v3 and Ledger 9/runtime v4 remain in separate packages/processes.
- The new template's default `test` is hermetic and must exit zero.
- Live drift may fail T2/T3 without invalidating historical T0/T1 reproducibility; the report must distinguish code failure from hosted-network drift.
- The current `evm-midnight-v2` frontend heap failure remains a named basal failure. It cannot be hidden, silently accepted as a new template result, or misattributed to this work.

## 8. Acceptance criteria

The issue is complete only when all of the following are true:

- A reviewed compatibility lock identifies one coherent package/compiler/image matrix proven against the then-current hosted stagenet.
- Every locked local-stack image is pullable by digest, has a validated execution platform, and passed the bounded compiler/proof smoke on the target arm64 host or its explicitly accepted amd64 emulation path.
- The old Ledger 8 package/template remains isolated and its behavior does not regress.
- The real Ledger v9/runtime-v4 WASM smoke passes in the pinned Node 22+ worker/runtime; Bun is only the package-manager/task-launcher boundary, and provider construction against fakes alone is insufficient.
- The explicit stagenet profile uses all four requested URLs and supports safe overrides.
- Both contracts compile with one pinned Compact 0.33 toolchain, communications commitments intact, and fail-closed artifact manifests; every circuit that uses new crypto emits ZKIR v3/V7 verifier material.
- The early hosted probe proves that the stagenet accepts a locally generated V3 Keccak proof before CCC/application implementation proceeds.
- One gateway transaction invokes the expected sink, computes the correct Keccak digest, changes sink state, and emits one event from the sink.
- Local `CallResult` event/call data and finalized API v4 indexed data agree.
- Effectstream ingests the event exactly once and drives an observable state-machine result.
- Artifact mismatch/substitution, incompatible schema/version, absent ZKIR-v3 support, and missing live-test authorization all fail safely and clearly.
- Hermetic Docker/Compose tests pass without host runtimes, host package caches, privileged mounts, or fixed shared ports.
- A fresh checkout can follow the README successfully using only Docker/Compose plus explicitly supplied live-test credentials.
- CI runs deterministic tests for trusted and untrusted contributions; external write tests remain manual/scheduled and secret-gated.

## 9. Known decisions and risks

1. **Hosted ZKIR-v3 verification:** local proof success does not establish that the hosted node accepts V3 verifier keys/proofs. C11 tests this before CCC/application work; rejection is a scope stop because secp256k1 also requires V3.
2. **Hosted bundle drift:** the observed endpoint reports node `2.0.0-d9729c13`, while public releases/reference matrices span multiple prereleases. C02 detects drift and fixes the complete beta.6/rc.1 slot rather than inferring compatibility from one version string.
3. **Compiler identity:** the older feature harness builds an rc.2 source tag, but the selected beta.6 slot requires the published rc.1 compiler. Record the rc.1 asset checksum/banner and reject rc.2 artifacts.
4. **WASM singleton/runtime boundary:** Ledger 8/runtime v3 and Ledger 9/runtime v4 cannot share a process. The v2 path runs in an isolated Node 22+ worker/container; Bun only installs/launches it through typed IPC.
5. **CCC artifact binding:** exact interface directory names, compiler manifest hashes, verifier keys, deployment order, and a registry rooted at the full sibling call tree are required. Validate all of them before signing.
6. **Event semantics:** local logs come from `result.public.logEvents`; indexed events arrive after finality and are not ledger state. The indexer's `fromId` is inclusive and WebSocket delivery is at least once, so resume, paging, and composite dedup rules are explicit.
7. **Blocked `Misc` path:** beta.6 skips `Misc` pending a proof-server fix. This lock contains no arbitrary-payload fallback; the single-call fixture uses zero-payload `Unpaused` and documents that repeated calls would emit it again.
8. **Funding readiness:** writes require unshielded NIGHT plus DUST registration/accrual. C11 and C19 can remain blocked by manual Turnstile funding or DUST readiness without implying a code failure.
9. **Shielded CCC risk:** avoid shielded ZSwap operations in the initial callee because the relevant fix postdates the selected compiler.
10. **Public disclosure:** the CCC argument and stored digest are intentionally disclosed. The README and test vectors must make that explicit.
11. **Local image availability/platform:** locked images may be amd64-only or unavailable. C02 proves pullability/digests/platforms, and C03 rejects unusable emulation before contract work.
12. **Shared-host conflicts:** no hard-coded host ports, global Compose project names, broad cleanup, or host execution.
13. **Existing unrelated failure:** the old template's frontend build currently OOMs and causes exit 1. Maintain a transparent comparison rather than weakening success criteria.

## 10. Required implementation-start Git gate

Run these read-only/fast-forward operations from `/Users/edwardalvarado/effectstream-d` before any implementation edit:

```text
git status --porcelain=v1 --untracked-files=all
git fetch --prune origin v-next
git switch v-next
git merge --ff-only origin/v-next
git status --porcelain=v1 --untracked-files=all
git rev-list --left-right --count origin/v-next...HEAD
```

Expected result before implementation: both status outputs empty after excluding or committing this reviewed plan, divergence `0 0`, and the fast-forward succeeds. If any source/untracked artifact is unexpected, if any local-only commit exists, or if fetch/fast-forward fails: **FULL STOP** and report the exact state without modifying, stashing, deleting, committing, or pushing anything.

## 11. Planned verification commands

Exact image tags/digests and Compose profiles will be filled from the compatibility lock. These are workflow shapes, not commands that were run during this planning phase:

```text
docker build --pull=false --progress=plain \
  -f templates/midnight-stagenet-v2/Dockerfile \
  -t effectstream/midnight-stagenet-v2:<commit> .

COMPOSE_PROJECT_NAME=effectstream-midnight-v2-<run-id> \
docker compose -f templates/midnight-stagenet-v2/compose.yaml \
  --profile hermetic up --build --abort-on-container-exit \
  --exit-code-from tests

COMPOSE_PROJECT_NAME=effectstream-midnight-v2-<run-id> \
docker compose -f templates/midnight-stagenet-v2/compose.yaml \
  --profile live-read run --rm live-read-tests

RUN_STAGENET_WRITE_TESTS=1 \
COMPOSE_PROJECT_NAME=effectstream-midnight-v2-<run-id> \
docker compose -f templates/midnight-stagenet-v2/compose.yaml \
  --profile live-write run --rm live-write-tests

COMPOSE_PROJECT_NAME=effectstream-midnight-v2-<run-id> \
docker compose -f templates/midnight-stagenet-v2/compose.yaml \
  down --volumes --remove-orphans
```

Before each `up`/`run`, populate the template's individual host-port variables from a newly verified contiguous range above 10000. Do not reuse `22000-22099` without checking it again.

## 12. Deliverables

- isolated `midnight-stagenet-v2` template;
- two Compact contracts and generated-artifact verification;
- pinned v2 provider/deployment package or equivalent isolated adapter;
- explicit stagenet network profile;
- API v4 event client/types and `Midnight:ContractEvent` primitive;
- compatibility lock and evidence report;
- Dockerfile, per-Dockerfile `Dockerfile.dockerignore` root-context allowlist, Compose profiles, port preflight, and safe cleanup;
- hermetic/unit/integration tests plus read-only and opt-in live canaries;
- README covering operation, funding, disclosure, drift, troubleshooting, and security;
- CI/template registry updates after deterministic success.
