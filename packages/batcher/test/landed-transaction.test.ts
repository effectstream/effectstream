// FR-3, adapter half: "is this input's spend already on chain?"
//
// The batcher asks; only the adapter can answer, because only it knows what its
// payloads mean. For Midnight the answer is the transaction's own ledger
// identifiers — the ones `getReplayKey` already hashes — because those survive
// the re-proving and merging that change a transaction's hash, and because the
// indexer will take them as a query offset.
//
// The GraphQL in `findLandedMidnightTransaction` was validated against the real
// `midnightntwrk/indexer-standalone:4.3.2` schema: `TransactionOffset` accepts
// `hash` and `identifier`, `RegularTransaction.transactionResult.status` is one
// of SUCCESS | PARTIAL_SUCCESS | FAILURE, and `Transaction.block` is
// non-nullable, so anything the query returns is by construction in a block.

import { describe, expect, test } from "bun:test";
import {
  findLandedMidnightTransaction,
  normalizeMidnightHash,
} from "../adapters/midnight-balancing-adapter.ts";
import { midnightTxIdentifiers } from "../adapters/midnight-replay-key.ts";

interface Seen {
  offset: Record<string, string>;
  query: string;
}

/**
 * A stand-in indexer that answers for the offsets it is told about and returns
 * an empty list for anything else — which is what the real one does.
 */
function fakeIndexer(
  landed: Record<string, unknown>,
  options: { status?: number; body?: unknown; seen?: Seen[] } = {},
) {
  const server = Bun.serve({
    port: 0,
    fetch: async (request) => {
      const body = await request.json() as {
        query: string;
        variables: { offset: Record<string, string> };
      };
      options.seen?.push({ offset: body.variables.offset, query: body.query });
      if (options.status && options.status !== 200) {
        return new Response("no", { status: options.status });
      }
      if (options.body !== undefined) return Response.json(options.body);
      const key = Object.values(body.variables.offset)[0];
      const hit = landed[key];
      return Response.json({ data: { transactions: hit ? [hit] : [] } });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, server };
}

const CONFIRMED = {
  hash: "aa".repeat(32),
  block: { height: 4242 },
  transactionResult: { status: "SUCCESS" },
};

describe("findLandedMidnightTransaction", () => {
  test("an identifier the chain knows resolves to its transaction", async () => {
    const seen: Seen[] = [];
    const { url, server } = fakeIndexer({ deadbeef: CONFIRMED }, { seen });
    try {
      const found = await findLandedMidnightTransaction({
        indexer: url,
        identifiers: ["deadbeef"],
      });

      expect(found).toEqual({
        hash: "aa".repeat(32),
        blockNumber: 4242n,
        status: 1,
      });
      expect(seen[0].offset).toEqual({ identifier: "deadbeef" });
      // The exact query text that the real indexer accepted.
      expect(seen[0].query).toContain("TransactionOffset!");
      expect(seen[0].query).toContain("transactionResult");
    } finally {
      await server.stop(true);
    }
  });

  test("identifiers are tried before the recorded hash", async () => {
    const seen: Seen[] = [];
    const { url, server } = fakeIndexer({}, { seen });
    try {
      await findLandedMidnightTransaction({
        indexer: url,
        identifiers: ["1111", "2222"],
        transactionHash: "cc".repeat(32),
      });

      // Identifiers name THIS input's spend; a hash is what is left when they
      // are unavailable.
      expect(seen.map((s) => s.offset)).toEqual([
        { identifier: "1111" },
        { identifier: "2222" },
        { hash: "cc".repeat(32) },
      ]);
    } finally {
      await server.stop(true);
    }
  });

  test("the recorded hash answers when there are no identifiers", async () => {
    const { url, server } = fakeIndexer({ ["bb".repeat(32)]: CONFIRMED });
    try {
      const found = await findLandedMidnightTransaction({
        indexer: url,
        identifiers: [],
        transactionHash: `0x${"bb".repeat(32)}`,
      });
      expect(found?.blockNumber).toBe(4242n);
    } finally {
      await server.stop(true);
    }
  });

  test("a COMMA-joined batch hash is refused outright", async () => {
    const seen: Seen[] = [];
    const { url, server } = fakeIndexer({ ["bb".repeat(32)]: CONFIRMED }, {
      seen,
    });
    try {
      const found = await findLandedMidnightTransaction({
        indexer: url,
        identifiers: [],
        transactionHash: `${"bb".repeat(32)},${"cc".repeat(32)}`,
      });

      // This is the soundness rule of the whole feature. A batch hash is shared
      // by every input in the batch, so answering a per-input question with it
      // would confirm all of them the moment ANY of them was found — recording
      // a chain verdict for a request the chain never saw.
      expect(found).toBeUndefined();
      expect(seen).toEqual([]);
    } finally {
      await server.stop(true);
    }
  });

  test("a transaction the chain FAILED is reported as failed, not confirmed", async () => {
    const { url, server } = fakeIndexer({
      abcd: { ...CONFIRMED, transactionResult: { status: "FAILURE" } },
    });
    try {
      const found = await findLandedMidnightTransaction({
        indexer: url,
        identifiers: ["abcd"],
      });
      expect(found?.status).toBe(0);
    } finally {
      await server.stop(true);
    }
  });

  test("PARTIAL_SUCCESS is not turned into a failure verdict", async () => {
    const { url, server } = fakeIndexer({
      abcd: { ...CONFIRMED, transactionResult: { status: "PARTIAL_SUCCESS" } },
    });
    try {
      const found = await findLandedMidnightTransaction({
        indexer: url,
        identifiers: ["abcd"],
      });
      // The chain included it. Which segment did what is not something this
      // layer can safely collapse into "your transaction failed".
      expect(found?.status).toBe(1);
    } finally {
      await server.stop(true);
    }
  });

  test("nothing on chain is `undefined`, which means charge as usual", async () => {
    const { url, server } = fakeIndexer({});
    try {
      expect(
        await findLandedMidnightTransaction({
          indexer: url,
          identifiers: ["abcd"],
        }),
      ).toBeUndefined();
    } finally {
      await server.stop(true);
    }
  });

  test("an indexer that errors, or lies, is `undefined` too", async () => {
    const failing = fakeIndexer({}, { status: 503 });
    const garbage = fakeIndexer({}, { body: { data: { transactions: null } } });
    const nonsense = fakeIndexer({}, { body: { errors: [{ message: "no" }] } });
    try {
      for (const indexer of [failing.url, garbage.url, nonsense.url]) {
        expect(
          await findLandedMidnightTransaction({
            indexer,
            identifiers: ["abcd"],
          }),
        ).toBeUndefined();
      }
      // An unreachable indexer is the case that matters most: during the very
      // outage this feature exists for, the check must degrade to today's
      // behaviour rather than to a false confirmation.
      expect(
        await findLandedMidnightTransaction({
          indexer: "http://127.0.0.1:1/graphql",
          identifiers: ["abcd"],
          timeoutMs: 500,
        }),
      ).toBeUndefined();
    } finally {
      await failing.server.stop(true);
      await garbage.server.stop(true);
      await nonsense.server.stop(true);
    }
  });

  test("a transaction with no block is not evidence of anything", async () => {
    const { url, server } = fakeIndexer({
      abcd: { hash: "aa".repeat(32), block: null },
    });
    try {
      expect(
        await findLandedMidnightTransaction({
          indexer: url,
          identifiers: ["abcd"],
        }),
      ).toBeUndefined();
    } finally {
      await server.stop(true);
    }
  });

  test("with nothing to ask about, the indexer is not called at all", async () => {
    const seen: Seen[] = [];
    const { url, server } = fakeIndexer({}, { seen });
    try {
      expect(
        await findLandedMidnightTransaction({ indexer: url, identifiers: [] }),
      ).toBeUndefined();
      expect(seen).toEqual([]);
    } finally {
      await server.stop(true);
    }
  });
});

describe("the identifiers a landed-check can watch for", () => {
  test("a transaction's identifiers come back as bare lowercase hex", () => {
    expect(
      midnightTxIdentifiers({ identifiers: () => ["0xAABB", "ccdd"] }),
    ).toEqual(["aabb", "ccdd"]);
  });

  test("bytes are hex-encoded, and duplicates collapse", () => {
    expect(
      midnightTxIdentifiers({
        identifiers: () => [new Uint8Array([0xde, 0xad]), "dead"],
      }),
    ).toEqual(["dead"]);
  });

  test("anything that is not hex is dropped rather than guessed at", () => {
    // A malformed offset is a query that answers nothing — and "nothing" is
    // exactly what must not be mistaken for "it did not land".
    expect(
      midnightTxIdentifiers({ identifiers: () => ["zzzz", "abc", "", "ab"] }),
    ).toEqual(["ab"]);
  });

  test("a transaction that cannot identify itself yields an empty list", () => {
    expect(midnightTxIdentifiers({})).toEqual([]);
    expect(midnightTxIdentifiers({ identifiers: () => [] })).toEqual([]);
    expect(
      midnightTxIdentifiers({
        identifiers: () => {
          throw new Error("wasm boundary");
        },
      }),
    ).toEqual([]);
  });

  test("an iterable that is not an array still works", () => {
    expect(
      midnightTxIdentifiers({ identifiers: () => new Set(["aa", "bb"]) }),
    ).toEqual(["aa", "bb"]);
  });
});

describe("hash normalization", () => {
  test("the indexer's 64-char hex form is produced from whatever we hold", () => {
    expect(normalizeMidnightHash(`0x${"ab".repeat(32)}`)).toBe("ab".repeat(32));
    expect(normalizeMidnightHash("ABCD")).toBe("abcd".padStart(64, "0"));
    expect(normalizeMidnightHash(`ff${"ab".repeat(32)}`)).toBe("ab".repeat(32));
  });
});
