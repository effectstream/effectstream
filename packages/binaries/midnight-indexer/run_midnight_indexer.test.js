const fs = require("fs");
const os = require("os");
const path = require("path");
const { EventEmitter } = require("events");

const { describe, expect, spyOn, test } = require("bun:test");
const yaml = require("js-yaml");

const {
  compatibility,
  ensureConfigExists,
  isValidIndexerSecret,
  waitForChildCompletion,
  waitForNodeBlock,
} = require("./run_midnight_indexer");

function fakeChild() {
  return new EventEmitter();
}

function expectRc1Schema(config) {
  expect(config.application.gc_bound).toBe("200ms");
  expect(config.application.ledger_state_retention).toBe(1000);
  expect(config.infra.api.subscription.contract_events.batch_size).toBe(20);
  expect(config.infra.api.subscription.progress_cache.max_capacity).toBe(10000);
  expect(config.infra.api.subscription.progress_cache.time_to_live).toBe("5s");
}

function pinnedBinaryVersion(source) {
  return source.match(/CURRENT_BINARY_VERSION\s*=\s*"v?([^"]+)"/)?.[1];
}

describe("indexer 4.4.0-rc.1 configuration", () => {
  test("the machine-readable compatibility tuple matches binary pins", () => {
    const nodeSource = fs.readFileSync(
      path.join(__dirname, "../midnight-node/binary.js"),
      "utf8",
    );
    const indexerSource = fs.readFileSync(
      path.join(__dirname, "binary.js"),
      "utf8",
    );

    expect(compatibility.node.version).toBe(pinnedBinaryVersion(nodeSource));
    expect(compatibility.indexer.version).toBe(
      pinnedBinaryVersion(indexerSource),
    );
    expect(compatibility.node.ledgerGeneration).toBe(9);
    expect(compatibility.cachedChain.policy).toBe(
      "same-ledger-generation-only",
    );
    expect(compatibility.proofServer.included).toBe(false);
  });

  test("accepts exactly a hex-encoded 32-byte application secret", () => {
    expect(isValidIndexerSecret("ab".repeat(32))).toBe(true);
    expect(isValidIndexerSecret("mysecret")).toBe(false);
    expect(isValidIndexerSecret("ab".repeat(31))).toBe(false);
    expect(isValidIndexerSecret("zz".repeat(32))).toBe(false);
  });

  test("the packaged config contains all required rc.1 subscription fields", () => {
    const config = yaml.load(
      fs.readFileSync(
        path.join(__dirname, "indexer-standalone", "config.yaml"),
        "utf8",
      ),
    );
    expectRc1Schema(config);
  });

  test("a generated config uses the rc.1 schema and caller endpoints", () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), "midnight-indexer-config-"),
    );
    const configPath = path.join(dir, "config.yaml");
    try {
      ensureConfigExists(configPath, {
        LEDGER_NETWORK_ID: "Undeployed",
        SUBSTRATE_NODE_WS_URL: "ws://127.0.0.1:15501",
        APP__INFRA__STORAGE__CNN_URL: "/tmp/indexer.sqlite",
        APP__INFRA__LEDGER_DB__CNN_URL: "/tmp/ledger.sqlite",
        APP__INFRA__API__PORT: "15502",
      });
      const config = yaml.load(fs.readFileSync(configPath, "utf8"));
      expectRc1Schema(config);
      expect(config.application.network_id).toBe("undeployed");
      expect(config.infra.node.url).toBe("ws://127.0.0.1:15501");
      expect(config.infra.api.port).toBe(15502);
    } finally {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });
});

describe("midnight-indexer child completion", () => {
  test("preserves a successful child exit", async () => {
    const child = fakeChild();
    const completed = waitForChildCompletion(child);
    child.emit("exit", 0, null);
    expect(await completed).toBe(0);
  });

  test("propagates a nonzero child exit", async () => {
    const child = fakeChild();
    const completed = waitForChildCompletion(child);
    child.emit("exit", 42, null);
    expect(await completed).toBe(42);
  });

  test("maps a spawn error to a nonzero wrapper result", async () => {
    const child = fakeChild();
    const completed = waitForChildCompletion(child);
    child.emit("error", new Error("ENOENT"));
    expect(await completed).toBe(1);
  });

  test("maps signal termination to a nonzero wrapper result", async () => {
    const child = fakeChild();
    const completed = waitForChildCompletion(child);
    child.emit("exit", null, "SIGTERM");
    expect(await completed).toBe(1);
  });

  test("the binary CLI path preserves an actual native exit 42", async () => {
    const binaryPath = path.join(
      __dirname,
      "indexer-standalone",
      "indexer-standalone",
    );
    const rpcPort = Number(process.env.MIDNIGHT_INDEXER_TEST_RPC_PORT || 18775);
    const rpc = Bun.serve({
      hostname: "127.0.0.1",
      port: rpcPort,
      fetch() {
        return Response.json({
          jsonrpc: "2.0",
          id: 1,
          result: `0x${"12".repeat(32)}`,
        });
      },
    });

    expect(fs.existsSync(binaryPath)).toBe(false);
    fs.writeFileSync(binaryPath, "#!/bin/sh\nexit 42\n", { mode: 0o755 });

    try {
      const { runWithBinary } = require("./index.js");
      const exitCode = await runWithBinary(
        {
          ...process.env,
          APP__INFRA__SECRET: "ab".repeat(32),
          SUBSTRATE_NODE_WS_URL: `ws://127.0.0.1:${rpcPort}`,
        },
        [],
      );

      expect(exitCode).toBe(42);
    } finally {
      fs.rmSync(binaryPath, { force: true });
      rpc.stop(true);
    }
  });
});

describe("node block-one startup guard", () => {
  test("fails with a missing-block-one classification at its bound", async () => {
    const rpcPort = Number(
      process.env.MIDNIGHT_INDEXER_TEST_EMPTY_RPC_PORT || 18776,
    );
    const rpc = Bun.serve({
      hostname: "127.0.0.1",
      port: rpcPort,
      fetch() {
        return Response.json({ jsonrpc: "2.0", id: 1, result: null });
      },
    });
    const errors = spyOn(console, "error").mockImplementation(() => {});

    try {
      const ready = await waitForNodeBlock(
        { SUBSTRATE_NODE_WS_URL: `ws://127.0.0.1:${rpcPort}` },
        { timeoutMs: 20, intervalMs: 5 },
      );
      expect(ready).toBe(false);
      const output = errors.mock.calls.flat().join("\n");
      expect(output).toContain("missing block-one readiness");
      expect(output).toContain("node 2.0.0-rc.4 / Ledger 9");
      expect(output).toContain("no automatic reset is performed");
    } finally {
      errors.mockRestore();
      rpc.stop(true);
    }
  });
});
