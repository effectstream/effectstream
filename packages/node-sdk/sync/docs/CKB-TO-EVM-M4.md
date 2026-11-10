# CKB-to-EVM relay demonstration (Milestone 4)

## Flow and trust boundary

The E2E starts with the existing `CkbFetcher` and a deterministic JSON-RPC fixture implementing the same CKB block response shape used by its fetch path. The connector observer creates a `ckb-cell-created:v1` event; the fetcher maps it to a native primitive; the relay normalizer encodes the event as a versioned payload; and viem submits it to `CkbEventRelay` on the repository's local Hardhat chain. The adapter waits for a successful receipt, checks the target contract and `SourceEventAccepted` event, then reads the stored payload hash. The test logs the source event ID, payload hash, contract address, destination transaction hash, receipt status, and resulting state.

The contract authorizes one relayer address at construction. The authenticated action is the EVM transaction from that address; the contract computes a deterministic payload hash that includes schema version, destination chain ID, destination contract address, source network ID, source height and hash, source event ID, transaction hash, output index, and event-data hash. The automated E2E uses a fixed `http://127.0.0.1:8545` endpoint and requires chain ID `31337`; it ignores `EFFECTSTREAM_EVM_RPC_URL`, `EFFECTSTREAM_EVM_CHAIN_ID`, and `EFFECTSTREAM_EVM_PRIVATE_KEY`. It validates the parsed RPC URL as loopback and checks the chain ID before any relay submission. The configurable `createRelayClients()` adapter is for deliberate non-E2E callers: remote destinations are rejected unless `EFFECTSTREAM_EVM_ALLOW_REMOTE=true` is explicitly set. That opt-in permits live-capable transaction submission and requires the caller to independently validate the destination, signer authorization, funding, and deployment. It is not a production safety policy. The adapter does not retry an ambiguous write. Callers can safely retry by checking destination state; exact duplicates are recognized and conflicting reuse of an event ID fails.

This proves only that the configured source adapter observed the fixture event, that the relayer submitted a transaction, and that the authorized signer was accepted by the contract which stored that payload. A relayer signature/transaction is not proof of CKB consensus. The contract does not verify CKB headers, proofs, or canonicality. This is a trusted-relayer demonstration, not a trustless bridge or atomic cross-chain execution.

## Reproduction

The E2E is part of the existing local EVM runner, which manages its Hardhat chain and deploys contracts. From the repository root, run:

```sh
bun run e2e/runner.ts evm
```

Hardhat's EVM E2E chain must remain local and use chain ID `31337`. The relay test's destination is fixed in code and cannot be changed by EVM RPC, chain ID, or private key environment overrides. The test validates loopback address forms (`localhost`, `127.0.0.1`, and `::1`) with URL parsing and fails closed before submission if destination conditions are invalid.

The EVM suite includes Solidity compilation/deployment, a fixture-to-contract relay, a receipt and stored-state check, exact duplicate protection, malformed input rejection, unauthorized signer rejection, and chain-ID mismatch rejection. It uses no public CKB or EVM RPC. The local chain's deterministic account is used only by the existing local test harness.

Expected structured evidence includes `sourceEventId`, `payloadHash`, `destinationContract`, `destinationTransactionHash`, `receiptStatus: "success"`, and `storedPayloadHash`. Contract deployment appears in Hardhat Ignition's chain 31337 deployment record.

## Verification run

On 2026-10-26 the following local checks were run from the repository root; both exited 0. The EVM runner requires Foundry (`forge`) to be installed and available on `PATH`; these commands do not install Foundry:

```sh
(cd e2e/shared/contracts/evm && bun run build:hardhat)
E2E_MAX_RETRIES=0 bun run e2e/runner.ts evm
```

The Hardhat build compiled six Solidity files with solc 0.8.30. The EVM runner compiled with both Hardhat and Foundry, deployed the destination to `0x5FC8d32690cc91D4c39d9d3abcBD16989F875707` on local chain 31337, and passed 47 assertions (0 failed, 0 skipped). The relay test's accepted event was `ckb-cell-created:3477937c73af9be5067ad3619486c64cabad3a06380cab07dbb89848212fa632`, with payload hash `0xf57b635ea119c2d1235ce520ed30f46c49cf5252e5bab6f43dbd981ccdb1b5d7`, transaction `0xaedd94fb7e0c04ee38487c82004322f0cab3f57fc099af963a929c1719dc1f46`, receipt `success`, and matching stored payload hash. The E2E also verified exact duplicate handling, duplicate contract rejection, malformed input rejection, failed invalid write with unchanged state, unauthorized signer rejection, and chain-ID mismatch rejection. The EVM runner uses its local PGlite, Hardhat, sync, and batcher processes and shut them down at completion.

## Limitations and reorganization behavior

The fixture mode makes the source deterministic and exercises the real native fetcher code, but it is not a live CKB RPC observation. It demonstrates the connector/fetcher-to-relay path with controlled source input. The separate live OffCKB-to-local-EVM run and its evidence are recorded in the Milestone 4A section below.

A CKB event can be relayed before a later source reorganization is detected. Destination duplicate protection prevents repeated acceptance of the same stable source event ID; it cannot reverse an already accepted transaction. There is no compensating transaction policy. Database rebuild or source replay cannot undo external EVM effects. Canonical CKB fork recovery remains unsupported, and application-specific replay/deduplication requirements remain unresolved. No cross-chain atomicity is provided.

## Milestone 4A: transactional outbox, regression repair, and live verification

EffectStream inserts `effectstream.ckb_evm_relay_outbox` from the production `processFinalizedBlock` path in the same database transaction as primitive accounting, application state, root records, and the CKB resume page. PostgreSQL uniqueness is `(event_id, destination_chain_id, destination_contract)`. The fixture E2E exercises this production path and verifies duplicate processing and rollback.

The worker claims work with `FOR UPDATE SKIP LOCKED`, commits its lease before EVM I/O, and persists attempts, state, transaction and payload hashes, receipt status/block, timestamps, and errors. It uses bounded capped retry (five attempts). A restarted worker recovers an expired submitted lease by checking destination state and acceptance logs before any resubmission. Real PostgreSQL tests cover lease expiry, restart after persisted submission without a second submit, retry exhaustion, and reverted receipt handling. These checks prove at-least-once delivery with contract-level logical deduplication; they do not provide cross-chain exactly-once execution. Exhausted rows remain `failed` and require operator review before requeue.

Payload hashing sorts JSON object keys recursively because PostgreSQL `JSONB` does not preserve insertion order. The E2E compares the expected hash, persisted hash, receipt, and contract state.

The automated destination is fixed to `http://127.0.0.1:8545` and chain ID `31337`; RPC, chain, and private-key environment overrides cannot redirect the automated client. The fixed Hardhat relayer is account 2 (`0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`), separate from account 0 used concurrently by the existing sync tests. This prevents nonce contention. Configurable non-E2E callers still require explicit remote opt-in and their own destination, signer, funding, and deployment review.

### Verification on 2026-10-26

- Baseline copy at `e5e9c0e` passed the original EVM runner with 39 passed, 0 failed, 0 skipped, including the bad-signature assertion. This established that the original failure was test-state leakage caused by CKB accounting being written while the assertion compared a DB-wide count against a test-only in-memory counter. The assertion now snapshots the actual DB count immediately before the invalid request and checks it remains unchanged.
- Full live EVM runner: 53 passed, 0 failed, 0 skipped. Connector suite: 25 passed. Focused CKB config/fetcher suite: 6 passed. DB asset check and connector format check passed.
- Real PostgreSQL 16.15: `ckb-fork-fail-closed.test.ts` and `ckb-relay-outbox-postgres.test.ts` passed (2 tests, 29 assertions). The real database verified atomic commit/rollback, duplicate logical intent, lease expiry, worker restart recovery, five-attempt terminal failure, and truthful reverted receipt state. The fork test confirms changed retained history fails closed without partial DB writes; automatic canonical fork recovery is unsupported.
- Example PostgreSQL command (the package binaries and data were isolated under `/tmp`):

  ```sh
  PG16_ROOT=/path/to/extracted/postgresql/rootfs
  PGLITE=false REPRO_PG_BINDIR="$PG16_ROOT/usr/lib/postgresql/16/bin" \
    LD_LIBRARY_PATH="$PG16_ROOT/usr/lib/x86_64-linux-gnu" \
    bun test packages/node-sdk/runtime/test/reproduction/ckb-fork-fail-closed.test.ts \
      packages/node-sdk/runtime/test/reproduction/ckb-relay-outbox-postgres.test.ts
  ```

### Live OffCKB-to-local-EVM evidence

The disposable OffCKB 0.4.13 devnet ran CKB 0.208.0 with genesis `0xb15fa8a50781f3a8bf84759682e2ce4027b7ae5361df45e8b68855ee413104be`. Before source submission, its RPC was responsive and the local Hardhat endpoint reported chain ID `31337`. A disposable account-0 key submitted transaction `0x7331bf4e510c8b0f11a7b0c4508138e81cf576f014056ad512868a884386cca4`, included at source block 16 (`0xdbf3d420fd251dc13da98ed45c4fdc43bd36b039146b0e50851f25a926b90356`). The CKB connector observed and EffectStream processed the matching cell event, then the worker automatically relayed its outbox intent:

| Evidence | Value |
| --- | --- |
| Source event | `ckb-cell-created:db3a47e1ba3783037e97b95aca2190a67c72c89dee92ded1f003d7e06d060aa0` |
| Outbox key | `(source event ID, 31337, 0x5FC8d32690cc91D4c39d9d3abcBD16989F875707)` |
| Final outbox state | `confirmed` |
| Destination contract | `0x5FC8d32690cc91D4c39d9d3abcBD16989F875707` |
| Destination transaction | `0x1b8308b4ba813d3c0fb38231348c4b87fc117d3ebd5921bf13df756554a009b8` |
| Receipt | `success`, block 91 |
| Contract stored payload hash | `0x98d8cbed2099af1034f1830a85d8a3aad800d0bfee02cf6c6270e4bd1541fa46` |
| Persisted payload hash | `0x98d8cbed2099af1034f1830a85d8a3aad800d0bfee02cf6c6270e4bd1541fa46` |

The live event confirmation and contract hash matched. The suite also checked that confirmed work is not submitted again, and the separate real-PostgreSQL restart test recovered persisted submission state without a second submit. The live run is a trusted-relayer demonstration; the relay does not prove CKB consensus or verify CKB headers/proofs. An already accepted EVM transaction cannot be undone by a later CKB reorganization. No cursor rewind, compensating EVM action, or atomic cross-chain rollback is implemented. The isolated OffCKB daemon was stopped after verification.

The dashboard remains outside this milestone. It can later display outbox state, attempts, transaction/receipt evidence, and reviewed failed-row recovery actions.
