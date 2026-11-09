// Default indexer endpoints of single-file Midnight sources, per network.

import { describe, expect, test } from "bun:test";

const TOKEN = "abc";
const NETWORKS = ["preview", "preprod", "mainnet"] as const;
const ADDRESS = "a".repeat(64);
const SELF_HOSTED_INDEXER = "https://indexer.example/api/v4/graphql";
// Midnight still serves preview itself; the URL stays usable as an override.
const MIDNIGHT_HOSTED_PREVIEW_INDEXER =
  "https://indexer.preview.midnight.network/api/v4/graphql";
// Every Midnight endpoint variable; each probe starts with all of them unset.
const MIDNIGHT_ENVS = [
  "MIDNIGHT_NETWORK_ID",
  "MIDNIGHT_BLOCKFROST_PROJECT_ID",
  "MIDNIGHT_INDEXER_HTTP",
  "MIDNIGHT_INDEXER_WS",
  "MIDNIGHT_NODE_HTTP",
];

type SourceCase = { network: string; indexer?: string };
type SourceResult = { network?: string; indexer?: string; error?: string };

/**
 * Declare one source per case in a fresh process with exactly `vars` set, so
 * the outcome cannot depend on the developer's shell or on when the SDK reads
 * its environment. Network access is replaced by a counter.
 */
async function declareSources(
  vars: Record<string, string>,
  cases: SourceCase[],
): Promise<{ results: SourceResult[]; networkCalls: number }> {
  const moduleUrl = new URL("../src/mod.ts", import.meta.url).href;
  const env: Record<string, string | undefined> = { ...process.env };
  for (const name of MIDNIGHT_ENVS) delete env[name];
  Object.assign(env, vars);

  const probe = Bun.spawn([
    process.execPath,
    "--eval",
    `
      let networkCalls = 0;
      globalThis.fetch = () => {
        networkCalls += 1;
        throw new Error("unexpected network call");
      };
      const { midnightContract } = await import(${JSON.stringify(moduleUrl)});
      const results = ${JSON.stringify(cases)}.map(({ network, indexer }) => {
        try {
          const source = midnightContract({
            network,
            address: ${JSON.stringify(ADDRESS)},
            startBlockHeight: "latest",
            ledger: { round: "uint128" },
            ...(indexer === undefined ? {} : { indexer }),
          });
          return { network: source.network, indexer: source.indexer };
        } catch (error) {
          return { error: String(error?.message ?? error) };
        }
      });
      console.log(JSON.stringify({ results, networkCalls }));
    `,
  ], { env, stdout: "pipe", stderr: "pipe" });

  const [exitCode, stdout] = await Promise.all([
    probe.exited,
    new Response(probe.stdout).text(),
    new Response(probe.stderr).text(),
  ]);
  expect(exitCode).toBe(0);
  return JSON.parse(stdout.trim().split("\n").at(-1) ?? "");
}

describe("single-file Midnight source endpoints", () => {
  test("every hosted network, mainnet included, defaults to Blockfrost with the token", async () => {
    const { results, networkCalls } = await declareSources(
      { MIDNIGHT_BLOCKFROST_PROJECT_ID: TOKEN },
      NETWORKS.map((network) => ({ network })),
    );
    expect(results).toEqual(NETWORKS.map((network) => ({
      network,
      indexer: `https://midnight-${network}.blockfrost.io/api/v0?project_id=${TOKEN}`,
    })));
    expect(networkCalls).toBe(0);
  }, 30_000);

  test("an explicit indexer wins unchanged even when a token is set", async () => {
    const { results } = await declareSources(
      { MIDNIGHT_BLOCKFROST_PROJECT_ID: TOKEN },
      NETWORKS.map((network) => ({ network, indexer: SELF_HOSTED_INDEXER })),
    );
    expect(results).toEqual(NETWORKS.map((network) => ({
      network,
      indexer: SELF_HOSTED_INDEXER,
    })));
  }, 30_000);

  test("a hosted network without a token refuses to build a default indexer", async () => {
    const { results, networkCalls } = await declareSources(
      {},
      NETWORKS.map((network) => ({ network })),
    );
    expect(results.map((result, index) => ({
      network: NETWORKS[index],
      built: result.indexer,
      namesToken: (result.error ?? "").includes("MIDNIGHT_BLOCKFROST_PROJECT_ID"),
    }))).toEqual(NETWORKS.map((network) => ({
      network,
      built: undefined,
      namesToken: true,
    })));
    expect(networkCalls).toBe(0);
  }, 30_000);

  test("an explicit indexer needs no token, including Midnight's own preview indexer", async () => {
    const cases: SourceCase[] = [
      { network: "preview", indexer: MIDNIGHT_HOSTED_PREVIEW_INDEXER },
      { network: "preprod", indexer: SELF_HOSTED_INDEXER },
      { network: "mainnet", indexer: SELF_HOSTED_INDEXER },
    ];
    const { results } = await declareSources({}, cases);
    expect(results).toEqual(cases);
  }, 30_000);

  test("the token is trimmed and a blank token counts as unset", async () => {
    const { results } = await declareSources(
      { MIDNIGHT_BLOCKFROST_PROJECT_ID: `  ${TOKEN}\n` },
      [{ network: "mainnet" }],
    );
    expect(results).toEqual([{
      network: "mainnet",
      indexer: `https://midnight-mainnet.blockfrost.io/api/v0?project_id=${TOKEN}`,
    }]);

    const blank = await declareSources(
      { MIDNIGHT_BLOCKFROST_PROJECT_ID: " \t " },
      [{ network: "mainnet" }],
    );
    expect(blank.results[0].indexer).toBeUndefined();
    expect(blank.results[0].error).toContain("MIDNIGHT_BLOCKFROST_PROJECT_ID");
  }, 30_000);

  test("a network outside preview, preprod and mainnet gets no guessed indexer", async () => {
    const secret = "nightmainnetSECRET0123456789";
    const { results, networkCalls } = await declareSources(
      { MIDNIGHT_BLOCKFROST_PROJECT_ID: secret },
      [{ network: "undeployed" }, { network: "future-network" }],
    );
    expect(results.map((result) => ({
      built: result.indexer,
      namesOption: (result.error ?? "").includes("`indexer`"),
      leaksToken: (result.error ?? "").includes(secret),
    }))).toEqual([
      { built: undefined, namesOption: true, leaksToken: false },
      { built: undefined, namesOption: true, leaksToken: false },
    ]);
    expect(networkCalls).toBe(0);
  }, 30_000);
});

type StartResult = {
  resolved?: boolean;
  message?: string;
  path?: unknown;
  inspected?: string;
};

/**
 * Run a node whose only source starts at the indexer's latest height, in a
 * fresh process, and report how the tip lookup failed.
 */
async function startFromLatest(indexer: string): Promise<{
  result: StartResult;
  output: string;
}> {
  const moduleUrl = new URL("../src/mod.ts", import.meta.url).href;
  const env: Record<string, string | undefined> = { ...process.env };
  for (const name of MIDNIGHT_ENVS) delete env[name];

  const probe = Bun.spawn([
    process.execPath,
    "--eval",
    `
      const { midnightContract, pglite, runNode } = await import(${JSON.stringify(moduleUrl)});
      let result;
      try {
        await runNode({
          appName: "single-file-tip-probe",
          database: pglite(),
          sources: {
            counter: midnightContract({
              network: "preprod",
              address: ${JSON.stringify(ADDRESS)},
              startBlockHeight: "latest",
              ledger: { round: "uint128" },
              indexer: ${JSON.stringify(indexer)},
            }),
          },
          transitions: { counter: () => {} },
        });
        result = { resolved: true };
      } catch (error) {
        result = {
          message: String(error?.message ?? error),
          path: error?.path,
          inspected: Bun.inspect(error),
        };
      }
      console.log(JSON.stringify(result));
    `,
  ], { env, stdout: "pipe", stderr: "pipe" });

  const [exitCode, stdout, stderr] = await Promise.all([
    probe.exited,
    new Response(probe.stdout).text(),
    new Response(probe.stderr).text(),
  ]);
  expect(exitCode).toBe(0);
  return {
    result: JSON.parse(stdout.trim().split("\n").at(-1) ?? ""),
    output: `${stdout}\n${stderr}`,
  };
}

describe("single-file tip lookup keeps the project token out of errors", () => {
  const SECRET = "nightpreprodSECRET0123456789";

  test("a rejected token surfaces the indexer's reason without the token", async () => {
    // Blockfrost's 403 body names the reason; this one also echoes the request.
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
      const { result, output } = await startFromLatest(
        `http://127.0.0.1:${server.port}/api/v0?project_id=${SECRET}`,
      );
      expect(result.resolved).toBeUndefined();
      expect(result.message).toContain("403");
      expect(result.message).toContain("Network token mismatch.");
      expect(result.message).toContain("project_id=<redacted>");
      expect(output).not.toContain(SECRET);
    } finally {
      server.stop(true);
    }
  }, 60_000);

  test("an unreachable indexer fails without the token in the error", async () => {
    const closed = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
    const port = closed.port;
    closed.stop(true);

    const { result, output } = await startFromLatest(
      `http://127.0.0.1:${port}/api/v0?project_id=${SECRET}`,
    );
    expect(result.resolved).toBeUndefined();
    expect(result.message).toBeTruthy();
    if (result.path !== undefined) {
      expect(result.path).toBe(`http://127.0.0.1:${port}/api/v0?project_id=<redacted>`);
    }
    expect(result.inspected).not.toContain(SECRET);
    expect(output).not.toContain(SECRET);
  }, 60_000);
});
