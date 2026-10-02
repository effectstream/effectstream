// E2 (00050): MIDNIGHT_CONTRACT_PROOF_SERVER_URL / contractProofServer split
// the contract-circuit prover from the wallet's DUST prover. Defaults keep one
// prover for everything.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Transaction,
  ZswapOffer,
  ZswapOutput,
  createShieldedCoinInfo,
  sampleCoinPublicKey,
  sampleEncryptionPublicKey,
} from "@midnightntwrk/ledger-v9";

import { resolveContractProofServer } from "../src/midnight-env.ts";
import { configureMidnightNodeProviders } from "../src/providers.ts";

type FakeProver = { url: string; hits: string[]; stop: () => void };

function startFakeProver(): FakeProver {
  const hits: string[] = [];
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      hits.push(new URL(req.url).pathname);
      return new Response("fake prover", { status: 400 });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, hits, stop: () => server.stop(true) };
}

let dust: FakeProver;
let contract: FakeProver;
let workDir: string;

beforeAll(() => {
  dust = startFakeProver();
  contract = startFakeProver();
  workDir = mkdtempSync(join(tmpdir(), "e00050-mc-prover-"));
  mkdirSync(join(workDir, "managed", "contract", "keys"), { recursive: true });
  mkdirSync(join(workDir, "managed", "contract", "zkir"), { recursive: true });
});

afterAll(() => {
  dust.stop();
  contract.stop();
  rmSync(workDir, { recursive: true, force: true });
});

async function proveWithProviders(contractProofServer?: string): Promise<string> {
  const keys = { coinPublicKey: "00".repeat(32), encryptionPublicKey: "00".repeat(32) } as any;
  const providers = await configureMidnightNodeProviders(
    {} as any,
    keys,
    keys,
    {} as any,
    {} as any,
    {
      indexer: "http://127.0.0.1:1/api/v4/graphql",
      indexerWS: "ws://127.0.0.1:1/api/v4/graphql/ws",
      node: "http://127.0.0.1:1",
      proofServer: dust.url,
      ...(contractProofServer === undefined ? {} : { contractProofServer }),
    },
    "e00050-mc-prover-test",
    join(workDir, "managed", "contract"),
    {} as any,
  );
  const output = ZswapOutput.new(
    createShieldedCoinInfo("11".repeat(32), 7n),
    0,
    sampleCoinPublicKey(),
    sampleEncryptionPublicKey(),
  );
  const tx = Transaction.fromParts("undeployed", ZswapOffer.fromOutput(output));
  const error = await providers.proofProvider
    .proveTx(tx as any)
    .then(() => undefined, (e: unknown) => e);
  expect(error).toBeInstanceOf(Error);
  return String((error as Error).message);
}

describe("contract prover resolution (E2)", () => {
  test("precedence: explicit, then MIDNIGHT_CONTRACT_PROOF_SERVER_URL, then proofServer", () => {
    expect(resolveContractProofServer("http://dust:6300", undefined, undefined)).toBe(
      "http://dust:6300",
    );
    expect(resolveContractProofServer("http://dust:6300", "", "")).toBe("http://dust:6300");
    expect(resolveContractProofServer("http://dust:6300", undefined, "http://env:6301")).toBe(
      "http://env:6301",
    );
    expect(
      resolveContractProofServer("http://dust:6300", "http://explicit:6302", "http://env:6301"),
    ).toBe("http://explicit:6302");
    expect(resolveContractProofServer("http://dust:6300", "  ", " ")).toBe("http://dust:6300");
  });

  test("configureMidnightNodeProviders proves contracts on proofServer by default", async () => {
    dust.hits.length = 0;
    contract.hits.length = 0;
    expect(await proveWithProviders()).toContain(dust.url);
    expect(dust.hits.length).toBeGreaterThan(0);
    expect(contract.hits).toEqual([]);
  });

  test("configureMidnightNodeProviders proves contracts on contractProofServer when set", async () => {
    dust.hits.length = 0;
    contract.hits.length = 0;
    expect(await proveWithProviders(contract.url)).toContain(contract.url);
    expect(contract.hits.length).toBeGreaterThan(0);
    expect(dust.hits).toEqual([]);
  });
});

describe("MIDNIGHT_CONTRACT_PROOF_SERVER_URL (E2)", () => {
  async function probeEnv(extra: Record<string, string>) {
    const moduleUrl = new URL("../src/midnight-env.ts", import.meta.url).href;
    const probe = Bun.spawn([
      process.execPath,
      "--eval",
      `
        const m = await import(${JSON.stringify(moduleUrl)});
        console.log(JSON.stringify({
          proofServer: m.midnightNetworkConfig.proofServer,
          contractProofServer: m.midnightNetworkConfig.contractProofServer,
          configured: m.isContractProofServerConfigured,
          resolvedDefault: m.resolveContractProofServer(m.midnightNetworkConfig.proofServer),
        }));
      `,
    ], {
      env: {
        ...process.env,
        MIDNIGHT_NETWORK_ID: "undeployed",
        MIDNIGHT_PROOF_SERVER_URL: "",
        MIDNIGHT_PROOF_SERVER: "",
        MIDNIGHT_CONTRACT_PROOF_SERVER_URL: "",
        MIDNIGHT_WALLET_SEED: "",
        MIDNIGHT_WALLET_MNEMONIC: "",
        ...extra,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      probe.exited,
      new Response(probe.stdout).text(),
      new Response(probe.stderr).text(),
    ]);
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    return JSON.parse(stdout);
  }

  test("unset: contractProofServer = proofServer and nothing is marked external", async () => {
    expect(await probeEnv({})).toEqual({
      proofServer: "http://127.0.0.1:6300",
      contractProofServer: "http://127.0.0.1:6300",
      configured: false,
      resolvedDefault: "http://127.0.0.1:6300",
    });
    expect(await probeEnv({ MIDNIGHT_PROOF_SERVER_URL: "http://dust.example:6300" })).toEqual({
      proofServer: "http://dust.example:6300",
      contractProofServer: "http://dust.example:6300",
      configured: false,
      resolvedDefault: "http://dust.example:6300",
    });
  });

  test("set: contracts use it, the wallet keeps proofServer, launchers must not start one", async () => {
    expect(
      await probeEnv({
        MIDNIGHT_PROOF_SERVER_URL: "http://dust.example:6300",
        MIDNIGHT_CONTRACT_PROOF_SERVER_URL: "http://proof-server-rc8:6300",
      }),
    ).toEqual({
      proofServer: "http://dust.example:6300",
      contractProofServer: "http://proof-server-rc8:6300",
      configured: true,
      resolvedDefault: "http://proof-server-rc8:6300",
    });
  });
});
