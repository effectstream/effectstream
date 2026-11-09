import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { deployMidnightContract } from "../src/deploy.ts";
import {
  defaultMidnightNetworkConfig,
  redactBlockfrostProjectId,
} from "../src/midnight-env.ts";
import type { WalletResult } from "../src/types.ts";

const SECRET = "nightpreprodDoNotPrintMe";
const BLOCKFROST_PREPROD = {
  indexer: `https://midnight-preprod.blockfrost.io/api/v0?project_id=${SECRET}`,
  indexerWS: `wss://midnight-preprod.blockfrost.io/api/v0/ws?project_id=${SECRET}`,
  node: `https://rpc.midnight-preprod.blockfrost.io?project_id=${SECRET}`,
};
// Every variable the package reads for endpoint selection; each spawned probe
// starts with all of them unset.
const MIDNIGHT_ENVS = [
  "MIDNIGHT_NETWORK_ID",
  "MIDNIGHT_BLOCKFROST_PROJECT_ID",
  "MIDNIGHT_INDEXER_HTTP",
  "MIDNIGHT_INDEXER_WS",
  "MIDNIGHT_NODE_HTTP",
  "MIDNIGHT_INDEXER_URL",
  "MIDNIGHT_INDEXER_WS_URL",
  "MIDNIGHT_NODE_URL",
  "MIDNIGHT_PROOF_SERVER_URL",
  "MIDNIGHT_PROOF_SERVER",
  "MIDNIGHT_WALLET_SEED",
  "MIDNIGHT_WALLET_MNEMONIC",
] as const;

const scrubbedEnv = (vars: Record<string, string>): Record<string, string | undefined> => {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const name of MIDNIGHT_ENVS) delete env[name];
  return Object.assign(env, vars);
};

const tempDirs: string[] = [];
const makeTempDir = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), "midnight-blockfrost-token-"));
  tempDirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("explicit Blockfrost token argument", () => {
  test("composes the token into all three Blockfrost URLs", () => {
    expect(defaultMidnightNetworkConfig("preprod", "abc")).toEqual({
      indexer: "https://midnight-preprod.blockfrost.io/api/v0?project_id=abc",
      indexerWS: "wss://midnight-preprod.blockfrost.io/api/v0/ws?project_id=abc",
      node: "https://rpc.midnight-preprod.blockfrost.io?project_id=abc",
      proofServer: "http://127.0.0.1:6300",
      networkId: "preprod",
      genesisWalletSeed: "",
    });
  });

  test("an empty token is no token", () => {
    expect(() => defaultMidnightNetworkConfig("mainnet", "  ")).toThrow(
      "MIDNIGHT_BLOCKFROST_PROJECT_ID",
    );
  });

  test("undeployed ignores the token", () => {
    const config = defaultMidnightNetworkConfig("undeployed", "abc");
    expect(JSON.stringify(config)).not.toContain("abc");
    expect(config.indexer).toBe("http://127.0.0.1:8088/api/v4/graphql");
  });

  test("an unknown network ID refuses even with a token, without quoting it", () => {
    let message = "";
    try {
      defaultMidnightNetworkConfig("future-network", SECRET);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("MIDNIGHT_INDEXER_HTTP");
    expect(message).not.toContain(SECRET);
  });
});

describe("redactBlockfrostProjectId", () => {
  test("hides the token in each Blockfrost URL shape", () => {
    expect({
      indexer: redactBlockfrostProjectId(BLOCKFROST_PREPROD.indexer),
      indexerWS: redactBlockfrostProjectId(BLOCKFROST_PREPROD.indexerWS),
      node: redactBlockfrostProjectId(BLOCKFROST_PREPROD.node),
    }).toEqual({
      indexer: "https://midnight-preprod.blockfrost.io/api/v0?project_id=<redacted>",
      indexerWS: "wss://midnight-preprod.blockfrost.io/api/v0/ws?project_id=<redacted>",
      node: "https://rpc.midnight-preprod.blockfrost.io?project_id=<redacted>",
    });
  });

  test("keeps the other query parameters and redacts every occurrence in a message", () => {
    expect(
      redactBlockfrostProjectId(
        `failed https://h.example/a?x=1&project_id=${SECRET}&y=2 then wss://h.example/b?project_id=${SECRET}`,
      ),
    ).toBe(
      "failed https://h.example/a?x=1&project_id=<redacted>&y=2 then wss://h.example/b?project_id=<redacted>",
    );
  });

  test("leaves URLs without a token unchanged", () => {
    const loopback = "http://127.0.0.1:8088/api/v4/graphql?query=1";
    expect(redactBlockfrostProjectId(loopback)).toBe(loopback);
  });
});

describe("token never printed", () => {
  test("config resolution errors do not quote a token carried by an override URL", async () => {
    const moduleUrl = new URL("../src/midnight-env.ts", import.meta.url).href;
    const probe = Bun.spawn([
      process.execPath,
      "--eval",
      `
        try {
          await import(${JSON.stringify(moduleUrl)});
          console.log(JSON.stringify({ resolved: true }));
        } catch (error) {
          console.log(JSON.stringify({ error: String(error?.message ?? error) }));
        }
      `,
    ], {
      // One URL carries the token by hand; the other two still need a default,
      // and no MIDNIGHT_BLOCKFROST_PROJECT_ID is set.
      env: scrubbedEnv({
        MIDNIGHT_NETWORK_ID: "preprod",
        MIDNIGHT_INDEXER_HTTP: BLOCKFROST_PREPROD.indexer,
      }),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      probe.exited,
      new Response(probe.stdout).text(),
      new Response(probe.stderr).text(),
    ]);
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout.trim().split("\n").at(-1) ?? "{}");
    expect(result.error).toContain("MIDNIGHT_BLOCKFROST_PROJECT_ID");
    expect(result.error).toContain("MIDNIGHT_INDEXER_WS");
    expect(result.error).toContain("MIDNIGHT_NODE_HTTP");
    expect(result.error).not.toContain(SECRET);
    expect(stderr).not.toContain(SECRET);
  });

  test("the wallet-info CLI prints the selected endpoints with the token redacted", async () => {
    // Run from an empty directory so no .env file is loaded, with network
    // access disabled; the endpoint banner is printed before the wallet is
    // built, so the probe stops there.
    const cwd = makeTempDir();
    const preload = path.join(cwd, "no-network.ts");
    writeFileSync(
      preload,
      `globalThis.fetch = () => { throw new Error("network disabled"); };
       globalThis.WebSocket = class { constructor() { throw new Error("network disabled"); } };`,
    );
    const cli = path.resolve(import.meta.dir, "../src/get-wallet-info-cli.ts");
    const probe = Bun.spawn([
      process.execPath,
      "--preload",
      preload,
      cli,
      "--seed",
      "11".repeat(32),
    ], {
      cwd,
      env: scrubbedEnv({
        MIDNIGHT_NETWORK_ID: "preprod",
        MIDNIGHT_BLOCKFROST_PROJECT_ID: SECRET,
      }),
      stdout: "pipe",
      stderr: "pipe",
    });

    let stdout = "";
    const decoder = new TextDecoder();
    const reader = probe.stdout.getReader();
    const deadline = Date.now() + 60_000;
    while (!stdout.includes("Building wallet...") && Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      stdout += decoder.decode(value, { stream: true });
    }
    probe.kill();
    await probe.exited;
    const stderr = await new Response(probe.stderr).text();

    expect(stdout).toContain("Building wallet...");
    expect(stdout).toContain(
      "Indexer: https://midnight-preprod.blockfrost.io/api/v0?project_id=<redacted>",
    );
    expect(stdout).toContain(
      "Indexer WS: wss://midnight-preprod.blockfrost.io/api/v0/ws?project_id=<redacted>",
    );
    expect(stdout).toContain(
      "Node: https://rpc.midnight-preprod.blockfrost.io?project_id=<redacted>",
    );
    expect(stdout).not.toContain(SECRET);
    expect(stderr).not.toContain(SECRET);
  }, 90_000);

  test("deploy logs its endpoints and failures with the token redacted", async () => {
    const baseDir = makeTempDir();
    const contractName = "contract-redaction-probe";
    for (const artifact of ["contract", "compiler"]) {
      mkdirSync(path.join(baseDir, contractName, "src/managed", artifact), { recursive: true });
    }
    // Fails as soon as deployment touches the wallet, with an error that quotes
    // a token-bearing endpoint the way network client errors do.
    const failingWallet = {
      get wallet(): never {
        throw new Error(`cannot reach ${BLOCKFROST_PREPROD.indexerWS}`);
      },
    } as unknown as WalletResult;

    const printed: string[] = [];
    const record = (...args: unknown[]) => {
      printed.push(args.map(String).join(" "));
    };
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      spyOn(console, method).mockImplementation(record)
    );
    const previousPassword = process.env.MIDNIGHT_STORAGE_PASSWORD;
    process.env.MIDNIGHT_STORAGE_PASSWORD = "0123456789abcdef";
    let failure: unknown;
    try {
      await deployMidnightContract(
        { contractName, contractClass: class {}, baseDir },
        { id: "preprod", ...BLOCKFROST_PREPROD, proofServer: "http://127.0.0.1:6300" },
        undefined,
        { walletResult: failingWallet },
      );
    } catch (error) {
      failure = error;
    } finally {
      for (const spy of spies) spy.mockRestore();
      if (previousPassword === undefined) delete process.env.MIDNIGHT_STORAGE_PASSWORD;
      else process.env.MIDNIGHT_STORAGE_PASSWORD = previousPassword;
    }

    expect(failure).toBeInstanceOf(Error);
    const output = printed.join("\n");
    expect(output).toContain(
      "indexerHttp=https://midnight-preprod.blockfrost.io/api/v0?project_id=<redacted>",
    );
    expect(output).toContain(
      "node=https://rpc.midnight-preprod.blockfrost.io?project_id=<redacted>",
    );
    expect(output).toContain(
      "Deployment failed: cannot reach wss://midnight-preprod.blockfrost.io/api/v0/ws?project_id=<redacted>",
    );
    expect(output).not.toContain(SECRET);
  });
});
