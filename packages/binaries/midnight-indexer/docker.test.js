// E7 (00050): the docker command the indexer wrapper prints must not leak
// APP__INFRA__SECRET or any secret from the forwarded environment.
const { describe, expect, test } = require("bun:test");
const { redactDockerArgs } = require("./docker.js");

describe("indexer docker command logging (E7)", () => {
  test("env values are redacted, keys and other arguments are kept", () => {
    const secret = "ab".repeat(32);
    const seed = "5eed".repeat(16);
    const args = [
      "run", "--rm", "-p", "8088:8088",
      "-e", `APP__INFRA__SECRET=${secret}`,
      "-e", `MIDNIGHT_WALLET_SEED=${seed}`,
      "-e", "NO_VALUE",
      "midnightntwrk/indexer-standalone:4.4.0-rc.1", "--flag",
    ];
    const printed = redactDockerArgs(args).join(" ");
    expect(printed).not.toContain(secret);
    expect(printed).not.toContain(seed);
    expect(printed).toBe(
      "run --rm -p 8088:8088 -e APP__INFRA__SECRET=<redacted> " +
        "-e MIDNIGHT_WALLET_SEED=<redacted> -e NO_VALUE " +
        "midnightntwrk/indexer-standalone:4.4.0-rc.1 --flag",
    );
  });
});
