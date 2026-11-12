import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildMidnightNodeProcess,
  buildMidnightIndexerWaitProcess,
  MIDNIGHT_COMPATIBILITY_FILE_ENV,
  MidnightNames,
  projectLocalMidnightNodeState,
} from "../scripts/launch-midnight.ts";

const repoRoot = resolve(import.meta.dir, "../../../..");
const BOUNDED_EFFECTSTREAM_WAIT =
  "wait-on --timeout ${MIDNIGHT_INDEXER_WAIT_TIMEOUT_MS:-60000} tcp:${MIDNIGHT_INDEXER_PORT:-8088}";
const BOUNDED_PAIMA_WAIT = `bunx ${BOUNDED_EFFECTSTREAM_WAIT}`;

describe("Midnight startup configuration", () => {
  test("uses one project-local ignored node state directory", () => {
    expect(projectLocalMidnightNodeState("/workspace/contracts-midnight")).toBe(
      "/workspace/contracts-midnight/node_modules/.cache/effectstream/midnight-node",
    );
  });

  test("hands the one installed compatibility declaration to the node wrapper", () => {
    const process = buildMidnightNodeProcess(
      "/workspace/contracts-midnight",
      "@example/contracts-midnight",
      "/workspace/indexer/compatibility.json",
    );

    expect(process.name).toBe(MidnightNames.NODE);
    expect(process.env).toEqual({
      BASE_PATH:
        "/workspace/contracts-midnight/node_modules/.cache/effectstream/midnight-node",
      [MIDNIGHT_COMPATIBILITY_FILE_ENV]:
        "/workspace/indexer/compatibility.json",
    });
    expect(process.critical).toBe(true);
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

  test("0.200.1 templates retain the old launcher's bounded script contract", () => {
    const templates = [
      "templates/evm-midnight-v2",
      "templates/night-bitcoin-v2",
      "templates/zk-cardano",
    ];

    for (const template of templates) {
      const rootManifest = JSON.parse(
        readFileSync(resolve(repoRoot, template, "package.json"), "utf8"),
      );
      const contractsManifest = JSON.parse(
        readFileSync(
          resolve(
            repoRoot,
            template,
            "packages/contracts-midnight/package.json",
          ),
          "utf8",
        ),
      );
      const lock = readFileSync(
        resolve(repoRoot, template, "bun.lock"),
        "utf8",
      );

      expect(rootManifest.dependencies["@effectstream/orchestrator"]).toBe(
        "0.200.1",
      );
      expect(
        contractsManifest.dependencies["@effectstream/npm-midnight-indexer"],
      ).toBe("0.200.1");
      expect(contractsManifest.scripts["midnight-indexer:wait"]).toBe(
        BOUNDED_EFFECTSTREAM_WAIT,
      );
      expect(lock).toContain('"@effectstream/orchestrator@0.200.1"');
      expect(lock).toContain('"@effectstream/npm-midnight-indexer@0.200.1"');
      expect(lock).toContain('"wait-on@8.0.3"');
    }
  });

  test("multi-chain retains its bounded legacy @paimaexample contract", () => {
    const template = resolve(repoRoot, "templates/multi-chain-token-transfer");
    const startSource = readFileSync(
      resolve(template, "packages/client/node/scripts/start.ts"),
      "utf8",
    );
    const nodeManifest = JSON.parse(
      readFileSync(
        resolve(template, "packages/client/node/package.json"),
        "utf8",
      ),
    );
    const contractsManifest = JSON.parse(
      readFileSync(
        resolve(template, "packages/shared/contracts/midnight/package.json"),
        "utf8",
      ),
    );

    expect(startSource).toContain(
      'from "@paimaexample/orchestrator/start-midnight"',
    );
    expect(nodeManifest.dependencies["@paimaexample/orchestrator"]).toBe(
      "0.3.116",
    );
    expect(
      contractsManifest.dependencies["@paimaexample/npm-midnight-indexer"],
    ).toBe("0.3.116");
    expect(contractsManifest.scripts["midnight-indexer:wait"]).toBe(
      BOUNDED_PAIMA_WAIT,
    );
    expect(contractsManifest.dependencies).not.toHaveProperty(
      "@effectstream/npm-midnight-indexer",
    );
    expect(existsSync(resolve(template, "bun.lock"))).toBe(false);
  });
});
