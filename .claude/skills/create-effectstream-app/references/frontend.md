# Frontend

The frontend is framework-agnostic. Default is Vite + React + a small Fastify static server. Cardano templates often skip the batcher and build/submit transactions directly in the browser using Lucid Evolution.

> **See also (concept docs).**
> - Frontend SDK overview (`EffectstreamConfig`, `walletLogin`, `sendTransaction`, `EventManager`): `docs/site/docs/home/100-components/115-frontend.md`, `docs/site/docs/home/500-packages/550-tools/frontend-sdk.md`
> - Wallet concepts + per-chain support: `docs/site/docs/home/100-components/112-wallets.md`, `docs/site/docs/home/500-packages/510-sdk/wallets.md` (the npm package is `@effectstream/wallets` plural; older docs sometimes show singular `@effectstream/wallet` — that's stale)
> - Event-client (browser MQTT subscriptions to custom STM events): `docs/site/docs/home/500-packages/510-sdk/event-client.md` (the conceptual MQTT/topicHash story is light in docs; this reference file is the operational source)
> - Cardano browser-wallet integration (Lucid Evolution): `docs/site/docs/home/200-chains/203-cardano.md`

## Frontend SDK usage (`@effectstream/wallets`)

```ts
// packages/frontend/client/src/EffectstreamConfig.ts
import { EffectstreamConfig } from "@effectstream/wallets";
import { hardhat } from "viem/chains";

export const paimaEngineConfig = new EffectstreamConfig(
  "",              // securityNamespace — MUST match BatcherConfig.namespace
  "mainEvmRPC",    // sync protocol name (from config.dev.ts)
  "0x5FbDB...",    // EffectstreamL2 contract address
  hardhat,         // viem chain definition
  undefined,       // optional overrides
  "http://localhost:3334", // batcher URL
  true,            // preferBatchedMode
);
```

```ts
import { walletLogin, allInjectedWallets, WalletMode } from "@effectstream/wallets";

// `walletLogin` takes ONE argument — a LoginInfo object. (It is NOT
// `walletLogin(config, mode)`; that's the stale pre-lean signature.)
// It returns { success: true, result: Wallet } | { success: false, errorMessage }.

// Browser injected wallet (MetaMask, etc.) — discover, then connect a chosen one.
// `preference` is optional: without it, the FIRST discovered injected wallet is
// auto-connected (it only fails when no EVM wallet is injected at all). Pass
// `preference` to pick a specific wallet. Entries are ConnectionOption → read
// `.metadata.name`, NOT a top-level `.name`.
const injected = await allInjectedWallets({ signatureSupport: true, transactionSupport: true });
const opt = injected[WalletMode.EvmInjected][0];
const res = await walletLogin({
  mode: WalletMode.EvmInjected,
  preference: { name: opt.metadata.name },
  preferBatchedMode: false,
  chain: hardhat,
});
if (!res.success) throw new Error(res.errorMessage);
const wallet = res.result;

// Local-JS wallet for dev + headless e2e (no extension; prefer over EvmEthers).
// A funded Hardhat key works directly; a freshly-generated key needs funding first.
const local = await walletLogin({
  mode: WalletMode.EvmViem,
  privateKey: "0xac09…ff80",
  rpcUrl: "http://localhost:8545",
  chain: hardhat,
});
```

> See `migration.md` § "Wallet connect gotchas" for the recurring traps (missing
> `preference`, `opt.metadata.name` vs `opt.name`, local-JS e2e masking the
> browser path, write-then-read race, per-tab dev-wallet identity).

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

## Vanilla esbuild path (minimal, world-map-2d)

`templates/minimal` and `templates/world-map-2d` skip Vite/React entirely: a plain `index.js` bundled by `packages/frontend/esbuild.js`. The one non-obvious requirement: `@effectstream/wallets` declares Cardano/Midnight helpers (`@lucid-evolution/*`, `@midnight-ntwrk/*`, `@effectstream/midnight-contracts`) as optional deps. Bundling them fails (Lucid resolution, ledger-v8 `.wasm`), and `external` leaves bare specifiers the browser can't resolve at load time even though the code never runs. Resolve them to an empty stub instead:

```js
{
  name: "stub-optional-wallet-deps",
  setup(build) {
    const filter =
      /^(@lucid-evolution\/|@midnight-ntwrk\/|@effectstream\/midnight-contracts(\/|$))/;
    build.onResolve({ filter }, (args) => ({
      path: args.path,
      namespace: "optional-wallet-stub",
    }));
    build.onLoad(
      { filter: /.*/, namespace: "optional-wallet-stub" },
      () => ({ contents: "module.exports = {};", loader: "js" }),
    );
  },
},
```

Pair it with `nodeModulesPolyfillPlugin({ globals: { process: true, Buffer: true } })`. Without the stub plugin a vanilla build fails on the optional wallet deps.

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

### 3. `viteStaticCopy` fails the build when the glob matches nothing

If you use `vite-plugin-static-copy` to ship Compact artifacts, the deployment-address JSON, etc., **set `silent: true` on the plugin invocation**. If the file the glob references doesn't yet exist (common on a fresh checkout before the orchestrator's deploy step has run), `vite build` errors out with "No file was found to copy" and aborts. With `silent: true`, the build completes and the glob is retried at runtime.

```ts
viteStaticCopy({
  silent: true,
  targets: [
    { src: "../../packages/contracts-midnight/contract-counter/src/managed/keys/*", dest: "midnight-keys" },
    { src: "../../packages/contracts-midnight/contract-counter.*.json", dest: "midnight-deployment" },
  ],
})
```

### 4. `node-fetch` in the browser bundle (the silent killer)

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

## MQTT broker under Bun (and the HTTP-polling fallback)

The MQTT event broker works under Bun: it's `@seriousme/opifex`'s `MqttServer` with WebSocket transport served by native `Bun.serve` (`packages/node-sdk/events/src/event-broker.ts`). The runtime starts it whenever `MQTT_BROKER` is on — and it defaults to `true` — with no Bun-specific guard (`packages/node-sdk/runtime/src/main.ts`). Older notes about aedes crashing under Bun and a `typeof Bun` guard in `@effectstream/runtime` are stale — that code is gone.

If the broker is disabled (`MQTT_BROKER=false`) or WebSockets can't reach it, `BlockWatcher` still offers an HTTP fallback — set in `packages/frontend/.env.dev` / `.env.mainnet`:

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
