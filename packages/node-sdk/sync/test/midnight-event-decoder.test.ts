import { describe, expect, test } from "bun:test";

import {
  MidnightClient,
  decodeMidnightContractEvent,
} from "../src/sync-protocols/midnight/MidnightClient.ts";

const CONTRACT_ADDRESS = "11".repeat(32);
const TRANSACTION_HASH = "22".repeat(32);
const BLOCK_HASH = "33".repeat(32);
const MAX_U128 = "340282366920938463463374607431768211455";

const eventBase = {
  id: 7,
  maxId: 99,
  version: 1,
  protocolVersion: 2_000_000,
  contractAddress: CONTRACT_ADDRESS,
  transactionId: 13,
  transaction: {
    hash: TRANSACTION_HASH,
    block: { hash: BLOCK_HASH, height: 42 },
  },
  raw: "abcd",
};

const recordedVariants = [
  { ...eventBase, __typename: "ShieldedSpendEvent", nullifier: "01" },
  {
    ...eventBase,
    id: 8,
    __typename: "ShieldedReceiveEvent",
    commitment: "02",
    ciphertext: null,
    receivingContractAddress: CONTRACT_ADDRESS,
  },
  {
    ...eventBase,
    id: 9,
    __typename: "ShieldedMintEvent",
    commitment: "03",
    domainSep: "04",
    shieldedAmount: MAX_U128,
  },
  {
    ...eventBase,
    id: 10,
    __typename: "ShieldedBurnEvent",
    nullifier: "05",
    shieldedAmount: null,
  },
  {
    ...eventBase,
    id: 11,
    __typename: "UnshieldedSpendEvent",
    sender: { kind: "USER", userAddress: "06", contractAddress: null },
    domainSep: "07",
    tokenType: "08",
    amount: MAX_U128,
  },
  {
    ...eventBase,
    id: 12,
    __typename: "UnshieldedReceiveEvent",
    recipient: { kind: "CONTRACT", userAddress: null, contractAddress: "09" },
    domainSep: "0a",
    tokenType: "0b",
    amount: "2",
  },
  {
    ...eventBase,
    id: 13,
    __typename: "UnshieldedMintEvent",
    domainSep: "0c",
    tokenType: "0d",
    amount: "3",
  },
  {
    ...eventBase,
    id: 14,
    __typename: "UnshieldedBurnEvent",
    sender: { kind: "CONTRACT", userAddress: null, contractAddress: "0e" },
    tokenType: "0f",
    amount: "4",
  },
  { ...eventBase, id: 15, __typename: "PausedEvent" },
  { ...eventBase, id: 16, __typename: "UnpausedEvent" },
  {
    ...eventBase,
    id: 17,
    __typename: "MiscContractEvent",
    name: "10",
    payload: "11",
  },
] as const;

const block = {
  hash: BLOCK_HASH,
  height: 42,
  protocolVersion: 2_000_000,
  timestamp: 1_765_000_000,
  parent: { hash: "44".repeat(32) },
  transactions: [],
};

async function captureQuery<T>(
  data: unknown,
  run: (readQuery: () => string) => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  let query: string | undefined;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { query?: unknown };
    query = typeof body.query === "string" ? body.query : undefined;
    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    return await run(() => {
      if (query === undefined) throw new Error("test fetch did not capture a GraphQL query");
      return query;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

describe("Midnight API-v4 contract-event decoding", () => {
  test("decodes all concrete variants and preserves large decimal strings", () => {
    const decoded = recordedVariants.map(decodeMidnightContractEvent);

    expect(decoded.map((event) => event.eventType)).toEqual([
      "ShieldedSpend",
      "ShieldedReceive",
      "ShieldedMint",
      "ShieldedBurn",
      "UnshieldedSpend",
      "UnshieldedReceive",
      "UnshieldedMint",
      "UnshieldedBurn",
      "Paused",
      "Unpaused",
      "Misc",
    ]);
    expect(decoded[0]).toMatchObject({
      protocolVersion: 2_000_000,
      transactionId: 13,
      transactionHash: TRANSACTION_HASH,
      blockHash: BLOCK_HASH,
      blockHeight: 42,
      contractAddress: CONTRACT_ADDRESS,
      raw: "abcd",
    });
    expect(decoded[1]).toMatchObject({
      eventType: "ShieldedReceive",
      ciphertext: undefined,
      receivingContractAddress: CONTRACT_ADDRESS,
    });
    expect(decoded[2]).toMatchObject({ eventType: "ShieldedMint", amount: MAX_U128 });
    expect(typeof (decoded[2] as { amount?: unknown }).amount).toBe("string");
    expect(decoded[3]).toMatchObject({ eventType: "ShieldedBurn", amount: undefined });
    expect(decoded[4]).toMatchObject({
      eventType: "UnshieldedSpend",
      sender: { kind: "user", value: "06" },
      amount: MAX_U128,
    });
    expect(decoded[5]).toMatchObject({
      eventType: "UnshieldedReceive",
      recipient: { kind: "contract", value: "09" },
    });
  });

  test("requires the explicit v4 gate and a bounded contract-address filter", async () => {
    const client = new MidnightClient("http://indexer.invalid/api/v4/graphql");
    const unpaused = recordedVariants[9];

    await captureQuery({ block, contractEvents: [unpaused] }, async (readQuery) => {
      const result = await client.fetchBlock(42, {
        contractEvents: {
          apiVersion: 4,
          contractAddress: `0x${CONTRACT_ADDRESS}`,
          types: ["Unpaused"],
        },
      });
      expect(result.contractEvents).toHaveLength(1);
      expect(result.contractEvents?.[0]).toMatchObject({ eventType: "Unpaused", blockHeight: 42 });

      const query = readQuery();
      expect(query).toContain("contractEvents(filter:");
      expect(query).toContain(`contractAddress: \"${CONTRACT_ADDRESS}\"`);
      expect(query).toContain("fromBlock: 42");
      expect(query).toContain("toBlock: 42 types: [UNPAUSED]");
      expect(query).toContain("__typename");
      expect(query).toContain("protocolVersion");
      expect(query).toContain("transaction { hash block { hash height } }");
      expect(query).toContain("... on MiscContractEvent { name payload }");
    });

    await expect(
      client.fetchBlock(42, {
        contractEvents: { apiVersion: 4, contractAddress: "" },
      }),
    ).rejects.toThrow("requires one 32-byte contract address");
    await expect(
      client.fetchBlock(42, {
        contractEvents: {
          apiVersion: 3 as 4,
          contractAddress: CONTRACT_ADDRESS,
        },
      }),
    ).rejects.toThrow("explicit API-v4 feature gate");
    await expect(
      client.fetchBlock(42, {
        contractEvents: {
          apiVersion: 4,
          contractAddress: CONTRACT_ADDRESS,
          types: [],
        },
      }),
    ).rejects.toThrow("types cannot be empty");
  });

  test("keeps the existing API-v3 block query byte-for-byte unchanged when disabled", async () => {
    const client = new MidnightClient("http://indexer.invalid/api/v3/graphql");
    const expectedQuery = `query {
      block(offset: { height: 42 }) {
        hash
        height
        protocolVersion
        timestamp
        parent {
          hash
        }
        transactions {
          hash
          contractActions { address state }
          zswapLedgerEvents { id raw maxId }
${"          "}
${"          "}
${"          "}
${"          "}
        }
      }
    }`;

    await captureQuery({ block }, async (readQuery) => {
      const result = await client.fetchBlock(42);
      expect(result).toEqual({ block });
      expect(readQuery()).toBe(expectedQuery);
      expect(readQuery()).not.toContain("contractEvents");
    });
  });

  test("fails fast on unknown variants and malformed required fields", () => {
    expect(() =>
      decodeMidnightContractEvent({ ...eventBase, __typename: "FutureEvent" }),
    ).toThrow("Unsupported Midnight contract event typename: FutureEvent");
    expect(() =>
      decodeMidnightContractEvent({
        ...eventBase,
        __typename: "ShieldedSpendEvent",
        nullifier: null,
      }),
    ).toThrow("ShieldedSpendEvent.nullifier");
    expect(() =>
      decodeMidnightContractEvent({
        ...eventBase,
        __typename: "UnshieldedMintEvent",
        domainSep: "01",
        tokenType: "02",
        amount: 9_007_199_254_740_993,
      }),
    ).toThrow("UnshieldedMintEvent.amount");
    expect(() =>
      decodeMidnightContractEvent({
        ...eventBase,
        __typename: "UnshieldedReceiveEvent",
        recipient: { kind: "FUTURE", userAddress: "03" },
        domainSep: "04",
        tokenType: "05",
        amount: "6",
      }),
    ).toThrow("Unsupported Midnight event address kind");
    expect(() =>
      decodeMidnightContractEvent({
        ...eventBase,
        transaction: { hash: TRANSACTION_HASH },
        __typename: "PausedEvent",
      }),
    ).toThrow("PausedEvent.transaction.block");
  });
});
