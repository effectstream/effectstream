# Baseline summary (without skill) — minimal EVM template

26 files written under /tmp/eval-runs/iter-1/eval-new-evm-minimal/without/template/.

**Highlights claimed by agent:**
- Root package.json with `workspaces`, `effectstream.default`, hardcoded `pgtyped:update`, `build:evm`, etc.
- start.dev.ts uses `dependsOn: [DbNames.PGLITE_WAIT, EvmNames.GENERATE_MOD]` to gate sync after deploy.
- Solidity contract extends EffectstreamL2Contract.
- Dockerfile installs Node + Bun + Foundry; bakes `mod.ts`.

**Things agent was unsure about:**
- Package versions left as `<latest>`.
- Hand-wrote pgtyped `locs` byte offsets in `queries.queries.ts` (should regenerate via `bun run build:pgtypes`).
- Solidity pragma `^0.8.20` vs `solidityVersion: "0.8.30"` in hardhat config.

**Important caveat**: Agent explicitly says "Patterns followed from `templates/minimal/`" — copied patterns from the host monorepo's reference template. This biases the baseline up.

Will be interesting to compare against with_skill since both have access to the same host repo but only with_skill knows the consolidated checklist.
