import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compactSelection, compactVersion } from "./toolchain/compact";

const templateRoot = import.meta.dir;
const systemPath = "/usr/local/bin:/usr/bin:/bin";
const configMarker = "__EVM_MIDNIGHT_CONFIG__";
const temporaryDirectories: string[] = [];

type ResolvedProcess = {
  name: string;
  dependsOn?: string[];
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function controlledCompact(compilerAvailable: boolean): string {
  const directory = mkdtempSync(join(tmpdir(), "evm-midnight-config-"));
  temporaryDirectories.push(directory);
  const executable = join(directory, "compact");
  writeFileSync(
    executable,
    `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "compact launcher test"
  exit 0
fi
if [ "$1" = "compile" ] && [ "$2" = "${compactSelection}" ] && [ "$3" = "--version" ]; then
  ${compilerAvailable ? 'echo "0.33.0"; exit 0' : 'echo "selection unavailable" >&2; exit 1'}
fi
echo "unexpected compact invocation: $*" >&2
exit 2
`,
  );
  chmodSync(executable, 0o755);
  return `${directory}:${systemPath}`;
}

function loadActualConfig(path: string): ReturnType<typeof spawnSync> {
  return spawnSync(
    process.execPath,
    [
      "-e",
      `const config = (await import("./start.dev.ts")).default; console.log("${configMarker}" + JSON.stringify(config.processes));`,
    ],
    {
      cwd: templateRoot,
      encoding: "utf8",
      env: { ...process.env, PATH: path },
    },
  );
}

function outputOf(result: ReturnType<typeof spawnSync>): string {
  return `${textOf(result.stdout)}${textOf(result.stderr)}`;
}

function textOf(value: string | Uint8Array | null | undefined): string {
  if (typeof value === "string") return value;
  return value ? Buffer.from(value).toString("utf8") : "";
}

function resolvedProcesses(
  result: ReturnType<typeof spawnSync>,
): ResolvedProcess[] {
  expect(result.status, outputOf(result)).toBe(0);
  const stdout = textOf(result.stdout);
  const markerIndex = stdout.lastIndexOf(configMarker);
  expect(markerIndex, stdout).toBeGreaterThanOrEqual(0);
  return JSON.parse(
    stdout.slice(markerIndex + configMarker.length).trim(),
  ) as ResolvedProcess[];
}

describe("EVM/Midnight actual startup config", () => {
  test("missing launcher fails with the template exact-selection diagnostic", () => {
    const result = loadActualConfig(systemPath);
    const output = outputOf(result);

    expect(result.status).not.toBe(0);
    expect(output).toContain("Compact launcher was not found on PATH");
    expect(output).toContain(compactVersion);
    expect(output).toContain("bun toolchain/compact.ts install");
    expect(output).not.toContain("0.31.0");
  });

  test("missing selected compiler fails before graph construction", () => {
    const result = loadActualConfig(controlledCompact(false));
    const output = outputOf(result);

    expect(result.status).not.toBe(0);
    expect(output).toContain(
      `template selection ${compactVersion} is unavailable`,
    );
    expect(output).toContain("bun toolchain/compact.ts install");
    expect(output).not.toContain("0.31.0");
  });

  test("every Midnight process is gated without losing launcher edges", () => {
    const processes = resolvedProcesses(
      loadActualConfig(controlledCompact(true)),
    );
    const byName = new Map(processes.map((process) => [process.name, process]));
    const preflight = "midnight-compact-preflight";
    const midnightProcesses = [
      "midnight-contract-compile",
      "midnight-node",
      "midnight-node-wait",
      "midnight-indexer",
      "midnight-indexer-wait",
      "midnight-proof-server",
      "midnight-proof-server-wait",
      "midnight-contract",
    ];

    for (const name of midnightProcesses) {
      expect(byName.has(name), `${name} must exist`).toBe(true);
      expect(
        byName.get(name)?.dependsOn?.[0],
        `${name} must start after preflight`,
      ).toBe(preflight);
      expect(
        byName
          .get(name)
          ?.dependsOn?.filter((dependency) => dependency === preflight),
      ).toHaveLength(1);
    }

    expect(byName.get("midnight-indexer")?.dependsOn).toContain(
      "midnight-node",
    );
    expect(byName.get("midnight-proof-server")?.dependsOn).toContain(
      "midnight-node",
    );
    expect(byName.get("midnight-node-wait")?.dependsOn).toContain(
      "midnight-node",
    );
    expect(byName.get("midnight-indexer-wait")?.dependsOn).toContain(
      "midnight-indexer",
    );
    expect(byName.get("midnight-proof-server-wait")?.dependsOn).toContain(
      "midnight-proof-server",
    );
    expect(byName.get("midnight-contract")?.dependsOn).toEqual([
      preflight,
      "midnight-node-wait",
      "midnight-indexer-wait",
      "midnight-proof-server-wait",
      "midnight-contract-compile",
    ]);
  });
});
