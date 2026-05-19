# With-skill summary — migration plan (chess)

Plan: /tmp/eval-runs/iter-1/eval-migrate-chess/with/migration-plan.md.

17 ordered phases with verification gates. Highlights of gotchas the plan calls out:

- `workspace:*` must be removed (Bun resolves siblings by name).
- Phantom dep `@midnight-ntwrk/wallet-sdk-address-format@3.1.0` on every template (even EVM-only chess).
- `{ cwd }` not `{ resolveFrom }` in `start.dev.ts` launchers.
- Dockerfile must manually create workspace symlinks on Linux.
- Batcher `namespace` must equal frontend `appName`.
- `createScheduledData` signature changed (v1 `(string, blockHeight)` → v2 object).
- `VITE_IS_BUN=true` for frontend BlockWatcher fallback.
- pgtyped silently emits empty `.queries.ts` from wrong cwd.

Net-new files: appendix tables. Verification: 7 gates including docker build + docker run tests.

**Open assumptions agent flagged:**
- Exact module names in legacy chess (worked from user's stated layout).
- Whether chess needs custom Primitive or `PrimitiveTypeEVMEffectstreamL2`.
- Whether to add `packages/shared/` for app-events.
- Migrations: combine into single `000-init.sql` vs preserve.
- `chess.js` assumption.
