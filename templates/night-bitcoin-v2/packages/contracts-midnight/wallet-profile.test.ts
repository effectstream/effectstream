import { describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  prepareMidnightGenesis,
  type DockerRunner,
} from "./prepare-midnight-genesis.ts";
import { midnightNodeArgs } from "./start-midnight-node.ts";
import {
  EXPECTED_NIGHT_BALANCE,
  EXPECTED_NIGHT_PER_UTXO,
  EXPECTED_NIGHT_UTXOS,
  FILLER_WALLETS,
  GENESIS_SEEDS,
  assertPrefundingObservation,
  assertUndeployedProfile,
  parseGenesisSeedMap,
} from "./wallet-profile.ts";

const validObservation = () => ({
  walletId: "filler-0",
  nightBalance: EXPECTED_NIGHT_BALANCE,
  nightUtxos: Array.from({ length: EXPECTED_NIGHT_UTXOS }, () => ({
    amount: EXPECTED_NIGHT_PER_UTXO,
    registeredForDustGeneration: true,
  })),
  dustBalance: 1n,
});

function bindSource(args: readonly string[], destination: string): string {
  const suffix = `,dst=${destination}`;
  const mount = args.find(
    (arg) => arg.startsWith("type=bind,src=") && arg.endsWith(suffix),
  );
  if (!mount) throw new Error(`Fake Docker runner did not receive ${destination}`);
  return mount.slice("type=bind,src=".length, -suffix.length);
}

function fakeDockerRunner(calls: string[][]): DockerRunner {
  return (args, options = {}) => {
    calls.push([...args]);
    if (args.includes("generate-genesis")) {
      const output = bindSource(args, "/output");
      writeFileSync(path.join(output, "genesis_state_undeployed.mn"), "state");
      writeFileSync(path.join(output, "genesis_block_undeployed.mn"), "block");
    }
    if (args.includes("build-spec")) {
      if (!options.captureStdout) {
        throw new Error("Chain-spec generation must capture stdout");
      }
      return JSON.stringify({
        id: "midnight_undeployed",
        chainType: "Local",
        bootNodes: [],
      });
    }
    return "";
  };
}

describe("Night-Bitcoin undeployed genesis profile", () => {
  test("preserves the three existing, distinct filler roots", () => {
    expect(FILLER_WALLETS.map(({ seed }) => seed)).toEqual([
      "97be3ee35553d827846c1490bcc571f8a29ffd448912b9f023a7b177de7877c0",
      "97be3ee35553d827846c1490bcc571f8a29ffd448912b9f023a7b177de7877c1",
      "97be3ee35553d827846c1490bcc571f8a29ffd448912b9f023a7b177de7877c2",
    ]);
    expect(new Set(Object.values(GENESIS_SEEDS)).size).toBe(7);
  });

  test("rejects missing, unknown, malformed, and duplicate entries", () => {
    const valid = { ...GENESIS_SEEDS };
    const { "filler-2": _missing, ...missing } = valid;
    expect(() => parseGenesisSeedMap(missing)).toThrow("exactly");
    expect(() => parseGenesisSeedMap({ ...valid, extra: "0".repeat(64) })).toThrow(
      "exactly",
    );
    expect(() =>
      parseGenesisSeedMap({ ...valid, "filler-2": "NOT-A-SEED" }),
    ).toThrow("lowercase hex");
    expect(() =>
      parseGenesisSeedMap({
        ...valid,
        "filler-2": valid["filler-1"],
      }),
    ).toThrow("duplicates");
  });

  test("cannot be selected for a deployed network", () => {
    expect(() => assertUndeployedProfile("undeployed")).not.toThrow();
    expect(() => assertUndeployedProfile("mainnet")).toThrow(
      "valid only on \"undeployed\"",
    );
  });
});

describe("prefunding observation", () => {
  test("accepts exact NIGHT UTXOs with registration and positive DUST", () => {
    expect(() => assertPrefundingObservation(validObservation())).not.toThrow();
  });

  test("rejects wrong UTXO count", () => {
    const observation = validObservation();
    observation.nightUtxos.pop();
    expect(() => assertPrefundingObservation(observation)).toThrow(
      "expected 5 NIGHT UTXOs",
    );
  });

  test("rejects a wrong amount, unregistered UTXO, balance drift, or zero DUST", () => {
    const wrongAmount = validObservation();
    wrongAmount.nightUtxos[0] = {
      amount: 1n,
      registeredForDustGeneration: true,
    };
    expect(() => assertPrefundingObservation(wrongAmount)).toThrow(
      "every NIGHT UTXO",
    );

    const unregistered = validObservation();
    unregistered.nightUtxos[0] = {
      amount: EXPECTED_NIGHT_PER_UTXO,
      registeredForDustGeneration: false,
    };
    expect(() => assertPrefundingObservation(unregistered)).toThrow(
      "registered for DUST",
    );

    expect(() =>
      assertPrefundingObservation({ ...validObservation(), nightBalance: 1n }),
    ).toThrow("expected NIGHT balance");
    expect(() =>
      assertPrefundingObservation({ ...validObservation(), dustBalance: 0n }),
    ).toThrow("positive DUST");
  });
});

describe("custom genesis preparation", () => {
  test("publishes once, verifies the cache, and rejects corruption", async () => {
    const temporary = mkdtempSync(path.join(os.tmpdir(), "night-genesis-test-"));
    const cacheRoot = path.join(temporary, "cache");
    const calls: string[][] = [];
    try {
      const first = await prepareMidnightGenesis({
        cacheRoot,
        dockerRunner: fakeDockerRunner(calls),
      });
      expect(first.cacheHit).toBe(false);
      expect(calls).toHaveLength(3);

      const second = await prepareMidnightGenesis({
        cacheRoot,
        dockerRunner: () => {
          throw new Error("Docker must not run on a verified cache hit");
        },
      });
      expect(second.cacheHit).toBe(true);
      expect(second.chainSpecPath).toBe(first.chainSpecPath);

      writeFileSync(first.chainSpecPath, "{}\n");
      await expect(
        prepareMidnightGenesis({
          cacheRoot,
          dockerRunner: fakeDockerRunner([]),
        }),
      ).rejects.toThrow("artifact checksum mismatch");
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  test("rejects a symlinked cache root", async () => {
    const temporary = mkdtempSync(path.join(os.tmpdir(), "night-genesis-link-"));
    const realCache = path.join(temporary, "real-cache");
    const linkedCache = path.join(temporary, "linked-cache");
    try {
      mkdirSync(realCache);
      symlinkSync(realCache, linkedCache);
      await expect(
        prepareMidnightGenesis({
          cacheRoot: linkedCache,
          dockerRunner: fakeDockerRunner([]),
        }),
      ).rejects.toThrow("unsafe Midnight genesis cache root");
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  test("launch arguments select only the explicit custom chain", () => {
    const args = midnightNodeArgs("/artifacts/chain-spec.json");
    expect(args).toContain("--chain");
    expect(args).toContain("/artifacts/chain-spec.json");
    expect(args).not.toContain("--dev");
    expect(() => midnightNodeArgs("relative-chain.json")).toThrow("absolute");
  });
});
