# With-skill summary — minimal EVM template

24 files at /tmp/eval-runs/iter-1/eval-new-evm-minimal/with/template/.

## Files

- Root: package.json, start.dev.ts, Dockerfile, .dockerignore, README.md
- packages/contracts-evm/: Hardhat config, Foundry config, ignition module, MyEffectstreamL2.sol extending EffectstreamL2Contract, deploy.ts, full launchEvm script set
- packages/database/: 000-init.sql (rooms table), pgtyped queries.sql (insertRoom, getRoomByName, getAllRooms), committed queries.queries.ts, migration-order.ts, mod.ts, pgtypedconfig.json
- packages/node/: grammar.ts (createRoom Typebox), state-machine.ts (Stm + insertRoom via World.resolve), config.dev.ts (NTP + Hardhat + EVM_RPC_PARALLEL), api.ts (GET /rooms, GET /rooms/:name), main.dev.ts

## Gotchas handled (from the skill)

- No `workspace:*` in sibling deps.
- `cwd` not `resolveFrom` for `launchEvm`.
- Docker workspace-symlink workaround.
- Foundry + pre-cached solc 0.8.30 in Docker.
- Phantom `@midnight-ntwrk/wallet-sdk-address-format` dep at root.
- Committed `queries.queries.ts` for sibling resolution.

## Open

- `@effectstream/*` versions left as `<latest>` per constraints.
- Skill-vs-existing-templates conflict on `workspace:*` (skill says no, some old templates have it).
- `build:hardhat` doesn't chain `build:forge` — flagged in skill, agent chose minimal.
