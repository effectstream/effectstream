# @effectstream/orchestrator

A multi-chain local development environment for EffectStream. One CLI
starts every dependency a template needs - Postgres / PgLite, Hardhat,
contracts, Bitcoin Core, Midnight node + indexer + proof server,
Cardano-side services, Avail node + light client, NEAR sandbox,
Celestia, plus the EffectStream sync + runtime + batcher - in the right
order, with health checks.

- One CLI that starts every dependency a template needs: DB, chains, sync, runtime, batcher.
- Dependency-graph aware: runs in parallel where it can, sequential where it must.
- Disable any chain with `DISABLE_EVM=true`, `DISABLE_BITCOIN=true`, ...
- Used by every template in this repo and by the E2E runner.

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
`./launch-avail`, `./launch-near`. Each wraps a pinned binary from a
package under `packages/binaries/` (e.g. `@effectstream/npm-midnight-node`,
`@effectstream/bitcoin-core`, `@effectstream/near-sandbox`) with sensible
defaults.

> **Tip:** Disable chains you don't need with env vars: `DISABLE_EVM=true`,
> `DISABLE_BITCOIN=true`, `DISABLE_MIDNIGHT=true`, etc. Same flags work for
> the orchestrator and `e2e/runner.ts`.

## CLI reference

```
orchestrator start   [config|name...]  Start all processes, or specific ones by name
orchestrator status                    Show process status
orchestrator restart <name>            Restart a named process
orchestrator stop    [name]            Stop a named process, or all
orchestrator list    [config]          List processes without starting
orchestrator silence [name...]         Suppress terminal output (no args = show list)
orchestrator unsilence <name...>       Resume terminal output
orchestrator logs   [name...]          Follow background daemon log files (like tail -f)
```

**Global options**

| Flag | Description |
| --- | --- |
| `-c, --config <path>` | Config file. Auto-detected from the daemon, `package.json`'s `effectstream.default`, or `orchestrator.config.ts` when omitted. |
| `-h, --help` | Print help. |

**Options for `start`**

| Flag | Description |
| --- | --- |
| `-b, --background` | Run as a detached background daemon; logs go to files. Required before `status`, `logs` and `restart` can talk to a daemon. |
| `-p, --port <n>` | Orchestrator API port (default: `4747`). |
| `-o, --only <p1,p2,…>` | Run only these processes, plus their dependencies. |
| `-e, --except <p1,p2,…>` | Skip these processes. |
| `-s, --serial` | Launch processes one at a time instead of in parallel waves. |
| `--no-deps` | Launch only the named processes, skipping dependency resolution. |
| `--log-dir <path>` | Log directory when using `-b` (default: `.orchestrator-logs`). |
| `--no-api` | Disable the HTTP API server. |
| `--silence <p1,p2,…>` | Suppress terminal output for these processes. |

**Options for `status`**

| Flag | Description |
| --- | --- |
| `-f, --follow` | Continuously refresh the status table, at a 1s interval. |

**Examples**

```bash
orchestrator start hardhat deploy-evm-contracts
orchestrator start --only=midnight-node,midnight-indexer
orchestrator start --except=avail-client
orchestrator start --silence=midnight-node,bitcoin-core
orchestrator restart midnight-node
orchestrator stop batcher
```

## Port ownership and safe cleanup

`stopProcessAtPort` is a conflict/readiness declaration, not permission to
kill whatever currently owns that port. Startup refuses an occupied configured
port and reports the listener PID when the platform can identify it. Stop acts
only on a process launched by the current live orchestrator:

- macOS and Linux launches receive a dedicated process group, and stop signals
  only that recorded group so wrapper descendants are included;
- Windows uses the recorded direct child because POSIX process groups are not
  available;
- Docker-backed proof-server runs use a unique per-run container and its
  immutable container ID; a similarly named pre-existing container is never
  reused, attached, stopped, or removed;
- if no daemon is reachable, `orchestrator stop` reports matching configured
  ports/PIDs and exits with a failure instead of signaling them.

Automatic orphan killing by configured port has been removed. If startup
reports a stale listener, inspect it (for example with
`lsof -nP -iTCP:<port> -sTCP:LISTEN` on macOS/Linux), stop the owning service
through its own supervisor, or select another port. This fail-safe avoids
terminating unrelated native services or Docker Desktop's shared networking
backend.

## Inside EffectStream

Every template under
[`templates/`](https://github.com/effectstream/effectstream/tree/main/templates)
defines an `orchestrator.config.ts` (or `.json`) and starts dev with one
command. The E2E runner at
[`e2e/runner.ts`](https://github.com/effectstream/effectstream/blob/main/e2e/runner.ts)
is the same machinery, serialised across nine chain suites.

## Key subpath exports

- `@effectstream/orchestrator/config` - `OrchestratorConfig`, `ProcessConfig` types.
- `@effectstream/orchestrator/resolve-package` - resolve a package's bin to an absolute path (used by launcher scripts).
- `@effectstream/orchestrator/launch-pglite`, `./launch-evm`, `./launch-bitcoin`, `./launch-cardano`, `./launch-midnight`, `./launch-avail`, `./launch-near` - opinionated launcher scripts for each chain.
- `@effectstream/orchestrator/wait-tcp`, `./wait-http` - readiness-check helpers.

## Examples

- Templates: every directory under [`templates/`](https://github.com/effectstream/effectstream/tree/main/templates) ships a working orchestrator config.
- E2E: [`e2e/`](https://github.com/effectstream/effectstream/tree/main/e2e) drives the orchestrator under the hood.

Runnable: [`test/examples.test.ts`](./test/examples.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/tools/orchestrator
- Source: https://github.com/effectstream/effectstream/tree/main/packages/build-tools/orchestrator
