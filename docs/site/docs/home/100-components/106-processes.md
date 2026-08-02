# Process Orchestrator

Developing a multi-chain dApp is complex. It often requires running multiple local blockchains, indexers, deploying contracts, and managing various services simultaneously. Doing this manually is tedious, error-prone, and slows down development.

The **Process Orchestrator** is a tool built into EffectStream that solves this problem. It automates the setup of your entire local development environment. When you run `bun run dev` in the `/templates/evm-midnight-v2/` example, the orchestrator reads a configuration file (`start.dev.ts`) and launches all the necessary processes — from blockchains and databases to the batcher and frontend server — in dependency order.

Its main goal is to create a complete, "mini-production" environment on your machine, so you can focus on building your dApp, not on managing infrastructure.

### How It Works

The orchestrator is the main entry point for your development environment. When started, it performs the following steps:

1.  **Loads your config**: a TypeScript file that default-exports an `OrchestratorConfig` (conventionally `start.dev.ts`).
2.  **Launches dependencies**: it starts foundational services like local blockchains (EVM, Midnight, etc.) and the development database, respecting the `dependsOn` graph and waiting for processes marked `waitToExit` to finish.
3.  **Deploys contracts**: once the chains are running, it executes your deployment scripts.
4.  **Starts EffectStream services**: it launches services like the batcher and the frontend.
5.  **Starts the Sync Service**: the process conventionally named `sync` runs your node entry point, which loads its own configuration (`config.{env}.ts`) and begins syncing blockchain data and running your state machine.

:::note
The orchestrator logs a warning if your config has no process named `sync`, since that is the process that starts the Effectstream sync engine.
:::

### Where the config lives

The CLI resolves the config file in this order:

1.  An explicit path — `orchestrator start ./start.dev.ts` or `-c, --config <path>`.
2.  The `effectstream.default` field in your `package.json`.
3.  Auto-detection of `orchestrator.config.ts`, `orchestrator.config.js`, or `orchestrator.config.json` in the current directory.

The templates use option 2:

```json
{
  "scripts": {
    "dev": "NODE_ENV=development bunx orchestrator start"
  },
  "effectstream": {
    "default": "start.dev.ts"
  }
}
```

### Configuring the Orchestrator (`start.{env}.ts`)

The config is a plain object with a single required field, `processes` — an ordered array of process definitions. Export it as the module default:

```ts
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";

export default {
  processes: [
    /* ... */
  ],
} satisfies OrchestratorConfig;
```

| Field | Type | Purpose |
| --- | --- | --- |
| `processes` | `ProcessConfig[]` | Ordered list of processes to manage. |
| `apiPort` | `number` (optional) | Port for the orchestrator HTTP API used by `status`/`restart`/`stop`. Defaults to `4747`; override with `--port`. |

#### The `ProcessConfig` shape

| Field | Type | Purpose |
| --- | --- | --- |
| `name` | `string` | Unique name for this process. |
| `args` | `string[]` | Arguments passed to the command. |
| `description` | `string` | Human-readable description, shown in `status` output. |
| `command` | `string` | Executable to run. Defaults to `"bun"`. |
| `dependsOn` | `string[]` | Names of processes that must complete/start before this one. |
| `stopProcessAtPort` | `number[]` | Ports freed (killing any occupier) before launch; also used for port-based liveness detection in `status`. |
| `waitToExit` | `boolean` | If `true`, dependents wait for this process to **exit**. If `false` (default), dependents start as soon as it launches. |
| `type` | `"system-dependency" \| "secondary"` | `system-dependency` (default): failure triggers shutdown. `secondary`: failure is logged, orchestrator keeps running. |
| `env` | `Record<string, string>` | Extra environment variables. |
| `cwd` | `string` | Working directory. Defaults to `process.cwd()`. |
| `critical` | `boolean` | If `true` (default), a non-zero exit triggers full shutdown. |
| `link` | `string` | URL shown in `status` output (e.g. a UI endpoint). |
| `autoStart` | `boolean` | If `false`, the process is skipped on a normal `start` and only runs when requested via `--only`. Defaults to `true`. |

#### Built-in chain launchers

Rather than hand-writing the process groups for each chain, import a launcher. Each returns a `ProcessConfig[]` that you spread into `processes`:

```ts
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchEvm, EvmNames } from "@effectstream/orchestrator/launch-evm";
import { launchMidnight, MidnightNames } from "@effectstream/orchestrator/launch-midnight";
import { launchCardano, CardanoNames } from "@effectstream/orchestrator/launch-cardano";
import { launchAvail, AvailNames } from "@effectstream/orchestrator/launch-avail";
import { launchBitcoin, BitcoinNames } from "@effectstream/orchestrator/launch-bitcoin";
import { launchCelestia, CelestiaNames } from "@effectstream/orchestrator/launch-celestia";
import { launchNear, NearNames } from "@effectstream/orchestrator/launch-near";
```

Chain launchers take the workspace package name and a location used to resolve that package's directory:

```ts
launchEvm("@evm-midnight/contracts-evm", { cwd: path.join(root, "packages/contracts-evm") })
```

Each launcher also exports a `*Names` constant with the names of the processes it creates, so you can depend on them without hardcoding strings:

```ts
dependsOn: [DbNames.PGLITE_WAIT, EvmNames.GENERATE_MOD, MidnightNames.CONTRACT_DEPLOY]
```

### Custom Processes

Any process not covered by a launcher is written directly. To run `my-program.js` in `/my-project`:

```ts
{
  name: "my-program",
  waitToExit: false,
  command: "node",
  args: ["my-program.js"],
  cwd: "/my-project",
}
```

### Full Example Walkthrough

This is the `start.dev.ts` from `templates/evm-midnight-v2`, which sets up a complete EVM + Midnight environment:

```ts
import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchEvm, EvmNames } from "@effectstream/orchestrator/launch-evm";
import { launchMidnight, MidnightNames } from "@effectstream/orchestrator/launch-midnight";

const root = import.meta.dirname!;
const midnightDeps = [MidnightNames.CONTRACT_DEPLOY];

export default {
  processes: [
    // Development database
    ...launchPglite(),

    // EVM chain: start Hardhat, wait, compile, deploy, generate bindings
    ...launchEvm("@evm-midnight/contracts-evm", {
      cwd: path.join(root, "packages/contracts-evm"),
    }),

    // Compile the Compact contract before the Midnight stack needs it
    {
      name: "midnight-contract-compile",
      description: "Compile Compact contract",
      cwd: path.join(root, "packages/contracts-midnight/contract-round-value"),
      args: ["run", "compact"],
      waitToExit: true,
      critical: true,
    },

    // Midnight stack, gated on the compile step above
    ...launchMidnight(
      "@evm-midnight/contracts-midnight",
      { cwd: path.join(root, "packages/contracts-midnight") },
      {
        env: { MIDNIGHT_STORAGE_PASSWORD: "YourPasswordMy1!" },
        dependsOn: ["midnight-contract-compile"],
      },
    ),

    // The sync engine — starts once the DB, EVM bindings and Midnight are ready
    {
      name: "sync",
      description: "EVM-Midnight sync node",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [DbNames.PGLITE_WAIT, EvmNames.GENERATE_MOD, ...midnightDeps],
    },

    {
      name: "batcher",
      description: "Transaction batcher (EVM + Midnight)",
      args: ["run", "packages/batcher/batcher.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      link: "http://localhost:3334",
      stopProcessAtPort: [3334],
      dependsOn: [EvmNames.GENERATE_MOD, ...midnightDeps],
    },

    // Build the frontend, then serve it
    {
      name: "frontend-build",
      description: "Build frontend",
      cwd: path.join(root, "packages/frontend"),
      args: ["run", "build"],
      waitToExit: true, // Wait for the build to finish...
      type: "system-dependency",
      critical: true,
      dependsOn: [EvmNames.GENERATE_MOD, ...midnightDeps],
    },
    {
      name: "frontend-server",
      description: "Serve frontend",
      cwd: path.join(root, "packages/frontend"),
      args: ["run", "serve"],
      waitToExit: false, // ...then start the server and let it run.
      type: "system-dependency",
      critical: true,
      link: "http://localhost:10599",
      stopProcessAtPort: [10599],
      dependsOn: ["frontend-build"],
    },
  ],
} satisfies OrchestratorConfig;
```

### Running it

See the [orchestrator package reference](../500-packages/550-tools/orchestrator.md) for the full CLI — commands (`start`, `status`, `logs`, `restart`, `stop`, …) and flags such as `--background`, `--only`, `--except`, and `--serial`.

```bash
bun run dev
```
