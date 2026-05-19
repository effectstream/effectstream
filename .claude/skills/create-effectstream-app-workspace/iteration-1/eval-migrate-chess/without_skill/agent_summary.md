# Baseline summary (without skill) — migration plan (chess)

40.8 KB plan at /tmp/eval-runs/iter-1/eval-migrate-chess/without/migration-plan.md.

12 phases, 58 numbered steps.

## ⚠️ Critical caveat: BASELINE CONTAMINATION

The baseline agent's own report says:
> "Based on the canonical `templates/chess-v2/` reference in this repo **plus the existing migration guidance in `.claude/skills/create-effectstream-app/references/{migration,docker}.md`**"

**The baseline read the skill files** even though it wasn't told to. Working directory access let it discover `.claude/skills/create-effectstream-app/` and use it as reference.

Same pattern observed in the other baselines:
- Eval 0 baseline: "Patterns followed from `templates/minimal/`"
- Eval 1 baseline: "the closest working template" (referenced multiple times)
- Eval 2 baseline: explicitly read the skill's own references

The "no-skill" baselines are therefore really "model + full host-repo access (incl. the skill files)". The delta between with-skill and baseline will be smaller than it should be.

To get a clean baseline, the eval would need to be re-run with the agent's cwd outside the project repo. Flag this in the analyst pass.

## Gotchas the agent flagged (subset)

- Workspace symlink shim in Docker.
- `resolveFrom` vs `cwd` for `launchEvm` (works locally, breaks Docker).
- `bunx <pkg>/<subpath>` fails for symlinked packages.
- Remove `[PreparedQuery, params]` tuple pattern.
- Executor abstraction deleted not moved.
- Scheduled inputs are full STM transitions (single-letter keys).
- `Stm<typeof grammar, {}>` has two type slots.
- `paimaL2Grammar:` key kept old name.

## Open assumptions

- Exact `0.100.x` patch version (used `0.100.12`).
- Frontend client internals.
- Whether legacy chess shipped `chess-ai.ts`.
- Migration squash vs preserve.
- `build:pgtypes` chicken-and-egg.
