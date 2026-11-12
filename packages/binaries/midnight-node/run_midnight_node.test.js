const fs = require("fs");
const os = require("os");
const path = require("path");
const { EventEmitter } = require("events");
const { describe, expect, spyOn, test } = require("bun:test");
const registrations = require("./local-mock.json");
const { main } = require("./index.js");
const {
  COMPATIBILITY_FILE_ENV,
  applyDefaultEnv,
  loadCompatibilityEvidence,
  observeCompatibilityEvidence,
  waitForNodeCompletion,
} = require("./run_midnight_node");

const VERIFIED_SIGNAL =
  "runtime requires function imports which are not present on the host: 'env:ext_ledger_8_bridge_construct_distribute_treasury_system_tx_version_1'";

function writeCompatibility(dir) {
  const compatibilityFile = path.join(dir, "compatibility.json");
  fs.writeFileSync(
    compatibilityFile,
    JSON.stringify({
      schemaVersion: 1,
      node: { version: "2.0.0-rc.4", ledgerGeneration: 9 },
      indexer: { version: "4.4.0-rc.1" },
      cachedChain: {
        policy: "same-ledger-generation-only",
        verifiedIncompatibilitySignal: VERIFIED_SIGNAL,
        projectLocalBasePath: "node_modules/.cache/effectstream/midnight-node",
      },
    }),
  );
  return compatibilityFile;
}

describe("midnight-node 2.x local defaults", () => {
  test("enables the main-chain follower mock with its registrations file", () => {
    const env = applyDefaultEnv({});
    expect(env.USE_MAIN_CHAIN_FOLLOWER_MOCK).toBe("true");
    expect(env.MOCK_REGISTRATIONS_FILE).toEndWith("local-mock.json");
    expect(env.MC__SLOT_DURATION_MILLIS).toBe("1000");
  });

  test("does not override explicit caller settings", () => {
    const env = applyDefaultEnv({
      USE_MAIN_CHAIN_FOLLOWER_MOCK: "false",
      MOCK_REGISTRATIONS_FILE: "/tmp/custom-registrations.json",
      MC__SLOT_DURATION_MILLIS: "2500",
    });
    expect(env.USE_MAIN_CHAIN_FOLLOWER_MOCK).toBe("false");
    expect(env.MOCK_REGISTRATIONS_FILE).toBe("/tmp/custom-registrations.json");
    expect(env.MC__SLOT_DURATION_MILLIS).toBe("2500");
  });

  test("uses the rc.4 local-dev registration contract", () => {
    expect(registrations).toHaveLength(1);
    expect(registrations[0].registrations).toEqual([]);
    expect(registrations[0].permissioned).toHaveLength(1);
    expect(registrations[0].permissioned[0].name).toBe("Alice");
    expect(registrations[0].permissioned[0].registration_utxo).toBe(
      "d3600cf1032b2f147d592332032975bc70aff78f78b5be96e4311c0b0b28d7d6#0",
    );
  });

  test("loads and observes only the declaration-owned exact signal", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "midnight-node-tuple-"));
    try {
      const compatibilityFile = writeCompatibility(dir);
      const evidence = loadCompatibilityEvidence({
        [COMPATIBILITY_FILE_ENV]: compatibilityFile,
        BASE_PATH: "/tmp/project-node-state",
      });

      expect(evidence).not.toBeNull();
      observeCompatibilityEvidence(evidence, VERIFIED_SIGNAL.slice(0, 60));
      expect(evidence.matched).toBe(false);
      observeCompatibilityEvidence(evidence, VERIFIED_SIGNAL.slice(60));
      expect(evidence.matched).toBe(true);
      expect(evidence.statePath).toBe("/tmp/project-node-state");
    } finally {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  });

  test("keeps a known non-matching child exit distinct from incompatibility", async () => {
    const child = new EventEmitter();
    const errors = spyOn(console, "error").mockImplementation(() => {});
    const evidence = {
      compatibility: {
        node: { version: "2.0.0-rc.4", ledgerGeneration: 9 },
      },
      signal: VERIFIED_SIGNAL,
      matched: false,
      statePath: "/tmp/project-node-state",
    };

    try {
      const completion = waitForNodeCompletion(child, { evidence });
      child.emit("close", 42, null);
      expect(await completion).toBe(42);
      const output = errors.mock.calls.flat().join("\n");
      expect(output).toContain("child process exited with nonzero code 42");
      expect(output).toContain("no incompatible-cache classification was made");
      expect(output).not.toContain("verified incompatible cached-chain state");
      expect(output).not.toContain("unknown readiness failure");
    } finally {
      errors.mockRestore();
    }
  });

  test("the top-level CLI propagates exit 1 and classifies the exact signal", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "midnight-node-cli-"));
    const binaryDir = path.join(__dirname, "midnight-node");
    const binaryPath = path.join(binaryDir, "midnight-node");
    const previousCompatibility = process.env[COMPATIBILITY_FILE_ENV];
    const previousBasePath = process.env.BASE_PATH;
    const errors = spyOn(console, "error").mockImplementation(() => {});

    try {
      expect(fs.existsSync(binaryPath)).toBe(false);
      fs.mkdirSync(binaryDir, { recursive: true });
      fs.writeFileSync(
        binaryPath,
        `#!/bin/sh\nprintf '%s\\n' "${VERIFIED_SIGNAL}" >&2\nexit 1\n`,
        { mode: 0o755 },
      );
      process.env[COMPATIBILITY_FILE_ENV] = writeCompatibility(dir);
      process.env.BASE_PATH = "/tmp/project-node-state";

      expect(await main(["--dev"])).toBe(1);
      const output = errors.mock.calls.flat().join("\n");
      expect(output).toContain("verified incompatible cached-chain state");
      expect(output).toContain("node 2.0.0-rc.4 / Ledger 9");
      expect(output).toContain("Observed the exact verified node error");
      expect(output).toContain("/tmp/project-node-state");
      expect(output).toContain("no data is reset automatically");
    } finally {
      errors.mockRestore();
      fs.rmSync(binaryPath, { force: true });
      fs.rmSync(binaryDir, { force: true, recursive: true });
      fs.rmSync(dir, { force: true, recursive: true });
      if (previousCompatibility === undefined) {
        delete process.env[COMPATIBILITY_FILE_ENV];
      } else {
        process.env[COMPATIBILITY_FILE_ENV] = previousCompatibility;
      }
      if (previousBasePath === undefined) {
        delete process.env.BASE_PATH;
      } else {
        process.env.BASE_PATH = previousBasePath;
      }
    }
  });
});
