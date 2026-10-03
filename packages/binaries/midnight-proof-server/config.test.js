const { describe, expect, test } = require("bun:test");
const path = require("path");

const {
  DEFAULT_VERSION,
  DEFAULT_PORT,
  MissingProofServerBinaryError,
  assetUrl,
  binaryPath,
  containerNameForPort,
  dockerRunArgs,
  imageRef,
  parseFlags,
  redactDockerArgs,
  resolvePort,
  resolveVersion,
  zipPath,
} = require("./config.js");

describe("proof-server version selection", () => {
  test("defaults to 9.0.0-rc.5, the published binary", () => {
    expect(DEFAULT_VERSION).toBe("9.0.0-rc.5");
    expect(resolveVersion({})).toBe("9.0.0-rc.5");
    expect(resolveVersion({ MIDNIGHT_PROOF_SERVER_VERSION: "" })).toBe("9.0.0-rc.5");
    expect(resolveVersion({ MIDNIGHT_PROOF_SERVER_VERSION: "  " })).toBe("9.0.0-rc.5");
  });

  test("MIDNIGHT_PROOF_SERVER_VERSION selects another version", () => {
    expect(resolveVersion({ MIDNIGHT_PROOF_SERVER_VERSION: "9.0.0-rc.8" })).toBe("9.0.0-rc.8");
    expect(resolveVersion({ MIDNIGHT_PROOF_SERVER_VERSION: " ledger-8.1.0 " })).toBe("ledger-8.1.0");
  });

  test("rejects values that are not a plain version (paths, tags, spaces)", () => {
    for (const bad of ["../x", "9.0.0/rc", "a b", "-rc", "9.0.0@sha256:00"]) {
      expect(() => resolveVersion({ MIDNIGHT_PROOF_SERVER_VERSION: bad })).toThrow(
        /Invalid MIDNIGHT_PROOF_SERVER_VERSION/,
      );
    }
  });

  test("binary cache and download are keyed by version", () => {
    const rc5 = binaryPath("9.0.0-rc.5");
    const rc8 = binaryPath("9.0.0-rc.8");
    expect(rc5).not.toBe(rc8);
    expect(rc5).toBe(path.join(__dirname, "proof-server", "9.0.0-rc.5", "midnight-proof-server"));
    expect(zipPath("9.0.0-rc.5")).not.toBe(zipPath("9.0.0-rc.8"));
  });

  test("the default asset URL is unchanged (binaries release 0.3.120)", () => {
    expect(assetUrl("macos-arm64", DEFAULT_VERSION)).toBe(
      "https://github.com/effectstream/binaries/releases/download/0.3.120/midnight-proof-server-macos-arm64-9.0.0-rc.5.zip",
    );
    expect(assetUrl("linux-amd64", "9.0.0-rc.8")).toBe(
      "https://github.com/effectstream/binaries/releases/download/0.3.120/midnight-proof-server-linux-amd64-9.0.0-rc.8.zip",
    );
  });

  test("the missing-binary error is explicit about the version, release and remedy", () => {
    const error = new MissingProofServerBinaryError({
      version: "9.0.0-rc.8",
      platform: "macos-arm64",
      url: assetUrl("macos-arm64", "9.0.0-rc.8"),
      status: 404,
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("MissingProofServerBinaryError");
    expect(error.message).toContain("No midnight-proof-server 9.0.0-rc.8 binary for macos-arm64");
    expect(error.message).toContain("effectstream/binaries release 0.3.120");
    expect(error.message).toContain("HTTP 404");
    expect(error.message).toContain("--docker");
    expect(error.message).toContain("midnightntwrk/proof-server:9.0.0-rc.8");
    expect(error.message).toContain("MIDNIGHT_CONTRACT_PROOF_SERVER_URL");
  });
});

describe("proof-server port selection", () => {
  test("defaults to 6300", () => {
    expect(DEFAULT_PORT).toBe(6300);
    expect(resolvePort({ env: {} })).toBe(6300);
    expect(resolvePort({ env: { MIDNIGHT_PROOF_SERVER_PORT: "" } })).toBe(6300);
  });

  test("MIDNIGHT_PROOF_SERVER_PORT, then the --port flag", () => {
    expect(resolvePort({ env: { MIDNIGHT_PROOF_SERVER_PORT: "6301" } })).toBe(6301);
    expect(
      resolvePort({ flagPort: "16300", env: { MIDNIGHT_PROOF_SERVER_PORT: "6301" } }),
    ).toBe(16300);
  });

  test("rejects invalid ports", () => {
    for (const bad of ["0", "65536", "abc", "63.5", "-1"]) {
      expect(() => resolvePort({ flagPort: bad, env: {} })).toThrow(/Invalid proof server port/);
    }
    expect(() => resolvePort({ env: { MIDNIGHT_PROOF_SERVER_PORT: "x" } })).toThrow(
      /MIDNIGHT_PROOF_SERVER_PORT/,
    );
  });

  test("parseFlags consumes --port, --port= and -p and keeps every other argument", () => {
    expect(parseFlags(["--port", "6301", "--verbose"])).toMatchObject({
      port: "6301",
      remaining: ["--verbose"],
    });
    expect(parseFlags(["--port=6302"]).port).toBe("6302");
    expect(parseFlags(["-p", "6303", "--docker"])).toMatchObject({
      port: "6303",
      useDocker: true,
      remaining: [],
    });
    expect(parseFlags([]).port).toBeUndefined();
    expect(() => parseFlags(["--port"])).toThrow(/needs a value/);
  });

  test("parseFlags keeps the historical flags", () => {
    expect(
      parseFlags(["--docker", "--binary", "--clean-binaries", "--only-clean", "-h", "x"]),
    ).toEqual({
      useDocker: true,
      useBinary: true,
      cleanBinaries: true,
      onlyClean: true,
      showHelp: true,
      port: undefined,
      remaining: ["x"],
    });
  });
});

describe("proof-server Docker mode", () => {
  test("the default port keeps the historical container name", () => {
    expect(containerNameForPort(6300)).toBe("midnight-proof-server");
  });

  test("another port gets its own container, so rc.8 can run beside rc.5", () => {
    expect(containerNameForPort(6301)).toBe("midnight-proof-server-6301");
    expect(containerNameForPort(6301)).not.toBe(containerNameForPort(6300));
  });

  test("default docker run arguments match the historical command", () => {
    expect(
      dockerRunArgs({ env: { FOO: "bar", EMPTY: "" }, args: [], version: DEFAULT_VERSION, port: 6300 }),
    ).toEqual([
      "run",
      "--name",
      "midnight-proof-server",
      "-p",
      "6300:6300",
      "-e",
      "FOO=bar",
      "-e",
      "PORT=6300",
      "midnightntwrk/proof-server:9.0.0-rc.5",
    ]);
  });

  test("a second version maps its own host port to the image's 6300", () => {
    const args = dockerRunArgs({
      env: {
        PORT: "8080",
        MIDNIGHT_PROOF_SERVER_PORT: "6301",
        MIDNIGHT_PROOF_SERVER_VERSION: "9.0.0-rc.8",
      },
      args: ["--verbose"],
      version: "9.0.0-rc.8",
      port: 6301,
    });
    expect(args).toEqual([
      "run",
      "--name",
      "midnight-proof-server-6301",
      "-p",
      "6301:6300",
      "-e",
      "PORT=6300",
      "midnightntwrk/proof-server:9.0.0-rc.8",
      "--verbose",
    ]);
    expect(imageRef("9.0.0-rc.8")).toBe("midnightntwrk/proof-server:9.0.0-rc.8");
  });
});

describe("docker command logging (E7)", () => {
  test("env values are redacted, keys and other arguments are kept", () => {
    const seed = "5eed".repeat(16);
    const args = dockerRunArgs({
      env: { MIDNIGHT_WALLET_SEED: seed, MIDNIGHT_STORAGE_PASSWORD: "hunter2hunter2", A: "x=y" },
      args: ["--verbose"],
      version: "9.0.0-rc.8",
      port: 6301,
    });
    const printed = redactDockerArgs(args).join(" ");
    expect(printed).not.toContain(seed);
    expect(printed).not.toContain("hunter2hunter2");
    expect(printed).toBe(
      "run --name midnight-proof-server-6301 -p 6301:6300 " +
        "-e MIDNIGHT_WALLET_SEED=<redacted> -e MIDNIGHT_STORAGE_PASSWORD=<redacted> " +
        "-e A=<redacted> -e PORT=<redacted> midnightntwrk/proof-server:9.0.0-rc.8 --verbose",
    );
    // The command that actually runs is unchanged.
    expect(args).toContain(`MIDNIGHT_WALLET_SEED=${seed}`);
  });
});

describe("binary download", () => {
  const { getPlatform } = require("./binary.js");
  const supported = require("./package.json").supportedPlatforms.includes(getPlatform());

  test.if(supported)("a missing release asset raises MissingProofServerBinaryError", async () => {
    const requested = [];
    const get = async (url) => {
      requested.push(url);
      const error = new Error("Request failed with status code 404");
      error.response = { status: 404 };
      throw error;
    };
    // No network: the HTTP client is injected.
    const { binary } = require("./binary.js");
    const error = await binary("9.0.0-rc.8", { http: { get } }).catch((e) => e);
    expect(requested).toEqual([assetUrl(getPlatform(), "9.0.0-rc.8")]);
    expect(error).toBeInstanceOf(MissingProofServerBinaryError);
    expect(error.version).toBe("9.0.0-rc.8");
    expect(error.status).toBe(404);
    expect(error.url).toEndWith(`midnight-proof-server-${getPlatform()}-9.0.0-rc.8.zip`);
  });
});
