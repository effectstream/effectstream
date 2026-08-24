const { describe, expect, test } = require("bun:test");
const { runDockerContainer } = require("./docker.js");

const TARGET_REFERENCE = "midnightntwrk/proof-server:9.0.0-rc.5";
const TARGET_IMAGE_ID = "sha256:target-proof-server-image";
const TARGET_IMAGE = {
  reference: TARGET_REFERENCE,
  imageId: TARGET_IMAGE_ID,
};

function makeDockerMock(container) {
  const execFileCalls = [];
  const spawnCalls = [];
  const child = { kind: "mock-child" };
  return {
    execFileCalls,
    spawnCalls,
    child,
    dependencies: {
      execFileAsync: async (command, args) => {
        execFileCalls.push([command, args]);
        if (args[0] === "container" && args[1] === "inspect") {
          return { stdout: JSON.stringify([container]) };
        }
        throw new Error(`Unexpected execFile call: ${command} ${args.join(" ")}`);
      },
      spawn: (command, args, options) => {
        spawnCalls.push([command, args, options]);
        return child;
      },
    },
  };
}

function existingContainer({ reference, imageId, running }) {
  return {
    Name: "/midnight-proof-server",
    Config: { Image: reference },
    Image: imageId,
    State: { Running: running },
  };
}

describe("proof-server Docker container identity", () => {
  test("fails closed for a stopped stale-image container without mutating it", async () => {
    const mock = makeDockerMock(existingContainer({
      reference: "midnightnetwork/proof-server:latest",
      imageId: "sha256:stale",
      running: false,
    }));

    await expect(runDockerContainer(
      {},
      [],
      undefined,
      TARGET_IMAGE,
      mock.dependencies,
    )).rejects.toThrow(
      `expected image reference ${TARGET_REFERENCE} at immutable image ID ${TARGET_IMAGE_ID}`,
    );
    expect(mock.spawnCalls).toEqual([]);
  });

  test("fails closed for a running stale-image container without attaching", async () => {
    const mock = makeDockerMock(existingContainer({
      reference: TARGET_REFERENCE,
      imageId: "sha256:older-image-behind-the-same-tag",
      running: true,
    }));

    await expect(runDockerContainer(
      {},
      [],
      undefined,
      TARGET_IMAGE,
      mock.dependencies,
    )).rejects.toThrow("The wrapper did not attach, start, stop, or remove it");
    expect(mock.spawnCalls).toEqual([]);
  });

  test("reuses an exact-target stopped container with start -a", async () => {
    const mock = makeDockerMock(existingContainer({
      reference: TARGET_REFERENCE,
      imageId: TARGET_IMAGE_ID,
      running: false,
    }));

    const result = await runDockerContainer(
      {},
      [],
      undefined,
      TARGET_IMAGE,
      mock.dependencies,
    );
    expect(result).toBe(mock.child);
    expect(mock.spawnCalls).toEqual([
      ["docker", ["start", "-a", "midnight-proof-server"], { stdio: "inherit" }],
    ]);
  });

  test("reuses an exact-target running container with logs -f", async () => {
    const mock = makeDockerMock(existingContainer({
      reference: TARGET_REFERENCE,
      imageId: TARGET_IMAGE_ID,
      running: true,
    }));

    const result = await runDockerContainer(
      {},
      [],
      undefined,
      TARGET_IMAGE,
      mock.dependencies,
    );
    expect(result).toBe(mock.child);
    expect(mock.spawnCalls).toEqual([
      ["docker", ["logs", "-f", "midnight-proof-server"], { stdio: "inherit" }],
    ]);
  });
});
