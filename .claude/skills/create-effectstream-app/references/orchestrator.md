# Orchestrator (`start.dev.ts`)

`start.dev.ts` lives at the project root and declares every process that should run when the user types `bun run dev`. Build this **first** — it determines which contract packages and npm scripts you'll need.

> **See also (concept docs).**
> - Orchestrator processes concept + CLI reference (`start`, `status`, `restart`, `stop`, `list`, `silence/unsilence`, `logs`): `docs/site/docs/home/500-packages/550-tools/orchestrator.md`
> - High-level "what is the process orchestrator": `docs/site/docs/home/100-components/106-processes.md`
> - **`DISABLE_*` env vars** (`DISABLE_EVM`, `DISABLE_MIDNIGHT`, …) are read ONLY by the engine repo's `e2e/runner.ts` to skip test suites — the orchestrator itself does not read them, and templates do not implement them. To skip processes in dev, use `--only` / `--except`.
> - **Daemon mode**: `bunx orchestrator start --background` runs the orchestrator as a detached daemon and exposes the full HTTP API on port 4747. The follow-up commands `status`, `restart <name>`, `logs <name>`, and `stop` all require the daemon to be running first. For interactive use (single terminal, foreground TUI) drop `--background`. README quick-starts should default to foreground; CI / containerized dev rigs should use daemon mode.
> - **Always run `bunx orchestrator stop` before relaunching** or before running tests — clears stale ports from the previous run.

## Minimal example (EVM only)

```ts
import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchEvm, EvmNames } from "@effectstream/orchestrator/launch-evm";

const root = import.meta.dirname!;

export default {
  processes: [
    ...launchPglite(),
    ...launchEvm("@my-template/contracts-evm", { cwd: path.join(root, "packages/contracts-evm") }),

    {
      name: "sync",
      description: "Sync node",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [DbNames.PGLITE_WAIT, EvmNames.GENERATE_MOD],
    },

    // Optional: batcher
    {
      name: "batcher",
      description: "Transaction batcher",
      args: ["run", "packages/batcher/batcher.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      link: "http://localhost:3334",
      stopProcessAtPort: [3334],
      dependsOn: [EvmNames.GENERATE_MOD],
    },

    // Optional: frontend (build then serve)
    {
      name: "frontend-build",
      description: "Build frontend",
      cwd: path.join(root, "packages/frontend"),
      args: ["run", "build"],
      waitToExit: true,
      type: "system-dependency",
      critical: true,
      dependsOn: [EvmNames.GENERATE_MOD],
    },
    {
      name: "frontend-server",
      description: "Serve frontend",
      cwd: path.join(root, "packages/frontend"),
      args: ["run", "serve"],
      waitToExit: false,
      type: "system-dependency",
      link: "http://localhost:10599",
      stopProcessAtPort: [10599],
      dependsOn: ["frontend-build"],
    },
  ],
} satisfies OrchestratorConfig;
```

## Launcher helpers

Each launcher returns a `ProcessConfig[]` and exports named constants for `dependsOn`. Always destructure with `...launchX(...)` because they return arrays.

| Launcher | Import | Names export | Required package scripts |
|---|---|---|---|
| `launchPglite()` | `@effectstream/orchestrator/launch-pglite` | `DbNames` | (none — uses engine's PGLite) |
| `launchEvm(pkg, loc)` | `@effectstream/orchestrator/launch-evm` | `EvmNames` | `chain:start`, `chain:wait`, `build:hardhat`, `build:forge`, `deploy` |
| `launchMidnight(pkg, loc, opts?)` | `@effectstream/orchestrator/launch-midnight` | `MidnightNames` | `midnight-node:{start,wait}`, `midnight-indexer:{start,wait}`, `midnight-proof-server:{start,wait}`, `midnight-contract:deploy` |
| `launchBitcoin(pkg, loc)` | `@effectstream/orchestrator/launch-bitcoin` | `BitcoinNames` | `chain:start`, `chain:wait`, `generate:blocks`, `wait-for-block` |
| `launchCardano(pkg, loc)` | `@effectstream/orchestrator/launch-cardano` | `CardanoNames` | `devkit:start`, `devkit:wait`, `dolos:fill-template`, `dolos:start`, `dolos:wait`, `cardano-submit-tx` |
| `launchNear(pkg, loc)` | `@effectstream/orchestrator/launch-near` | `NearNames` | `chain:start`, `chain:wait` |
| `launchAvail(pkg, loc)` | `@effectstream/orchestrator/launch-avail` | `AvailNames` | `avail-node:start`, `avail-node:wait`, `avail-light-client:deploy`, `avail-light-client:wait` |

(EVM mod generation is not a package script — the launcher runs `@effectstream/evm-hardhat/builder` inline for `EvmNames.GENERATE_MOD`.)

## The `cwd` vs `resolveFrom` rule (critical)

Each launcher accepts a `ResolveLocation` — either `{ resolveFrom: root }` (resolve via `require.resolve` from the given directory) or `{ cwd: "/absolute/path" }` (use a known directory directly).

**Always use `{ cwd }`. Never `{ resolveFrom }`.**

Reason: `resolveFrom` runs `require.resolve` which goes through Bun's `.bun/` cache instead of the workspace root, and fails in Docker because `bun install` doesn't create `node_modules/@my-template/*` symlinks on Linux. `cwd` uses direct filesystem paths and works everywhere.

```ts
const root = import.meta.dirname!;

// WRONG — breaks in Docker, sometimes locally
...launchEvm("@my-template/contracts-evm", { resolveFrom: root }),

// CORRECT
...launchEvm("@my-template/contracts-evm", { cwd: path.join(root, "packages/contracts-evm") }),
...launchCardano("@my-template/contracts-cardano", { cwd: path.join(root, "packages/contracts-cardano") }),
...launchMidnight(
  "@my-template/contracts-midnight",
  { cwd: path.join(root, "packages/contracts-midnight") },
  { env: { MIDNIGHT_STORAGE_PASSWORD: "YourPasswordMy1!" } },
),
```

## `ProcessConfig` fields

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Unique process identifier |
| `description` | `string` | Human-readable label |
| `args` | `string[]` | Command arguments (default command is `bun`) |
| `command` | `string` | Override command (e.g., `"deno"`) |
| `dependsOn` | `string[]` | Process names to wait for |
| `waitToExit` | `boolean` | Wait for process to exit vs just launch |
| `type` | `"system-dependency" \| "secondary"` | Critical vs optional |
| `critical` | `boolean` | Whether failure triggers shutdown |
| `env` | `Record<string, string>` | Environment variables |
| `cwd` | `string` | Working directory |
| `link` | `string` | URL shown in status output |
| `stopProcessAtPort` | `number[]` | Ports to free before launch |
| `autoStart` | `boolean` | Include in normal start |

## Dependency ordering — use the Names constants

```ts
dependsOn: [DbNames.PGLITE_WAIT, EvmNames.GENERATE_MOD, MidnightNames.CONTRACT_DEPLOY]
```

Never hard-code process name strings — the constants protect you when launcher internals change.

## Multi-chain example (EVM + Midnight)

```ts
import path from "node:path";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchEvm, EvmNames } from "@effectstream/orchestrator/launch-evm";
import { launchMidnight, MidnightNames } from "@effectstream/orchestrator/launch-midnight";

const root = import.meta.dirname!;

export default {
  processes: [
    ...launchPglite(),
    ...launchEvm("@my-template/contracts-evm", { cwd: path.join(root, "packages/contracts-evm") }),
    ...launchMidnight(
      "@my-template/contracts-midnight",
      { cwd: path.join(root, "packages/contracts-midnight") },
      { env: { MIDNIGHT_STORAGE_PASSWORD: "YourPasswordMy1!" } },
    ),

    {
      name: "sync",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [
        DbNames.PGLITE_WAIT,
        EvmNames.GENERATE_MOD,
        MidnightNames.CONTRACT_DEPLOY,
      ],
    },
  ],
};
```

## Cardano: filter out `CARDANO_SUBMIT_TX` in dev

`launchCardano()` always emits a `CARDANO_SUBMIT_TX` process that submits an initial stake-pool delegation. In dev mode with a frontend-driven faucet, this creates phantom delegation events in the DB. Filter it out:

```ts
...launchCardano("@my-template/contracts-cardano", {
  cwd: path.join(root, "packages/contracts-cardano"),
}).filter((p) => p.name !== CardanoNames.CARDANO_SUBMIT_TX),

{
  name: "sync",
  dependsOn: [
    DbNames.PGLITE_WAIT,
    EvmNames.GENERATE_MOD,
    // CardanoNames.CARDANO_SUBMIT_TX,  // removed in dev
    CardanoNames.DOLOS_MINIBF_WAIT,
  ],
},
```

Keep `CARDANO_SUBMIT_TX` in `start.test.ts` if tests need pre-funded delegation.

## How `bun run dev` invokes this

```json
"dev": "NODE_ENV=development bunx orchestrator start"
```

The CLI reads `package.json`'s `effectstream.default` to find the start file. To target a different file ad-hoc: `bunx orchestrator start start.test.ts`.

### CLI flags that matter for scaffolded apps

- `-c, --config <path>` — explicit config file (otherwise auto-detected from daemon state, `package.json`, or `orchestrator.config.ts`)
- `-b, --background` — detached daemon; logs to `.orchestrator-logs/`, HTTP API on `-p, --port` (default 4747)
- `-o, --only <p1,p2,...>` — run only these processes plus their dependencies. This is also how `autoStart: false` processes get run — they're skipped on a normal `start` and only launch when named via `--only`
- `-e, --except <p1,p2,...>` — skip these processes
- `-s, --serial` — launch one at a time instead of in parallel waves

`bunx orchestrator start hardhat deploy-evm-contracts` (positional names) also starts a subset.

Mainnet does **not** use the orchestrator (no local infra to manage):
```json
"start:mainnet": "bun run packages/node/main.mainnet.ts"
```
