// Hosted Midnight indexers authenticate with a `project_id` query parameter;
// the client must never print that token.

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { MidnightClient } from "../src/sync-protocols/midnight/MidnightClient.ts";

const SECRET = "nightmainnetSECRET0123456789";

let printed: string[] = [];
let restoreConsole: (() => void) | undefined;

beforeEach(() => {
  printed = [];
  const capture = (...args: unknown[]) => {
    printed.push(args.map((arg) => typeof arg === "string" ? arg : Bun.inspect(arg)).join(" "));
  };
  const spies = [
    spyOn(console, "log").mockImplementation(capture),
    spyOn(console, "info").mockImplementation(capture),
    spyOn(console, "warn").mockImplementation(capture),
    spyOn(console, "error").mockImplementation(capture),
  ];
  restoreConsole = () => spies.forEach((spy) => spy.mockRestore());
});

afterEach(() => {
  restoreConsole?.();
  restoreConsole = undefined;
});

describe("MidnightClient keeps the indexer project token out of its output", () => {
  test("the startup line names the indexer with the token redacted", () => {
    new MidnightClient(
      `https://midnight-mainnet.blockfrost.io/api/v0?project_id=${SECRET}`,
      "mainnet",
    );
    expect(printed).toEqual([
      "[MidnightClient] Using indexer https://midnight-mainnet.blockfrost.io/api/v0?project_id=<redacted> (network: mainnet)",
    ]);
  });

  test("a rejected request is reported without the token", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (request) => {
        const { pathname, search } = new URL(request.url);
        return Response.json({
          error: "Forbidden",
          message: "Network token mismatch.",
          request: `${pathname}${search}`,
          status_code: 403,
        }, { status: 403 });
      },
    });
    try {
      const client = new MidnightClient(
        `http://127.0.0.1:${server.port}/api/v0?project_id=${SECRET}`,
        "mainnet",
      );
      const failure = await client.gqlQuery("query { block { height } }").then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toContain("403");
      const output = printed.join("\n");
      expect(output).toContain("Network token mismatch.");
      expect(output).toContain("project_id=<redacted>");
      expect(output).not.toContain(SECRET);
      expect(Bun.inspect(failure)).not.toContain(SECRET);
    } finally {
      server.stop(true);
    }
  });

  test("an unreachable indexer rejects without the token on the error", async () => {
    const closed = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
    const port = closed.port;
    closed.stop(true);

    const client = new MidnightClient(
      `http://127.0.0.1:${port}/api/v0?project_id=${SECRET}`,
      "mainnet",
      5_000,
    );
    const failure = await client.gqlQuery("query { block { height } }").then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(Bun.inspect(failure)).not.toContain(SECRET);
    expect(printed.join("\n")).not.toContain(SECRET);
  });

  test("an indexer URL without a token is printed unchanged", () => {
    new MidnightClient("http://127.0.0.1:8088/api/v4/graphql", "undeployed");
    expect(printed).toEqual([
      "[MidnightClient] Using indexer http://127.0.0.1:8088/api/v4/graphql (network: undeployed)",
    ]);
  });
});
