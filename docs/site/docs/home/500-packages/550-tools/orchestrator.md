---
title: "@effectstream/orchestrator"
description: "Multi-chain local development environment for EffectStream"
sidebar_label: "orchestrator"
---

{/* Generated from packages/build-tools/orchestrator/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. */}

> Package: **[`@effectstream/orchestrator`](https://www.npmjs.com/package/@effectstream/orchestrator)** · [Source](https://github.com/PaimaStudios/paima-engine/tree/main/packages/build-tools/orchestrator)

A multi-chain local development environment for EffectStream. One CLI
starts every dependency a template needs — Postgres / PgLite, Hardhat,
contracts, Bitcoin Core, Midnight node + indexer + proof server,
Cardano-side services, Avail node + light client, NEAR sandbox,
Celestia, plus the EffectStream sync + runtime + batcher — in the right
order, with health checks.

## Install

```bash
bun add @effectstream/orchestrator
# or
npm install @effectstream/orchestrator
```

## Standalone usage

The orchestrator is mostly invoked as a CLI from a template's repo
root:

```bash
# Start every process defined in orchestrator.config.ts (or .json)
bun packages/build-tools/orchestrator/src/cli.ts start

# Show what's running and the health of each
bun packages/build-tools/orchestrator/src/cli.ts status

# Stop everything
bun packages/build-tools/orchestrator/src/cli.ts stop
```

Each process is declared in an `OrchestratorConfig` object: its command,
working directory, environment, the ports/endpoints to watch for
readiness, and which other processes it depends on. Then the
orchestrator builds the dependency graph and runs them in parallel where
possible.

```typescript
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";

export const config: OrchestratorConfig = {
  processes: [
    {
      name: "pglite",
      command: ["bun", "run", "@effectstream/db/start-pglite"],
      readiness: { tcp: { port: 5432 } },
    },
    {
      name: "hardhat",
      command: ["bun", "run", "hardhat", "node"],
      readiness: { http: { url: "http://127.0.0.1:8545" } },
    },
    {
      name: "deploy-contracts",
      command: ["bun", "scripts/deploy.ts"],
      dependsOn: ["hardhat"],
    },
    // …
  ],
};
```

Common chain launchers ship as subpath scripts you can compose: `./launch-pglite`,
`./launch-evm`, `./launch-bitcoin`, `./launch-cardano`, `./launch-midnight`,
`./launch-avail`, `./launch-near`. Each wraps a pinned binary from
`@effectstream/binaries/*` with sensible defaults.

> **Tip:** Disable chains you don't need with env vars: `DISABLE_EVM=true`,
> `DISABLE_BITCOIN=true`, `DISABLE_MIDNIGHT=true`, etc. Same flags work for
> the orchestrator and `e2e/runner.ts`.

## CLI reference

```
orchestrator start   [config]    Start processes (daemonised, exposes HTTP API)
orchestrator status              Show process status
orchestrator restart <name>      Restart a named process
orchestrator stop    [name]      Stop a named process, or all
orchestrator list    [config]    List processes without starting
orchestrator silence <name...>   Suppress terminal output for named processes
orchestrator unsilence <name...> Resume terminal output
orchestrator logs   [name...]    Follow background daemon log files

Global flags:
  --port <n>        Orchestrator API port (default: 4747)
```

## Inside EffectStream

Every template under
[`templates/`](https://github.com/PaimaStudios/paima-engine/tree/main/templates)
defines an `orchestrator.config.ts` (or `.json`) and starts dev with one
command. The E2E runner at
[`e2e/runner.ts`](https://github.com/PaimaStudios/paima-engine/blob/main/e2e/runner.ts)
is the same machinery, serialised across nine chain suites.

## Key subpath exports

- `@effectstream/orchestrator/config` — `OrchestratorConfig`, `ProcessConfig` types.
- `@effectstream/orchestrator/resolve-package` — resolve a package's bin to an absolute path (used by launcher scripts).
- `@effectstream/orchestrator/launch-pglite`, `./launch-evm`, `./launch-bitcoin`, `./launch-cardano`, `./launch-midnight`, `./launch-avail`, `./launch-near` — opinionated launcher scripts for each chain.
- `@effectstream/orchestrator/wait-tcp`, `./wait-http` — readiness-check helpers.

## Examples

- Templates: every directory under [`templates/`](https://github.com/PaimaStudios/paima-engine/tree/main/templates) ships a working orchestrator config.
- E2E: [`e2e/`](https://github.com/PaimaStudios/paima-engine/tree/main/e2e) drives the orchestrator under the hood.

Runnable: [`test/examples.test.ts`](https://github.com/PaimaStudios/paima-engine/blob/main/packages/build-tools/orchestrator/test/examples.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/tools/orchestrator
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/build-tools/orchestrator
