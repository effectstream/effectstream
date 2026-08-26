import { describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  buildMidnightIndexerWaitProcess,
  MidnightNames,
  projectLocalMidnightNodeState,
  resolveMidnightCompatibilityFile,
} from "../scripts/launch-midnight.ts";

describe("Midnight startup configuration", () => {
  test("uses one project-local ignored node state directory", () => {
    expect(projectLocalMidnightNodeState("/workspace/contracts-midnight")).toBe(
      "/workspace/contracts-midnight/node_modules/.cache/effectstream/midnight-node",
    );
  });

  test("resolves the installed indexer compatibility declaration", () => {
    const project = mkdtempSync(resolve(tmpdir(), "midnight-compatibility-"));
    const scope = resolve(project, "node_modules/@effectstream");
    const indexerPackage = resolve(
      import.meta.dir,
      "../../../binaries/midnight-indexer",
    );

    try {
      mkdirSync(scope, { recursive: true });
      writeFileSync(resolve(project, "package.json"), "{}\n");
      symlinkSync(
        indexerPackage,
        resolve(scope, "npm-midnight-indexer"),
        "dir",
      );

      expect(resolveMidnightCompatibilityFile(project)).toBe(
        resolve(indexerPackage, "compatibility.json"),
      );
    } finally {
      rmSync(project, { force: true, recursive: true });
    }
  });

  test("uses the bounded packaged probe instead of a template wait script", () => {
    const process = buildMidnightIndexerWaitProcess(
      "/workspace/contracts-midnight",
      "/workspace/indexer/compatibility.json",
    );

    expect(process.name).toBe(MidnightNames.INDEXER_WAIT);
    expect(process.waitToExit).toBe(true);
    expect(process.dependsOn).toEqual([MidnightNames.INDEXER]);
    expect(process.args.at(0)).toEndWith("/wait-tcp.ts");
    expect(process.args).toContain("60000");
    expect(process.args).toContain("Midnight indexer");
    expect(process.args).toContain("/workspace/indexer/compatibility.json");
    expect(process.args).not.toContain("midnight-indexer:wait");
  });

  test("Midnight templates no longer expose an unbounded indexer wait script", () => {
    const repoRoot = resolve(import.meta.dir, "../../../..");
    const manifests = [
      "templates/evm-midnight-v2/packages/contracts-midnight/package.json",
      "templates/night-bitcoin-v2/packages/contracts-midnight/package.json",
      "templates/zk-cardano/packages/contracts-midnight/package.json",
      "templates/multi-chain-token-transfer/packages/shared/contracts/midnight/package.json",
    ];

    for (const manifest of manifests) {
      const parsed = JSON.parse(
        readFileSync(resolve(repoRoot, manifest), "utf8"),
      );
      expect(parsed.scripts["midnight-indexer:wait"]).toBeUndefined();
      expect(parsed.scripts["midnight-node:wait"]).toBeString();
      expect(parsed.scripts["midnight-proof-server:wait"]).toBeString();
    }
  });
});
