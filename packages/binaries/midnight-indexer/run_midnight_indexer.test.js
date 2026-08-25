const fs = require("fs");
const os = require("os");
const path = require("path");

const { describe, expect, test } = require("bun:test");
const yaml = require("js-yaml");

const {
  ensureConfigExists,
  isValidIndexerSecret,
} = require("./run_midnight_indexer");

function expectRc1Schema(config) {
  expect(config.application.gc_bound).toBe("200ms");
  expect(config.application.ledger_state_retention).toBe(1000);
  expect(config.infra.api.subscription.contract_events.batch_size).toBe(20);
  expect(config.infra.api.subscription.progress_cache.max_capacity).toBe(10000);
  expect(config.infra.api.subscription.progress_cache.time_to_live).toBe("5s");
}

describe("indexer 4.4.0-rc.1 configuration", () => {
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "midnight-indexer-config-"));
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
