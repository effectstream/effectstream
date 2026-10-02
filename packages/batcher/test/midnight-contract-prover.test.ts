// E2 (00050): the contract-circuit prover can differ from the wallet's DUST
// prover. These tests start two local HTTP servers that stand in for the two
// proof servers (each answers 400, so proving stops at the first request) and
// check which one the adapter's midnight-js proofProvider calls.
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

import {
  MidnightAdapter,
  resolveContractProofServerUrl,
} from "../adapters/midnight-adapter.ts";

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
  return {
    url: `http://127.0.0.1:${server.port}`,
    hits,
    stop: () => server.stop(true),
  };
}

function makeUnprovenTransaction() {
  const output = ZswapOutput.new(
    createShieldedCoinInfo("11".repeat(32), 7n),
    0,
    sampleCoinPublicKey(),
    sampleEncryptionPublicKey(),
  );
  return Transaction.fromParts("undeployed", ZswapOffer.fromOutput(output));
}

let dust: FakeProver;
let contract: FakeProver;
let workDir: string;

beforeAll(() => {
  dust = startFakeProver();
  contract = startFakeProver();
  workDir = mkdtempSync(join(tmpdir(), "e00050-prover-"));
  // nodeZkConfigRegistry needs one artifact bundle (keys/ + zkir/).
  mkdirSync(join(workDir, "managed", "contract", "keys"), { recursive: true });
  mkdirSync(join(workDir, "managed", "contract", "zkir"), { recursive: true });
});

afterAll(() => {
  dust.stop();
  contract.stop();
  rmSync(workDir, { recursive: true, force: true });
});

function adapterWith(config: { proofServer: string; contractProofServer?: string }) {
  const adapter = Object.create(MidnightAdapter.prototype) as any;
  adapter.config = {
    ...config,
    zkConfigPath: join(workDir, "managed", "contract"),
    privateStateStoreName: "e00050-prover-test",
  };
  adapter.contractProofServerUrl = resolveContractProofServerUrl(adapter.config);
  adapter.walletResults = [{ zswapSecretKeys: { coinPublicKey: "00".repeat(32) } }];
  adapter.walletProviders = [{}];
  adapter.publicDataProvider = {};
  return adapter;
}

async function proveThrough(adapter: any): Promise<string> {
  const providers = await adapter.createContractProviders(0);
  const error = await providers.proofProvider
    .proveTx(makeUnprovenTransaction())
    .then(() => undefined, (e: unknown) => e);
  expect(error).toBeInstanceOf(Error);
  return String((error as Error).message);
}

describe("MidnightAdapter contract prover (E2)", () => {
  test("contractProofServer defaults to proofServer", () => {
    expect(resolveContractProofServerUrl({ proofServer: "http://p:6300" })).toBe("http://p:6300");
    expect(
      resolveContractProofServerUrl({ proofServer: "http://p:6300", contractProofServer: "" }),
    ).toBe("http://p:6300");
    expect(
      resolveContractProofServerUrl({ proofServer: "http://p:6300", contractProofServer: "  " }),
    ).toBe("http://p:6300");
    expect(
      resolveContractProofServerUrl({
        proofServer: "http://p:6300",
        contractProofServer: "http://c:6301",
      }),
    ).toBe("http://c:6301");
  });

  test("without contractProofServer, contract circuits prove on proofServer (unchanged)", async () => {
    dust.hits.length = 0;
    contract.hits.length = 0;
    const message = await proveThrough(adapterWith({ proofServer: dust.url }));
    expect(message).toContain(dust.url);
    expect(dust.hits.length).toBeGreaterThan(0);
    expect(contract.hits).toEqual([]);
  });

  test("with contractProofServer, contract circuits prove there and not on proofServer", async () => {
    dust.hits.length = 0;
    contract.hits.length = 0;
    const message = await proveThrough(
      adapterWith({ proofServer: dust.url, contractProofServer: contract.url }),
    );
    expect(message).toContain(contract.url);
    expect(contract.hits.length).toBeGreaterThan(0);
    expect(dust.hits).toEqual([]);
  });
});
