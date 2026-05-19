# Tests (mandatory, chain-agnostic)

> **Bun quirk every test runner must know about**: `bun run test` for a runner that spawns the orchestrator as a subprocess and then calls `process.exit(0)` in a `finally` block will frequently exit with code **143 (SIGTERM "Polite quit request") even when all tests pass**. Bun reports this because the orchestrator-shutdown sequence sends signals through the process group that Bun catches as "external SIGTERM" and forwards through its own exit handler.
>
> **This is not a test failure.** The authoritative signal is the `[Summary]` block printed before teardown:
>
> ```
> [Summary]
>   10 tests passed
>   0 tests failed
> ```
>
> The skill's grader (`grade.py`) parses this summary and treats `passed > 0 && failed == 0` as success regardless of exit code. Anything consuming `bun run test` in CI should do the same — grep the stdout for the Summary line, don't trust the exit code alone.


Every template ships with `packages/tests/`. Tests use the orchestrator to spin up **real** infrastructure and assert against actual DB state — no mocks. The test suite is **the single most important verification** that the template scaffold works: a template can have every file in the right place and still fail to boot. Only running the actual integration tests catches that.

## The structure is constant; the contents adapt to your chains

The phased shape — Phase A (infrastructure) → Phase B (STM/DB/API) → Phase C (frontend if present) → optional D/E for cross-chain or chain-specific checks — is **the same for every template** regardless of which chains it uses. What changes is what each phase tests:

| Phase | Chain-agnostic intent | EVM-specific instantiation | Midnight-specific | Cardano-specific |
|---|---|---|---|---|
| A — `infra/chain-ready.test.ts` | Each chain's RPC/indexer responds on the expected port | `eth_chainId` returns `0x7a69` on 8545 | Midnight indexer GraphQL responds on 8088 | YACI on 10000, Dolos on 50051 / 3000 |
| A — `infra/deploy.test.ts` | Each contract package's address is available | `contractAddressesEvmMain().chain31337[...]` is a `0x` address | `readMidnightContract()` returns a deployed contract | (no contract on Cardano — verify YACI funded genesis pool) |
| B — `stm/<action>.test.ts` | Submit a real transaction on-chain → assert DB row appears | viem `writeContract` to `effectstreamSubmitGameInput` → `assertSQL` | Compact contract call via deploy → primitive parses → `assertSQL` | Lucid tx submission → cardano-primitive parses → `assertSQL` |
| B — `stm/api.test.ts` | The API serves what the STM wrote | `GET /api/rooms` returns the inserted row | same | same |
| C — frontend (optional) | Build succeeds + headless render finds the root element | Playwright on `:10599` | same | same |

The `evm-midnight-v2` template's `packages/tests/run-tests.ts` is the canonical reference — it orchestrates Phase A → B → C → cross-chain → midnight-property → frontend. The runner pattern (start orchestrator → wait for health → wait for processes → run phased tests → shut down) is the same regardless of which chains you have.

## Architecture

```
packages/tests/
├── run-tests.ts              # Orchestrates all phases
├── start.test.ts             # Orchestrator config for test mode
├── helpers.ts                # assert, assertSQL utilities
├── infra/                    # Phase A: Infrastructure
│   ├── chain-ready.test.ts
│   └── deploy.test.ts
├── stm/                      # Phase B: State Machine + DB + API
│   ├── my-action.test.ts
│   └── api.test.ts
└── frontend/                 # Phase C+: Frontend (if frontend exists)
    ├── build-smoke.test.ts
    └── render.test.ts
```

Templates can add more phases for cross-chain tests, privacy tests, etc. — the core A/B/C structure stays the same.

## Phase A: Infrastructure

Verifies the orchestrator boots correctly — chain nodes respond, contracts deploy, sync node healthy, blocks indexing.

```ts
// packages/tests/infra/chain-ready.test.ts
import { assert } from "../helpers.ts";

export async function chainReadyTest() {
  await assert("EVM chain responds on port 8545", async () => {
    const res = await fetch("http://localhost:8545", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    const json = await res.json();
    return parseInt(json.result, 16) === 31337;
  });
}
```

```ts
// packages/tests/infra/deploy.test.ts
import { assert } from "../helpers.ts";
import { contractAddressesEvmMain } from "@my-template/contracts-evm";

export async function deployTest() {
  await assert("Contracts deployed with valid addresses", async () => {
    const addrs = contractAddressesEvmMain();
    const addr = addrs.chain31337["EffectstreamL2Module#MyEffectstreamL2"];
    return addr !== undefined && addr.startsWith("0x") && addr.length === 42;
  });
}
```

## Phase B: STM / DB / API

The core loop: submit transactions on-chain, wait for the sync node to index them, then assert (1) STM wrote correct values to DB and (2) API returns expected responses.

```ts
// packages/tests/stm/my-action.test.ts
import { assertSQL } from "../helpers.ts";
import { createWalletClient, createPublicClient, http, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { contractAddressesEvmMain } from "@my-template/contracts-evm";
import type { Client } from "pg";

const wallet0 = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);

const effectstreamL2Abi = [{
  inputs: [{ name: "data", type: "bytes" }],
  name: "effectstreamSubmitGameInput",
  outputs: [],
  stateMutability: "payable",
  type: "function",
}] as const;

export async function createRoomTest(db: Client) {
  const addresses = contractAddressesEvmMain();
  const contractAddr = addresses.chain31337["EffectstreamL2Module#MyEffectstreamL2"];
  const walletClient = createWalletClient({ account: wallet0, chain: hardhat, transport: http() });
  const publicClient = createPublicClient({ chain: hardhat, transport: http() });

  const hash = await walletClient.writeContract({
    address: contractAddr,
    abi: effectstreamL2Abi,
    functionName: "effectstreamSubmitGameInput",
    args: [toHex(JSON.stringify(["createRoom", "test-room", 4]))],
  });
  await publicClient.waitForTransactionReceipt({ hash });

  await assertSQL(
    "createRoom: room written to DB",
    db,
    `SELECT room_name, max_players, creator FROM rooms WHERE room_name = 'test-room';`,
    (res) => res.rows.length >= 1,
    (res) => {
      const room = res.rows[0];
      return room.room_name === "test-room"
          && room.max_players === 4
          && room.creator === wallet0.address.toLowerCase();
    },
  );
}
```

```ts
// packages/tests/stm/api.test.ts
import { assert } from "../helpers.ts";

const API_PORT = 9999;

export async function apiTest() {
  await assert("GET /api/rooms returns data", async () => {
    const res = await fetch(`http://localhost:${API_PORT}/api/rooms`);
    const items = await res.json();
    return Array.isArray(items) && items.length > 0;
  });
}
```

## Phase C: Frontend

Two tiers: build verification + headless browser render.

### Build smoke test

```ts
// packages/tests/frontend/build-smoke.test.ts
import { assert } from "../helpers.ts";
import path from "path";

export async function frontendBuildTest() {
  await assert("Frontend vite build exits successfully", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "--filter", "@my-template/frontend", "build"],
      { cwd: path.resolve(import.meta.dirname!, "../../.."), stdout: "pipe", stderr: "pipe" },
    );
    return (await proc.exited) === 0;
  });
}
```

### Render test (catches runtime browser bugs)

```ts
// packages/tests/frontend/render.test.ts
import { assert } from "../helpers.ts";
import { chromium } from "playwright-core";

const FRONTEND_PORT = 10599;

export async function frontendRenderTest() {
  const executablePath = process.env["CHROME_PATH"] || findChrome();
  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage();

  const jsErrors: string[] = [];
  page.on("pageerror", (err) => jsErrors.push(err.message));

  await page.goto(`http://localhost:${FRONTEND_PORT}/`, { waitUntil: "load", timeout: 15_000 });
  await page.waitForSelector(".container", { timeout: 10_000 });

  await assert("Frontend React app mounts", async () => (await page.$(".container")) !== null);
  await assert("Frontend has no fatal JS errors", async () => jsErrors.length === 0);

  await browser.close();
}
```

Use `playwright-core` (not `@playwright/test`) to avoid bundling browsers — `findChrome()` (or `CHROME_PATH`) discovers Chrome on the host.

This catches the `node-fetch` / `stream/web` / `vite-plugin-top-level-await` class of bug that `vite build` succeeds on but blows up at mount time.

### Playwright E2E for richer UIs

For templates with browser-side wallet interactions (e.g. Cardano + Lucid), use `@playwright/test` in `packages/frontend/e2e/`:

```ts
// packages/frontend/playwright.config.ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 300_000,
  retries: 0,
  use: { baseURL: "http://localhost:10599", headless: true },
  projects: [{ name: "chromium", use: { browserName: "chromium", headless: true } }],
});
```

```ts
// packages/frontend/e2e/app.spec.ts
import { test, expect } from "@playwright/test";

test("mint NFT flow", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("connect-evm-btn").click();
  await expect(page.getByTestId("evm-address")).toBeVisible({ timeout: 5_000 });
  await page.getByTestId("mint-nft-btn").click();
  await expect(page.getByText("NFT minted!")).toBeVisible({ timeout: 30_000 });
});
```

Key patterns for Cardano-style full-lifecycle tests:
- Clear `localStorage` at test start to prevent auto-reconnect interference
- Use `page.getByText("Locked", { exact: true })` — `"Unlocked"` also contains `"Locked"` substring
- Generous timeouts (60s TX confirmation, 30s time-lock expiry, `test.setTimeout(300_000)` for full lifecycle)
- Group tests: (1) app structure / no POST/PATCH/DELETE, (2) API health, (3) wallet lifecycle (connect → mint → lock → unlock → claim)
- Add `data-testid` on every interactive element

## Test Runner (`run-tests.ts`)

```ts
import { anyError, printSummary } from "./helpers.ts";
import pg from "pg";
import path from "path";
import type { Client } from "pg";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ORCHESTRATOR_PORT = 4747;
const API_PORT = parseInt(process.env["EFFECTSTREAM_API_PORT"] || "9999", 10);

const CLI_PATH = path.resolve(
  import.meta.dirname!,
  "../../node_modules/@effectstream/orchestrator/src/cli.ts",
);
const LAUNCHER_PATH = path.resolve(import.meta.dirname!, "./start.test.ts");

let proc: ReturnType<typeof Bun.spawn> | null = null;

async function startInfra() {
  // Free any stale orchestrator/chain state left over from a prior aborted run.
  // Without this, the orchestrator CLI sees a daemon on 4747 and "delegates via API"
  // — meaning the new test shares state (and partial deployments) with the old run,
  // producing race conditions (ENOENT on deployed_addresses.json, port conflicts).
  for (const port of [4747, 5432, 8545, 8546, 9999, 8883, 9883]) {
    try { Bun.spawnSync(["bash", "-c", `lsof -ti :${port} | xargs -r kill -9`]); } catch {}
  }

  proc = Bun.spawn(["bun", CLI_PATH, "start", LAUNCHER_PATH], {
    cwd: path.resolve(import.meta.dirname!, "../.."),
    stdout: "inherit", stderr: "inherit",
    env: { ...process.env },
  });
}

async function stopInfra() {
  try { await fetch(`http://localhost:${ORCHESTRATOR_PORT}/shutdown`, { method: "POST" }); } catch {}
  await delay(2000);
  proc?.kill();
}

async function waitForProcess(name: string, opts: { waitForExit?: boolean; timeoutMs?: number } = {}) {
  const { waitForExit = false, timeoutMs = 120_000 } = opts;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${ORCHESTRATOR_PORT}/processes`);
      const data = await res.json() as any;
      const p = data.processes?.find((p: any) => p.name === name);
      if (p) {
        if (waitForExit && p.status === "done") return;
        if (!waitForExit && (p.status === "running" || p.status === "done")) return;
      }
    } catch {}
    await delay(500);
  }
  throw new Error(`Process "${name}" did not ${waitForExit ? "complete" : "start"} within ${timeoutMs / 1000}s`);
}

async function test() {
  let db: Client | null = null;
  try {
    await startInfra();

    // Phase A
    await waitForProcess("generate-evm-mod", { waitForExit: true });
    const { chainReadyTest } = await import("./infra/chain-ready.test.ts");
    const { deployTest } = await import("./infra/deploy.test.ts");
    await chainReadyTest();
    await deployTest();

    // Phase B
    await waitForProcess("sync");
    db = new pg.Client({ host: "localhost", port: 5432, user: "postgres", password: "postgres", database: "postgres" });
    await db.connect();
    const { createRoomTest } = await import("./stm/my-action.test.ts");
    const { apiTest } = await import("./stm/api.test.ts");
    await createRoomTest(db);
    await apiTest();

    // Phase C (if frontend present)
    // const { frontendBuildTest } = await import("./frontend/build-smoke.test.ts");
    // await frontendBuildTest();

    printSummary();
  } catch (e) {
    printSummary();
    console.error(e);
  } finally {
    if (db) await db.end();
    await stopInfra();
    if (anyError()) process.exit(1);
    process.exit(0);
  }
}

test();
```

The CLI path uses `node_modules/@effectstream/orchestrator/src/cli.ts` — do not hard-code a relative path into the engine monorepo's `packages/build-tools/`.

## Test launcher (`start.test.ts`)

Same chain infra as dev, but typically no TUI / no frontend, and with `ENABLE_DEV_AND_DEBUG_ENDPOINTS: "true"` on the sync node.

```ts
import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { launchPglite, DbNames } from "@effectstream/orchestrator/launch-pglite";
import { launchEvm, EvmNames } from "@effectstream/orchestrator/launch-evm";

const root = path.resolve(import.meta.dirname!, "../..");

export default {
  processes: [
    ...launchPglite(),
    ...launchEvm("@my-template/contracts-evm", { cwd: path.join(root, "packages/contracts-evm") }),
    {
      name: "sync",
      description: "Sync node (test mode)",
      args: ["run", "packages/node/main.dev.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true", ENABLE_DEV_AND_DEBUG_ENDPOINTS: "true" },
      dependsOn: [DbNames.PGLITE_WAIT, EvmNames.GENERATE_MOD],
    },
  ],
} satisfies OrchestratorConfig;
```

The test launcher must also apply `DISABLE_*` filtering for optional chains, same as `start.dev.ts`.

## Test helpers

```ts
// packages/tests/helpers.ts
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

let passCount = 0;
let failCount = 0;

export async function assert(name: string, check: () => Promise<boolean>): Promise<void> {
  process.stdout.write(`  [TEST] ${name}...`);
  try {
    if (await check()) { console.log(" PASS"); passCount++; }
    else { console.log(" FAIL"); failCount++; throw new Error(`Assertion failed: ${name}`); }
  } catch (e) { console.log(" FAIL"); failCount++; throw e; }
}

export async function assertSQL<T>(
  name: string,
  db: any,
  query: string,
  waitUntil: (res: { rows: T[] }) => boolean,
  check: (res: { rows: T[] }) => boolean,
  timeoutMs = 20_000,
): Promise<void> {
  process.stdout.write(`  [TEST] ${name}...`);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await db.query(query);
    if (waitUntil(res)) {
      if (check(res)) { console.log(" PASS"); passCount++; return; }
      else { console.log(" FAIL"); failCount++; throw new Error(`Check failed: ${name}`); }
    }
    await delay(200);
  }
  console.log(" TIMEOUT"); failCount++; throw new Error(`Timed out waiting: ${name}`);
}

export function printSummary() { console.log(`\nResults: ${passCount} passed, ${failCount} failed`); }
export function anyError() { return failCount > 0 || (passCount + failCount) === 0; }
```

## Wiring up the `test` script

Root `package.json`:
```json
"scripts": {
  "test": "bun run packages/tests/run-tests.ts"
}
```

Then `cd templates/<name> && bun run test` works. The monorepo's `templates/run-template-tests.ts` auto-discovers every template with a `"test"` script.
