# Analyst observations — iteration 1

## Headline

- **With-skill: 100% pass rate** across all 3 evals (57/57 assertions). Zero misses.
- **Baseline: 89.9% ± 13.2%** — passed 51/57. Huge stdev (75–100% range).
- **Delta: +10.1 pp**, but this **understates the skill's value** due to baseline contamination — see below.
- Token cost: with-skill 93k avg vs baseline 67k avg (+40%). Time roughly similar (372s vs 311s).

## ⚠️ Baseline contamination (the most important finding)

All three baseline agents had access to the working directory (`/Users/edwardalvarado/pe-bun/`), which is the Effectstream monorepo itself. Their outputs revealed:

| Eval | Baseline agent's own statement |
|---|---|
| eval-new-evm-minimal | "Patterns followed from `templates/minimal/`" |
| eval-new-multichain | "the closest working template" (referenced multiple times) |
| eval-migrate-chess | "the canonical `templates/chess-v2/` reference in this repo plus the existing migration guidance in `.claude/skills/create-effectstream-app/references/{migration,docker}.md`" |

The migrate-chess baseline **explicitly read the skill files**. This means:

1. The +10.1 pp delta is a *lower bound* on the skill's value. In a clean environment (e.g. an agent with cwd outside the monorepo, no access to existing templates or the skill files), the baseline would score much lower.
2. The eval-new-multichain tie (both 100%) is the most contaminated case — both agents had full reference material. This eval is not actually telling us much about the skill's incremental value.
3. The eval-new-evm-minimal delta (+25 pp) is probably the most honest signal in this iteration — the baseline copied `templates/minimal/` but still missed the phantom dep, `Type.Number`, procps, the symlink workaround, and used `oven/bun:1-ubuntu`.

**Implication for future iterations**: Re-run baselines with the subagent's `cwd` outside the repo, or use a worktree without the `.claude/` and `templates/` dirs, to get an uncontaminated baseline.

## Per-eval observations

### eval-new-evm-minimal (with: 100%, baseline: 75%, delta: +25 pp)

This is the clearest signal. The baseline missed 5 assertions despite cribbing from `templates/minimal/`:
- Phantom Midnight dep (would crash at runtime — easy to miss without explicit guidance)
- `Type.Number` in grammar.ts (substituted a different validator?)
- `procps` system dep in Dockerfile (orchestrator's `kill` won't work without it)
- Workspace-symlink workaround in Dockerfile (template wouldn't run in Docker)
- Used `oven/bun:1-ubuntu` base image (doesn't exist)

The skill's checklist-style "every template needs X" framing demonstrably catches issues the agent misses when learning from examples alone. These are exactly the "I copied from a template but missed the subtle detail" failure modes.

### eval-migrate-chess (with: 100%, baseline: 95%, delta: +5 pp)

Both scored highly. Baseline missed only the phantom Midnight dep mention — same class of bug as eval 0. Migration agents are forced to engage with structural changes, so they naturally cover more ground than a from-scratch agent.

### eval-new-multichain (with: 100%, baseline: 100%, delta: 0)

Tied at perfect — but the baseline used 47k tokens vs with-skill's 96k. The baseline had a strong reference (presumably `templates/evm-midnight-v2/`) and reproduced patterns faithfully. With-skill produced the same content but consulted more references on the way (~2x tokens). For a multichain task, the skill's marginal value drops because patterns are well-documented in the reference templates.

### Possible non-discriminating assertions

Several assertions passed for every run (with and without skill):
- `start_dev_launches_both` (both agents knew to call launchEvm + launchMidnight)
- `batcher_factory_exists`, `batcher_dev_namespace`, `batcher_mainnet_env_validation`
- `dockerfile_compact`, `dockerfile_xz_utils`, `dockerfile_foundry`
- `app_events_registerEvents`, `app_events_NftMinted`

These don't discriminate — they're table stakes for the task and any reasonable agent gets them. Future iterations could prune these and add harder discriminators, e.g. "the actual Solidity import path uses `EffectstreamL2Contract.sol` (not the old `PaimaL2Contract.sol`)" or "the Dockerfile uses `--depth=0` for remappings".

## Recommendations for iteration 2

1. **Run baselines with cwd outside the repo** to get a clean signal. The `Agent` tool supports `isolation: "worktree"` which might also work, but a fresh `/tmp` cwd is simpler.
2. **Drop or harden the multichain eval** — currently it's not discriminating between with-skill and baseline. Either pose it more sharply (e.g. "the previous template was contaminated by an outdated Midnight version pin — fix it") or replace with a different multi-chain combination.
3. **Add discriminator assertions** that target the skill's unique value:
   - Solidity uses `EffectstreamL2Contract.sol` (not `PaimaL2Contract`)
   - Hardhat remappings use `--depth=0`
   - Cardano `launchCardano` filters out `CARDANO_SUBMIT_TX` in dev
   - `MIDNIGHT_STORAGE_PASSWORD` complexity (already in eval 1, could harden)
4. **Add a new eval** — perhaps "the user has a Cardano template that breaks because of `CARDANO_SUBMIT_TX` polluting the DB. Fix the orchestrator config" — exercises a specific gotcha that wouldn't be obvious from copying any single template.

## Bottom line

Even with contaminated baselines, the skill delivers a clear, consistent advantage on the new-template scaffolding case. It eliminates the "I copied 90% of the right pattern but missed the bit that crashes at runtime" failure mode that templates-as-documentation cannot reliably prevent.

For an uncontaminated comparison, expect the baseline to drop sharply — especially on the Midnight version matrix, the phantom dep, and Docker-specific issues that aren't visible in any single reference template.
