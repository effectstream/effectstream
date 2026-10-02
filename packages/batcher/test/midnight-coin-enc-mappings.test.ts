// E3 (00050): third-party shielded mints through MidnightAdapter. An input may
// carry `coinEncPublicKeyMappings` ([coinPublicKeyHex, encryptionPublicKeyHex]
// pairs); the adapter then runs the call in a contract-scoped transaction with
// midnight-js `additionalCoinEncPublicKeyMappings`. Inputs without mappings
// keep the historical payload and call path.
import { describe, expect, test } from "bun:test";

import { MidnightAdapter } from "../adapters/midnight-adapter.ts";
import { WorkerPool } from "../adapters/worker-pool.ts";
import {
  MidnightBatchBuilderLogic,
  validateCoinEncPublicKeyMappings,
} from "../batch-data-builder/midnight-builder-logic.ts";
import type { DefaultBatcherInput } from "../core/types.ts";
import {
  formatShieldedAddress,
  shieldedAddressToCoinEncPublicKeyMapping,
} from "@effectstream/midnight-contracts/shielded-address";

const silentLog = { log: () => {}, warn: () => {}, error: () => {} };

const CPK = "0102030405060708091011121314151617181920212223242526272829303132";
const EPK = "a1a2a3a4a5a6a7a8a9b0b1b2b3b4b5b6b7b8b9c0c1c2c3c4c5c6c7c8c9d0d1d2";

const contractInfo = {
  circuits: [
    {
      name: "mint_shielded_to",
      pure: false,
      arguments: [{ name: "amount", type: { "type-name": "Uint", maxval: "18446744073709551615" } }],
      "result-type": { "type-name": "Struct" },
    },
  ],
  witnesses: [],
  contracts: [],
};

function makeInput(body: Record<string, unknown>): DefaultBatcherInput {
  return {
    addressType: 5,
    address: "relayer",
    timestamp: "1",
    input: JSON.stringify(body),
  } as DefaultBatcherInput;
}

function makeAdapter(): any {
  const adapter = Object.create(MidnightAdapter.prototype) as any;
  adapter.log = silentLog;
  adapter.contractInfo = contractInfo;
  adapter.walletSeeds = ["seed"];
  return adapter;
}

describe("coinEncPublicKeyMappings validation (E3)", () => {
  test("absent or a list of lowercase 32-byte hex pairs is valid", () => {
    expect(validateCoinEncPublicKeyMappings(undefined)).toBeNull();
    expect(validateCoinEncPublicKeyMappings([])).toBeNull();
    expect(validateCoinEncPublicKeyMappings([[CPK, EPK]])).toBeNull();
    expect(validateCoinEncPublicKeyMappings([[CPK, EPK], [CPK, EPK]])).toBeNull();
  });

  test("rejects malformed mappings", () => {
    const bad: Array<[unknown, RegExp]> = [
      ["not an array", /must be an array/],
      [{ [CPK]: EPK }, /must be an array/],
      [[CPK, EPK], /\[0\] must be a \[coinPublicKeyHex/],
      [[[CPK]], /\[0\] must be a \[coinPublicKeyHex/],
      [[[CPK, EPK, EPK]], /\[0\] must be a \[coinPublicKeyHex/],
      [[["0x" + CPK.slice(2), EPK]], /\[0\]\[0\] must be a 32-byte coin public key/],
      [[["AB".repeat(32), EPK]], /\[0\]\[0\]/],
      [[[CPK, EPK.toUpperCase()]], /\[0\]\[1\]/],
      [[[CPK.slice(2), EPK]], /\[0\]\[0\]/],
      [[[CPK, 42]], /\[0\]\[1\] must be a 32-byte encryption public key/],
      [[[CPK, EPK + "00"]], /\[0\]\[1\]/],
      [[[CPK, EPK], [CPK, CPK]], /two different encryption keys/],
    ];
    for (const [value, error] of bad) {
      expect(validateCoinEncPublicKeyMappings(value)).toMatch(error);
    }
  });

  test("a pair decoded from a shielded address is a valid mapping", () => {
    const address = formatShieldedAddress(
      { coinPublicKey: CPK, encryptionPublicKey: EPK },
      "undeployed",
    );
    const pair = shieldedAddressToCoinEncPublicKeyMapping(address, "undeployed");
    expect(pair).toEqual([CPK, EPK]);
    expect(validateCoinEncPublicKeyMappings([pair])).toBeNull();
  });

  test("validateInput accepts mapped inputs and rejects bad mappings", () => {
    const adapter = makeAdapter();
    expect(adapter.validateInput(makeInput({ circuit: "mint_shielded_to", args: ["5"] })))
      .toEqual({ valid: true });
    expect(
      adapter.validateInput(
        makeInput({ circuit: "mint_shielded_to", args: ["5"], coinEncPublicKeyMappings: [[CPK, EPK]] }),
      ),
    ).toEqual({ valid: true });
    const rejected = adapter.validateInput(
      makeInput({ circuit: "mint_shielded_to", args: ["5"], coinEncPublicKeyMappings: [["0x00", EPK]] }),
    );
    expect(rejected.valid).toBe(false);
    expect(rejected.error).toMatch(/coinEncPublicKeyMappings\[0\]\[0\]/);
  });
});

describe("the e2e counter's mint_shielded_to input (E3)", () => {
  // contract-info.json entry emitted by compactc 0.33.0-rc.2 for
  // e2e/shared/contracts/midnight/contract-counter (mint_shielded_to).
  const MINT_SHIELDED_TO = JSON.parse(
    '{"name":"mint_shielded_to","pure":false,"proof":true,"arguments":[{"name":"recipient","type":{"type-name":"Struct","name":"Either","elements":[{"name":"is_left","type":{"type-name":"Boolean"}},{"name":"left","type":{"type-name":"Struct","name":"ZswapCoinPublicKey","elements":[{"name":"bytes","type":{"type-name":"Bytes","length":32}}]}},{"name":"right","type":{"type-name":"Struct","name":"ContractAddress","elements":[{"name":"bytes","type":{"type-name":"Bytes","length":32}}]}}]}},{"name":"domain_sep","type":{"type-name":"Bytes","length":32}},{"name":"amount","type":{"type-name":"Uint","maxval":18446744073709551615}},{"name":"nonce","type":{"type-name":"Uint","maxval":340282366920938463463374607431768211455}}],"result-type":{"type-name":"Struct","name":"ShieldedCoinInfo","elements":[{"name":"nonce","type":{"type-name":"Bytes","length":32}},{"name":"color","type":{"type-name":"Bytes","length":32}},{"name":"value","type":{"type-name":"Uint","maxval":340282366920938463463374607431768211455}}]}}',
  );

  test("a recipient Either plus mappings validates and parses", () => {
    const adapter = makeAdapter();
    adapter.contractInfo = { circuits: [MINT_SHIELDED_TO], witnesses: [], contracts: [] };
    const body = {
      circuit: "mint_shielded_to",
      args: [
        { is_left: true, left: { bytes: CPK }, right: { bytes: "00".repeat(32) } },
        "f6".repeat(32),
        "1000",
        "7",
      ],
      coinEncPublicKeyMappings: [[CPK, EPK]],
    };
    expect(adapter.validateInput(makeInput(body))).toEqual({ valid: true });
    const built = new MidnightBatchBuilderLogic().buildBatchData([makeInput(body)])!;
    expect(built.data!.payloads[0].coinEncPublicKeyMappings).toEqual([[CPK, EPK]]);
  });
});

describe("Midnight batch builder with mappings (E3)", () => {
  const builder = new MidnightBatchBuilderLogic();

  test("an input without mappings keeps the historical payload shape", () => {
    const result = builder.buildBatchData([
      makeInput({ circuit: "mint_shielded_to", args: ["5"] }),
    ])!;
    expect(Object.keys(result.data!.payloads[0])).toEqual([
      "circuit",
      "args",
      "addressType",
      "address",
      "signature",
      "timestamp",
    ]);
  });

  test("an empty mapping list is dropped", () => {
    const result = builder.buildBatchData([
      makeInput({ circuit: "mint_shielded_to", args: ["5"], coinEncPublicKeyMappings: [] }),
    ])!;
    expect("coinEncPublicKeyMappings" in result.data!.payloads[0]).toBe(false);
  });

  test("mappings are carried into the payload", () => {
    const result = builder.buildBatchData([
      makeInput({ circuit: "mint_shielded_to", args: ["5"], coinEncPublicKeyMappings: [[CPK, EPK]] }),
    ])!;
    expect(result.data!.payloads[0]).toMatchObject({
      circuit: "mint_shielded_to",
      args: ["5"],
      coinEncPublicKeyMappings: [[CPK, EPK]],
    });
  });
});

describe("MidnightAdapter call path with mappings (E3)", () => {
  test("without mappings the circuit is called directly, as before", async () => {
    const adapter = makeAdapter();
    const calls: unknown[][] = [];
    adapter.deployedContracts = [{
      callTx: {
        mint_shielded_to: async (...args: unknown[]) => {
          calls.push(args);
          return { public: { txHash: "direct" } };
        },
      },
    }];
    adapter.contractProviders = [null];
    expect(await adapter.invokeCallTx(0, "mint_shielded_to", [5n])).toEqual({
      public: { txHash: "direct" },
    });
    expect(await adapter.invokeCallTx(0, "mint_shielded_to", [6n], [])).toEqual({
      public: { txHash: "direct" },
    });
    expect(calls).toEqual([[5n], [6n]]);
  });

  test("with mappings the call runs in a scoped transaction that carries them", async () => {
    const adapter = makeAdapter();
    const seen: { mappings?: ReadonlyMap<string, string>; args?: unknown[] } = {};
    adapter.deployedContracts = [{
      callTx: {
        mint_shielded_to: async (txCtx: any, ...args: unknown[]) => {
          seen.mappings = txCtx.getAdditionalMappings();
          seen.args = args;
          // Stop before proving: the real scope then reports this error.
          throw new Error("stop-after-capture");
        },
      },
    }];
    adapter.contractProviders = [{}];
    const error = await adapter
      .invokeCallTx(0, "mint_shielded_to", [5n], [[CPK, EPK]])
      .catch((e: unknown) => e);
    expect(String(error)).toContain("scoped transaction 'mint_shielded_to'");
    expect(String(error)).toContain("stop-after-capture");
    expect(seen.args).toEqual([5n]);
    expect(seen.mappings).toBeInstanceOf(Map);
    expect([...seen.mappings!]).toEqual([[CPK, EPK]]);
  });

  test("a mapped call without joined providers fails clearly", () => {
    const adapter = makeAdapter();
    adapter.deployedContracts = [{ callTx: { mint_shielded_to: async () => ({}) } }];
    adapter.contractProviders = [null];
    expect(() => adapter.invokeCallTx(0, "mint_shielded_to", [5n], [[CPK, EPK]]))
      .toThrow(/contract providers unavailable/);
  });

  test("submitBatch forwards the payload's mappings to the call", async () => {
    const adapter = makeAdapter();
    adapter.isInitialized = true;
    adapter.initializationPromise = null;
    adapter.pool = new WorkerPool([1]);
    adapter.walletInitialized = [true];
    adapter.walletDustExhausted = [false];
    adapter.walletResults = [{}];
    adapter.lastFundingBalancesPerWallet = [null];
    adapter.callTxTimeoutMs = 5_000;
    adapter.deployedContracts = [{ callTx: {} }];
    adapter.ensureWalletFunds = async () => {};
    adapter.ensureContractJoined = async () => {};
    adapter.logDustState = async () => {};
    adapter.waitForDustAvailability = async () => {};
    const forwarded: unknown[][] = [];
    adapter.invokeCallTx = async (...args: unknown[]) => {
      forwarded.push(args);
      return { public: { txHash: `tx-${forwarded.length}` } };
    };
    adapter.batchBuilderLogic = new MidnightBatchBuilderLogic();
    adapter.inFlightInputKeys = new Set<string>();
    adapter.maxBatchSize = 10_000;

    const mapped = adapter.buildBatchData([
      makeInput({ circuit: "mint_shielded_to", args: ["5"], coinEncPublicKeyMappings: [[CPK, EPK]] }),
    ]);
    expect(await adapter.submitBatch(mapped.data)).toBe("tx-1");
    const plain = adapter.buildBatchData([
      { ...makeInput({ circuit: "mint_shielded_to", args: ["6"] }), timestamp: "2" },
    ]);
    expect(await adapter.submitBatch(plain.data)).toBe("tx-2");

    expect(forwarded).toEqual([
      [0, "mint_shielded_to", [5n], [[CPK, EPK]]],
      [0, "mint_shielded_to", [6n], undefined],
    ]);
  });
});
