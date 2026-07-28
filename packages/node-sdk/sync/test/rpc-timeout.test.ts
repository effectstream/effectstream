/**
 * Repro for sync/CLAUDE.md Finding #4 (missing RPC timeouts).
 *
 * Every per-chain client is pointed at a **blackhole**: a TCP server that
 * completes the handshake and then never writes a byte. This is the realistic
 * production failure (a load balancer that drops the backend, a half-open
 * socket after a NAT rebind) — and the one plain `fetch` cannot see, because
 * `fetch` has no default timeout in Bun/Node. The connection is *up*, so there
 * is no ECONNREFUSED, no DNS error, nothing to catch.
 *
 * Consequence in production: `readData` never returns, so the fetch loop in
 * `orchestration/sync.ts` never reaches its `catch` → `consecutiveErrors` stays
 * 0, `lastSuccessfulFetchMs` freezes, and the merge blocks on that chain's page
 * forever. The node stops producing blocks and reports nothing.
 *
 * These tests document CURRENT behaviour:
 *   - Bitcoin / NEAR / Avail  → hang forever            (the bug)
 *   - Midnight                → rejects after its timeout (the desired shape)
 *
 * When the fix lands, flip the three `expect(...).toBe("pending")` assertions
 * to `"rejected"` and drop the `KNOWN-BROKEN` markers.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import net from "node:net";
import { BitcoinRpcClient } from "../src/sync-protocols/bitcoin/fetcher.ts";
import { NearClient } from "../src/sync-protocols/near/NearClient.ts";
import { AvailClient } from "../src/sync-protocols/avail/AvailClient.ts";
import { MidnightClient } from "../src/sync-protocols/midnight/MidnightClient.ts";

/** How long we watch a call before declaring it hung. */
const OBSERVE_MS = 1_500;
/** Timeout handed to clients that support one, kept well under OBSERVE_MS. */
const CLIENT_TIMEOUT_MS = 300;

let server: net.Server;
let port: number;
/** Held so the accepted sockets aren't garbage-collected mid-test. */
const openSockets: net.Socket[] = [];

beforeAll(async () => {
  server = net.createServer((socket) => {
    // Accept and go silent: the client sees a healthy connection and waits
    // for a response that never comes.
    openSockets.push(socket);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as net.AddressInfo).port;
});

afterAll(async () => {
  for (const socket of openSockets) socket.destroy();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

type Settlement = "pending" | "resolved" | "rejected";

/**
 * Watch `p` for `ms` and report whether it settled. The promise is left with a
 * no-op catch attached so a late rejection (after the test ends) can't surface
 * as an unhandled rejection and fail an unrelated test.
 */
async function settlementWithin(
  p: Promise<unknown>,
  ms: number,
): Promise<Settlement> {
  const pending = Symbol("pending");
  let outcome: Settlement = "pending";
  const tracked = p.then(
    () => {
      outcome = "resolved";
    },
    () => {
      outcome = "rejected";
    },
  );
  const winner = await Promise.race([
    tracked.then(() => "settled" as const),
    new Promise<typeof pending>((resolve) => setTimeout(() => resolve(pending), ms)),
  ]);
  return winner === pending ? "pending" : outcome;
}

test("KNOWN-BROKEN: Bitcoin RPC hangs forever on a blackholed endpoint", async () => {
  const client = new BitcoinRpcClient({
    url: `http://127.0.0.1:${port}`,
    username: null,
    password: null,
  });

  const settlement = await settlementWithin(client.getBlockCount(), OBSERVE_MS);

  // BitcoinRpcClient.call() uses bare `fetch` with no AbortSignal
  // (bitcoin/fetcher.ts). Nothing bounds this call.
  expect(settlement).toBe("pending");
}, OBSERVE_MS + 5_000);

test("KNOWN-BROKEN: NEAR RPC hangs forever on a blackholed endpoint", async () => {
  const client = new NearClient(`http://127.0.0.1:${port}`);

  const settlement = await settlementWithin(
    client.getBlock({ finality: "final" }),
    OBSERVE_MS,
  );

  // NearClient.rpc() uses bare `fetch` with no AbortSignal (near/NearClient.ts).
  expect(settlement).toBe("pending");
}, OBSERVE_MS + 5_000);

test("KNOWN-BROKEN: Avail light-client HTTP hangs forever on a blackholed endpoint", async () => {
  // Built without the constructor on purpose: `new AvailClient(...)` eagerly
  // calls `SDK.New(nodeUrl)`, whose websocket provider keeps reconnect timers
  // alive and would outlive the test process. `getStatus()` only touches the
  // light-client HTTP url, which is the code path under test.
  const client: AvailClient = Object.create(AvailClient.prototype);
  Object.assign(client, { url: `http://127.0.0.1:${port}` });

  const settlement = await settlementWithin(client.getStatus(), OBSERVE_MS);

  // AvailClient.getStatus() uses bare `fetch` with no AbortSignal
  // (avail/AvailClient.ts).
  expect(settlement).toBe("pending");
}, OBSERVE_MS + 5_000);

test("CONTROL: Midnight rejects on a blackholed endpoint (has a request timeout)", async () => {
  const client = new MidnightClient(
    `http://127.0.0.1:${port}`,
    undefined,
    CLIENT_TIMEOUT_MS,
  );

  const settlement = await settlementWithin(
    client.gqlQuery("query { __typename }"),
    OBSERVE_MS,
  );

  // MidnightClient.gqlQuery() passes AbortSignal.timeout(requestTimeoutMs).
  // This is the shape the three clients above are missing.
  expect(settlement).toBe("rejected");
}, OBSERVE_MS + 5_000);
