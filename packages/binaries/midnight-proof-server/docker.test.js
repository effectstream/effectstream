const { describe, expect, test } = require("bun:test");
const { EventEmitter } = require("events");
const { runDockerContainer } = require("./docker.js");

const OWNED_ID = "a".repeat(64);
const UNRELATED_ID = "b".repeat(64);

function fakeRuntime() {
  const calls = [];
  const signals = new EventEmitter();
  const child = new EventEmitter();
  child.pid = 43210;
  child.kill = () => {};
  return {
    calls,
    signals,
    child,
    runtime: {
      randomUUID: () => "11111111-2222-4333-8444-555555555555",
      signalEmitter: signals,
      spawn(command, args) {
        calls.push(["spawn", command, ...args]);
        return child;
      },
      async execFile(command, args) {
        calls.push(["execFile", command, ...args]);
        if (args[0] === "create") return { stdout: `${OWNED_ID}\n`, stderr: "" };
        if (args[0] === "inspect") return { stdout: `${OWNED_ID}\n`, stderr: "" };
        return { stdout: "", stderr: "" };
      },
    },
  };
}

describe("proof-server Docker ownership", () => {
  test("creates a unique labeled container and cleans up only its immutable ID", async () => {
    const fake = fakeRuntime();
    const run = await runDockerContainer({}, [], "9.0.0-rc.5", fake.runtime);

    expect(run.ownedContainerId).toBe(OWNED_ID);
    expect(fake.calls[0]).toContain("create");
    expect(fake.calls[0]).toContain("--label");
    expect(fake.calls[0].join(" ")).toContain("effectstream.owner=midnight-proof-server");
    expect(fake.calls).toContainEqual(["spawn", "docker", "start", "-a", OWNED_ID]);

    fake.signals.emit("SIGTERM");
    await run.cleanup;

    expect(fake.calls).toContainEqual([
      "execFile",
      "docker",
      "stop",
      "--timeout",
      "3",
      OWNED_ID,
    ]);
    expect(fake.calls).toContainEqual(["execFile", "docker", "rm", OWNED_ID]);
    expect(fake.calls.flat()).not.toContain(UNRELATED_ID);
  });

  test("a similarly named pre-existing container is never attached or stopped", async () => {
    const fake = fakeRuntime();
    const run = await runDockerContainer({}, [], "9.0.0-rc.5", fake.runtime);
    fake.child.emit("exit", 0, null);
    await run.cleanup;

    const rendered = fake.calls.map((call) => call.join(" ")).join("\n");
    expect(rendered).not.toContain("docker start -a midnight-proof-server");
    expect(rendered).not.toContain(UNRELATED_ID);
    expect(rendered).toContain(`docker rm ${OWNED_ID}`);
  });

  test("invalid create identity is refused and only the unique owned name is removed", async () => {
    const fake = fakeRuntime();
    fake.runtime.execFile = async (command, args) => {
      fake.calls.push(["execFile", command, ...args]);
      if (args[0] === "create") return { stdout: "not-an-id\n", stderr: "" };
      return { stdout: "", stderr: "" };
    };

    await expect(runDockerContainer({}, [], "9.0.0-rc.5", fake.runtime)).rejects.toThrow(
      /invalid immutable container ID/,
    );
    expect(fake.calls.some((call) => call[0] === "spawn")).toBe(false);
    expect(fake.calls).toContainEqual([
      "execFile",
      "docker",
      "rm",
      "midnight-proof-server-11111111-2222-4333-8444-555555555555",
    ]);
  });

  test("a synchronous attach failure removes only the captured immutable ID", async () => {
    const fake = fakeRuntime();
    fake.runtime.spawn = (command, args) => {
      fake.calls.push(["spawn", command, ...args]);
      throw new Error("attach failed");
    };

    await expect(runDockerContainer({}, [], "9.0.0-rc.5", fake.runtime)).rejects.toThrow(
      "attach failed",
    );
    expect(fake.calls).toContainEqual(["execFile", "docker", "rm", OWNED_ID]);
    expect(fake.calls.flat()).not.toContain(UNRELATED_ID);
  });
});
