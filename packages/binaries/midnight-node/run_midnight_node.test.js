const { describe, expect, test } = require("bun:test");
const registrations = require("./local-mock.json");
const { applyDefaultEnv } = require("./run_midnight_node");

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
    expect(env.MOCK_REGISTRATIONS_FILE).toBe(
      "/tmp/custom-registrations.json",
    );
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
});
