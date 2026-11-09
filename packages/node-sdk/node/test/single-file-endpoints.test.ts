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
});
