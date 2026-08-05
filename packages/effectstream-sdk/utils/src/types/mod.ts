// Exposed as `@effectstream/utils/types` — the browser-safe subset.
//
// The ROOT barrel re-exports config.ts, which runs dotenv (.env loading from
// disk) at import time. Any browser bundle that imports the root for a mere
// type or enum (AddressType, Result, WalletAddress…) drags that bootstrap —
// and once crashed outright on `process`. Browser-reachable code should import
// this subpath instead; keep this tree free of node-only modules (node:buffer
// is the one allowed exception — it has a real browser polyfill).
export type * from "./misc.ts";
export type * from "./json-query.ts";
export type * from "./nominal.ts";
export * from "./typebox-helpers.ts";
export * from "./utils.ts";
export * from "./validators/mod.ts";
