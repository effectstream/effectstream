# Frontend

The frontend is framework-agnostic. Default is Vite + React + a small Fastify static server. Cardano templates often skip the batcher and build/submit transactions directly in the browser using Lucid Evolution.

## Frontend SDK usage (`@effectstream/wallets`)

```ts
// packages/frontend/client/src/EffectstreamConfig.ts
import { EffectstreamConfig } from "@effectstream/wallets";
import { hardhat } from "viem/chains";

export const paimaEngineConfig = new EffectstreamConfig(
  "",              // appName — MUST match BatcherConfig.namespace
  "mainEvmRPC",    // sync protocol name (from config.dev.ts)
  "0x5FbDB...",    // EffectstreamL2 contract address
  hardhat,         // viem chain definition
  undefined,       // optional overrides
  "http://localhost:3334", // batcher URL
  true,            // preferBatchedMode
);
```

```ts
import { walletLogin, WalletMode } from "@effectstream/wallets";

// Browser injected wallet (Metamask, etc.)
const wallet = await walletLogin(paimaEngineConfig, WalletMode.EvmInjected);

// Or for local dev with Hardhat accounts:
//   walletLogin(paimaEngineConfig, WalletMode.EvmEthers /* + private key */)
```

```ts
import { sendTransaction } from "@effectstream/wallets";

// Concise data array — first element must match a grammar key, rest are typed values
await sendTransaction(
  wallet,
  ["createRoom", "my-room", 4],
  paimaEngineConfig,
  "wait-effectstream-processed",
);
```

## Static server (Fastify)

```ts
// packages/frontend/server/main.ts
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "path";

const server = Fastify();
server.register(fastifyStatic, {
  root: path.join(import.meta.dirname!, "../client/dist"),
});
server.setNotFoundHandler((_req, reply) => reply.sendFile("index.html"));
await server.listen({ port: 10599, host: "0.0.0.0" });
```

## Browser-side wallet pattern (Cardano, no batcher)

For Cardano templates that build/sign/submit transactions in the browser via Lucid Evolution, there is no batcher. The node API is GET-only — it serves indexed data but never receives writes from the frontend.

Requirements:
- Lucid packages: `@lucid-evolution/lucid`, `@lucid-evolution/provider`, `@lucid-evolution/utils`, `@lucid-evolution/core-types`
- A Fastify static server that also **proxies** to YACI (`/yaci/*`) and Dolos (`/dolos/*`) in addition to the API (`/api/*`)
- Browser-side seed phrase storage in `localStorage` for dev wallet persistence

### Fastify proxy path-rewriting pitfall

When proxying `/api/*` to the upstream node (`http://localhost:9999`), do NOT strip the `/api` prefix if the upstream expects it:

```ts
// WRONG — forwards /api/locks as /locks → 404
await proxyRequest(API_URL, "/api", request, reply);

// CORRECT — forwards /api/locks as /api/locks
await proxyRequest(API_URL, "", request, reply);
```

For proxies where the prefix IS artificial (`/yaci/*` → YACI at localhost:10000), strip it:
```ts
await proxyRequest(YACI_URL, "/yaci", request, reply);
```

### Fastify CBOR content-type parser

If the frontend proxies to a Cardano submit endpoint expecting `application/cbor`, register a content type parser:

```ts
server.addContentTypeParser("application/cbor", { parseAs: "buffer" }, (_req, body, done) => {
  done(null, body);
});
```

## Subscribing to custom events

```tsx
import { EventManager } from "@effectstream/event-client";
import { AppEvents } from "@my-template/shared/app-events";
```

See `grammar-stm.md` §3 for the full subscribe pattern. Key rules:
- Set fields to `undefined` to wildcard, supply values to narrow.
- Subscribers should be idempotent — events re-emit on full resync.

## Vite issues you WILL hit (read this before debugging)

### 1. Do NOT use `vite-plugin-top-level-await`

It depends on Node.js internals not present in Bun, so the build fails when Node.js is not installed. It is also unnecessary — Vite's `build.target: "esnext"` already supports top-level await natively in modern browsers. Remove both the import and the plugin call from `vite.config.ts`, and remove the dep.

### 2. `stream/web` polyfill

`vite-plugin-node-stdlib-browser` rewrites `node:stream` to `stream-browserify`, but `stream-browserify/web` doesn't exist. Midnight SDK packages (via `fetch-blob`) require `node:stream/web`. Add a custom Vite plugin **before** the node polyfills plugin:

```ts
{
  name: "fix-stream-web",
  enforce: "pre",
  resolveId(source) {
    if (source.endsWith("stream-browserify/web") || source === "stream/web" || source === "node:stream/web") {
      return path.resolve(import.meta.dirname!, "stream-web-shim.mjs");
    }
  },
},
```

The shim re-exports native browser web streams (`globalThis.ReadableStream`, etc.).

### 3. `node-fetch` in the browser bundle (the silent killer)

The Midnight SDK pulls in `node-fetch`, which does `require("fs").promises` at module init. Even though `vite-plugin-node-stdlib-browser` replaces `fs` with `memfs`, `memfs` returns `null` for `.promises`, crashing React before it can mount. Fix by aliasing `node-fetch` to a shim that re-exports the browser's native `fetch`:

```ts
// vite.config.ts resolve.alias:
"node-fetch": path.resolve(import.meta.dirname!, "native-fetch-shim.mjs"),
```

```js
// native-fetch-shim.mjs
export default globalThis.fetch;
export const Headers = globalThis.Headers;
export const Request = globalThis.Request;
export const Response = globalThis.Response;
```

**This bug is invisible to build-smoke tests** (the build succeeds) — only shows up in headless browser tests or when a user opens the page. This is why the Playwright render test exists. Skipping the render test does NOT save time — it just hides this class of bug until production.

## Bun + MQTT broker limitation (frontend HTTP-polling fallback)

Bun does not implement `createWebSocketStream` from the `ws` module. The MQTT event broker (`aedes-server-factory`) uses this internally — the broker starts successfully but crashes asynchronously when a WebSocket client connects. `@effectstream/runtime` already has a `typeof Bun` guard that skips broker startup under Bun.

Frontend consequence: the `BlockWatcher` silently fails — `latestBlock` never updates, so `waitForBlock()` hangs forever. Fix by setting in `packages/frontend/.env`:

```
VITE_IS_BUN=true
```

This switches BlockWatcher to poll the `/block-heights` REST endpoint every 2 seconds instead of using MQTT.

## Frontend processes in `start.dev.ts`

```ts
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
```

When Midnight is optional, use `critical: midnightEnabled` so a frontend failure doesn't take the whole orchestrator down in `DISABLE_MIDNIGHT=true` mode.
