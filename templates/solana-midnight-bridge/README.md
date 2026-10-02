# Solana ↔ Midnight Bridge

> A proof-of-concept bridge: SPL tokens locked in a Solana program are minted as shielded tokens on Midnight, and burned back to release them.

**Work in progress.** This template is being built in stages; this README is a placeholder until the
full one (written to `templates/README-FORMAT.md`) lands with the rest of the template.

What works today:

- `packages/contracts-solana`: the native bridge program (`programs/bridge`, committed
  `build/bridge.so`), instruction builders and the shared log parser (`instructions.ts`),
  `scripts/init-local.ts` and `scripts/deploy-devnet.ts`.
- `bun run dev` starts PGLite and a local Solana validator with the bridge preloaded, then runs
  `init-local` (test mint, bridge initialization, 1,000 test tokens for the dev user,
  `deployments/local.json`).
- `bun run test` runs the unit tests and the bridge-program tests on a throwaway validator.

Still to come: the Midnight contract, the sync node and relayer, the CLI, and live mode.

Keys: only `packages/contracts-solana/keypair/bridge-program.json` is committed. It is a
local-only dev key, and every script refuses it on a real cluster. Live keys live in
`~/.config/effectstream-00050/`, never in the repository.
