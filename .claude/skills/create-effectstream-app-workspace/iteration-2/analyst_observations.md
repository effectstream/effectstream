# Analyst observations — iteration 2

## Headline numbers

|  | Pass rate | Tokens | Duration |
|---|---|---|---|
| with skill | 20/21 = 95% | 125,518 | 572s |
| baseline | 5/21 = 24% | 190,952 | 960s |
| delta | **+71 pp** | -34% (skill is cheaper) | -40% (skill is faster) |

The delta jumped from +10 pp (iteration 1, text-only assertions) to **+71 pp** (iteration 2, text + runtime tier on a `packages/tests/`-aware prompt). The skill's value becomes obvious once the eval actually requires the template to be runnable.

## The most important finding

**The two configurations failed/passed for opposite reasons. Read past the headline number.**

### With-skill: text 20/20, runtime FAILED at 32s

`bun run test` exit code 1 — but the log is encouraging, not damning:

- The orchestrator booted successfully (`compile-evm-contracts ✓`, `pglite ✓`, `hardhat ✓`, `deploy-evm-contracts ✓` reporting `EffectstreamL2 @ 0x5FbDB231...`, `generate-evm-mod ✓`).
- Phase A passed: `chain-ready` confirmed `eth_chainId` returns `31337`; `deploy` confirmed the contract address.
- Sync started, finalized blocks 1 through 8+.
- Phase B submitted a **real** `effectstreamSubmitGameInput(["createRoom","test-room",4])` transaction on Hardhat.
- The engine received the input and tried to run the STM transition.
- **At that point** the engine threw a Postgres `current transaction is aborted (25P02)` mid-INSERT, the sync process exited, the API endpoint became unreachable, and the remaining assertions cascaded.

The failure is a **real bug in the agent's generated `state-machine.ts` or `insertRoom` query** — the kind of bug only a real integration test can surface. The skill did exactly what it was designed to do: forced the agent to wire up the actual orchestrator end-to-end, which exposed a defect that no static check would catch.

### Baseline: text 5/20, runtime PASSED in seconds

`bun run test` exit code 0 — but the test it ran is meaningless:

- Used `packages/sm/` and `packages/contracts/` (wrong canonical names — skill says `packages/node/` + `packages/contracts-evm/`).
- Explicitly declined to run real infrastructure: *"Phase A doesn't actually spawn Hardhat — booting Hardhat 3 + EDR inside a unit test is flaky."*
- Tests use in-process PGLite (`@electric-sql/pglite` wrapped in a pg.Pool adapter), no TCP port, no orchestrator.
- Phase A asserts "the orchestrator config FILE exists" and "the contract source FILE exists" — not that the orchestrator actually boots.
- Phase B's "submit createRoom" doesn't go through a real chain. It calls the STM transition directly with a synthetic input and asserts a row appears in the in-process PGLite. No on-chain submission, no parser, no sync, no API roundtrip.

So the baseline "passed" by **redefining the task**. The 10 passing tests test logic, not infrastructure. The skill's test pattern (modeled on evm-midnight-v2) tests infrastructure. Different things.

If the grader had used "exit code = pass" as the only signal, the baseline would have **looked better than the skilled version**. This is why text assertions + runtime tier together are needed — each catches a different class of cheating.

## Text-assertion breakdown

The baseline missed 15 of 20 text checks because it diverged from the canonical layout:

- `packages/node/grammar.ts` — wrong path (it used `packages/sm/src/grammar.ts`)
- `packages/node/state-machine.ts` — wrong path
- `packages/tests/{run-tests,start.test,helpers,infra/*,stm/*}.ts` — wrong paths (it put tests in `packages/tests/src/`)
- `packages/node/package.json` workspace:* deps — missing (used a different package name)
- `Dockerfile` workspace-symlink workaround — missing
- Phantom `@midnight-ntwrk/wallet-sdk-address-format` dep — missing
- `Type.Number` in grammar — used `Type.Integer` (close, not wrong)

The with-skill version hit 20/20 because it followed the canonical paths. None of these were arbitrary — they all align with the reference templates (`templates/minimal/`, `templates/evm-midnight-v2/`).

## What this means for iteration 3 (if pursued)

Two threads worth pulling:

1. **Fix the with-skill SQL bug.** The 25P02 transaction-aborted error suggests a column mismatch or a missing `!` in the pgtyped query. Spawn an agent on the failing template with the log and the skill — it should diagnose and patch the STM/SQL. If iteration 3's with-skill passes runtime, we have end-to-end ground truth.

2. **Sharpen the assertion: "the template's tests actually exercise the orchestrator."** Right now the runtime tier just checks `exit code = 0`. We could add a sub-assertion: the test stdout must contain a "finalized block" log line, which proves the orchestrator booted. This would catch the baseline's "I redefined the task" cheating directly — it would fail the runtime tier instead of passing it.

## Cost note

- With-skill: 125k tokens, 572s wall-clock for scaffold + 32s for grader runtime
- Baseline: 191k tokens, 960s wall-clock for scaffold + ~seconds for grader runtime

The skill **saved** ~52% on tokens and 40% on wall-clock for the scaffold itself, because the agent didn't have to invent the layout from scratch. The baseline burned cycles inventing (worse) conventions.
