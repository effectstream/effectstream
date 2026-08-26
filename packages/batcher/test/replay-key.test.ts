// The replay key: "have we already PAID for this spend?".
//
// It is deliberately a different question from "is this the same request?" —
// that one is the requestId, a hash of the full content key. The two must not
// be collapsed, and the reason is an attack:
//
//   the content key includes `target`, which is NOT part of what most wallets
//   sign. Take a signed submission, change its target, resubmit. The requestId
//   changes (so request identity says "new request"), but the signature — the
//   one thing the attacker cannot re-mint — is the same, and the batcher would
//   pay a second time to put the same spend on chain.
//
// So the default key is derived from the signature alone, and is deliberately
// NOT scoped by target: the whole point is to collide across the fields an
// attacker can rewrite.
//
// For Midnight there is no signature to key on — the input IS a transaction, so
// the chain's own identifier for the spend is the key. Its derivation is a pure
// function of a duck-typed transaction and is tested as one, without WASM.

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { defaultReplayKey, resolveReplayKey } from "../core/replay-key.ts";
import {
  __resetReplayKeyDerivationLog,
  midnightReplayKey,
  REPLAY_KEY_FAILURE_LOG_LIMIT,
} from "../adapters/midnight-replay-key.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

const input = (
  overrides: Partial<DefaultBatcherInput> = {},
): DefaultBatcherInput => ({
  addressType: 5,
  address: "addr-1",
  input: JSON.stringify({ tx: "aa".repeat(8) }),
  timestamp: "1754350000000",
  signature: "0xsig-1",
  target: "product-a",
  ...overrides,
});

const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

describe("the default replay key", () => {
  test("is exactly sha256 of the signature — recomputable by anyone", () => {
    // Not a private token: the signature is public on chain (spec Q1), so a
    // client can derive the same key and reason about its own resubmissions.
    expect(defaultReplayKey(input())).toBe(sha256("0xsig-1"));
  });

  test("COLLIDES across every field the signer did not sign", () => {
    // The attack this exists to stop. Same signature, rewritten envelope.
    const original = defaultReplayKey(input({ target: "product-a" }));
    expect(defaultReplayKey(input({ target: "product-b" }))).toBe(original);
    expect(defaultReplayKey(input({ retryCount: 7 }))).toBe(original);
  });

  test("separates genuinely different signatures", () => {
    expect(defaultReplayKey(input({ signature: "0xsig-2" })))
      .not.toBe(defaultReplayKey(input()));
  });

  test("is undefined when there is no signature to key on", () => {
    // No key means no dedup for this input — admitted, not refused. Adapters
    // for signature-less chains supply their own key instead.
    expect(defaultReplayKey(input({ signature: undefined }))).toBeUndefined();
    // An empty signature carries exactly as much replay protection as none.
    expect(defaultReplayKey(input({ signature: "" }))).toBeUndefined();
  });
});

describe("resolving a replay key against an adapter", () => {
  test("an adapter with no hook gets the signature default", () => {
    expect(resolveReplayKey({}, input())).toBe(sha256("0xsig-1"));
    expect(resolveReplayKey(undefined, input())).toBe(sha256("0xsig-1"));
  });

  test("an adapter that implements the hook OVERRIDES the default", () => {
    const adapter = { getReplayKey: () => "adapter-key" };
    expect(resolveReplayKey(adapter, input())).toBe("adapter-key");
  });

  test("an implementing adapter's `undefined` is an ANSWER, not a gap", () => {
    // Falling back to the signature here would re-enable dedup on an input the
    // adapter deliberately declined to dedup — the adapter knows what its
    // payloads mean and the core does not.
    const adapter = { getReplayKey: () => undefined };
    expect(resolveReplayKey(adapter, input())).toBeUndefined();
  });

  test("a hook that throws admits the input instead of failing the accept", () => {
    // Fail-open on purpose: dedup is an optimisation over correctness that the
    // chain already enforces. A broken hook must not turn every submission into
    // a 500.
    const adapter = {
      getReplayKey: () => {
        throw new Error("adapter blew up");
      },
    };
    expect(resolveReplayKey(adapter, input())).toBeUndefined();
  });
});

describe("the Midnight replay key", () => {
  const tx = (
    identifiers?: unknown,
    hash?: unknown,
  ): { identifiers?: () => unknown; transactionHash?: () => unknown } => ({
    ...(identifiers === undefined ? {} : { identifiers: () => identifiers }),
    ...(hash === undefined ? {} : { transactionHash: () => hash }),
  });

  test("two serializations of the same spend collide", () => {
    // The property that makes it a REPLAY key: identifiers survive re-proving
    // and re-serialization, so the same spend arriving twice keys the same.
    expect(midnightReplayKey(tx(["id-a", "id-b"])))
      .toBe(midnightReplayKey(tx(["id-a", "id-b"])));
  });

  test("identifier ORDER does not change the key", () => {
    // `identifiers()` is a set in spirit; the WASM boundary hands back an
    // array, and an ordering difference is not a different spend.
    expect(midnightReplayKey(tx(["id-b", "id-a"])))
      .toBe(midnightReplayKey(tx(["id-a", "id-b"])));
  });

  test("different spends get different keys", () => {
    expect(midnightReplayKey(tx(["id-a"])))
      .not.toBe(midnightReplayKey(tx(["id-b"])));
    // A superset is not the same spend either.
    expect(midnightReplayKey(tx(["id-a", "id-b"])))
      .not.toBe(midnightReplayKey(tx(["id-a"])));
  });

  test("non-string identifiers (bytes from WASM) are still keyed", () => {
    const key = midnightReplayKey(tx([new Uint8Array([1, 2, 3])]));
    expect(typeof key).toBe("string");
    expect(midnightReplayKey(tx([new Uint8Array([1, 2, 3])]))).toBe(key);
    expect(midnightReplayKey(tx([new Uint8Array([1, 2, 4])]))).not.toBe(key);
  });

  test("no identifiers falls back to the transaction hash", () => {
    // A transaction with nothing watchable still has a hash. It is a weaker
    // key (merging changes it) but it is better than no dedup at all.
    const key = midnightReplayKey(tx([], "0xtxhash"));
    expect(key).toBe(midnightReplayKey(tx(undefined, "0xtxhash")));
    expect(key).not.toBeUndefined();
  });

  test("the identifier key and the hash key are different namespaces", () => {
    // Otherwise a transaction whose hash happened to equal another's
    // identifier would be read as a replay of it.
    expect(midnightReplayKey(tx(["0xtxhash"])))
      .not.toBe(midnightReplayKey(tx([], "0xtxhash")));
  });

  test("a transaction that can identify itself in no way yields no key", () => {
    expect(midnightReplayKey({})).toBeUndefined();
    expect(midnightReplayKey(tx([], undefined))).toBeUndefined();
  });

  test("a throwing WASM accessor degrades instead of exploding", () => {
    const exploding = {
      identifiers: () => {
        throw new Error("wasm boundary");
      },
      transactionHash: () => "0xtxhash",
    };
    // identifiers() failed, but the hash is still readable — use it.
    expect(midnightReplayKey(exploding)).toBe(midnightReplayKey(tx([], "0xtxhash")));

    const fullyExploding = {
      identifiers: () => {
        throw new Error("wasm boundary");
      },
      transactionHash: () => {
        throw new Error("wasm boundary");
      },
    };
    expect(midnightReplayKey(fullyExploding)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The receiver.
//
// Every fixture above hands `midnightReplayKey` an object of ARROW functions,
// and an arrow function does not care what it is called on. A wasm-bindgen
// method does: its first act is to read `this.__wbg_ptr`, so calling it
// detached from the transaction throws a TypeError — which the fail-open catch
// then turns into "this spend cannot identify itself". Every real Midnight
// transaction, every shape, silently lost its dedup that way (00020 F-1.10a).
//
// The blind spot was structural, not accidental: the module is duck-typed on
// purpose to keep the 10 MB WASM blob out of these tests, and the one property
// the mocks could not express is the one that broke. So the mock grows a
// receiver — a class with a PRIVATE field, which is the smallest faithful
// stand-in for `this.__wbg_ptr`: read it off a detached call and it throws.
// ---------------------------------------------------------------------------

describe("the Midnight replay key when the accessors need their receiver", () => {
  /** The arrow-function shape every fixture above uses, for comparison. */
  const duckTx = (identifiers?: unknown, hash?: unknown) => ({
    ...(identifiers === undefined ? {} : { identifiers: () => identifiers }),
    ...(hash === undefined ? {} : { transactionHash: () => hash }),
  });

  /** A transaction that, like the real bindings, only works when called ON it. */
  class ReceiverBoundTx {
    readonly #identifiers: unknown[];
    readonly #hash: unknown;

    constructor(identifiers: unknown[], hash?: unknown) {
      this.#identifiers = identifiers;
      this.#hash = hash;
    }

    identifiers(): unknown[] {
      // `this.#identifiers` on a detached call throws exactly as
      // `this.__wbg_ptr` does.
      return this.#identifiers;
    }

    transactionHash(): unknown {
      if (this.#hash === undefined) {
        // What ledger-v8 really does for an unproven transaction: "Transaction
        // hash is available for proven, signed and bound transactions only."
        throw new Error("hash unavailable at this stage");
      }
      return this.#hash;
    }
  }

  test("REGRESSION: a transaction whose accessors read `this` still keys", () => {
    // Red before the fix: `attempt(tx.identifiers)` invoked the method with
    // `this === undefined`, the private-field read threw, and the fail-open
    // catch reported "no key" for a spend that names itself perfectly well.
    const key = midnightReplayKey(new ReceiverBoundTx(["id-a", "id-b"]));
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    // And it is the SAME key the duck-typed fixture produces: binding the
    // receiver changed who the call is made on, not what is hashed.
    expect(key).toBe(midnightReplayKey(duckTx(["id-a", "id-b"])));
  });

  test("the key is stable across instances carrying the same spend", () => {
    // Two deserializations of one transaction are two objects; they must not
    // be two spends.
    expect(midnightReplayKey(new ReceiverBoundTx(["id-a"])))
      .toBe(midnightReplayKey(new ReceiverBoundTx(["id-a"])));
    expect(midnightReplayKey(new ReceiverBoundTx(["id-a"])))
      .not.toBe(midnightReplayKey(new ReceiverBoundTx(["id-b"])));
  });

  test("the hash fallback is reached with its receiver too", () => {
    // Not just `identifiers` — the second accessor is a wasm-bindgen method as
    // well, and losing its receiver would swallow the weaker key the same way.
    expect(midnightReplayKey(new ReceiverBoundTx([], "0xtxhash")))
      .toBe(midnightReplayKey(duckTx([], "0xtxhash")));
  });

  test("a BOUND accessor that genuinely fails still fails OPEN", () => {
    // The point of the fix is not to stop catching — it is to stop MANUFACTURING
    // the failure. A transaction called correctly and still unable to answer
    // (an unproven one has no transaction hash) is admitted without dedup,
    // exactly as before.
    expect(midnightReplayKey(new ReceiverBoundTx([]))).toBeUndefined();

    class UnreadableTx {
      identifiers(): unknown[] {
        throw new Error("wasm boundary");
      }
      transactionHash(): unknown {
        throw new Error("wasm boundary");
      }
    }
    expect(midnightReplayKey(new UnreadableTx())).toBeUndefined();
  });
});

describe("a total derivation failure is not silent", () => {
  // Silence is what let the receiver bug live from Phase 3 to now: every
  // submission lost its dedup and nothing in the log said so. The warning is
  // bounded — once per distinct failure reason, never per call — because the
  // failure mode it exists to catch is systematic, so one line is the whole
  // signal and a line per transaction is just a flood.
  const capture = () => {
    const lines: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    return { lines, restore: () => { console.warn = original; } };
  };

  test("both accessors throwing says so, once", () => {
    __resetReplayKeyDerivationLog();
    const log = capture();
    try {
      const broken = () => ({
        identifiers: () => {
          throw new Error("wasm boundary: this.__wbg_ptr");
        },
        transactionHash: () => {
          throw new Error("wasm boundary: this.__wbg_ptr");
        },
      });
      expect(midnightReplayKey(broken())).toBeUndefined();
      expect(midnightReplayKey(broken())).toBeUndefined();
      expect(midnightReplayKey(broken())).toBeUndefined();
    } finally {
      log.restore();
    }
    // Not three lines, and not zero.
    expect(log.lines.length).toBe(1);
    // It must name the CONSEQUENCE, not just the exception: an operator
    // reading it should know they are paying twice for resubmissions.
    expect(log.lines[0]).toContain("duplicate");
    // …and carry the reason, which is the thing that would have pointed
    // straight at the receiver.
    expect(log.lines[0]).toContain("this.__wbg_ptr");
  });

  test("a DIFFERENT failure reason is still worth one line", () => {
    __resetReplayKeyDerivationLog();
    const log = capture();
    try {
      midnightReplayKey({
        identifiers: () => {
          throw new Error("reason one");
        },
      });
      midnightReplayKey({
        identifiers: () => {
          throw new Error("reason two");
        },
      });
      midnightReplayKey({
        identifiers: () => {
          throw new Error("reason one");
        },
      });
    } finally {
      log.restore();
    }
    expect(log.lines.length).toBe(2);
  });

  test("a transaction that simply has nothing to key on is NOT an error", () => {
    // No accessors at all is the documented duck-typed case — a custom shape
    // the batcher was never able to fingerprint. Warning about it every time
    // would bury the real signal.
    __resetReplayKeyDerivationLog();
    const log = capture();
    try {
      expect(midnightReplayKey({})).toBeUndefined();
      expect(midnightReplayKey({ identifiers: () => [] })).toBeUndefined();
    } finally {
      log.restore();
    }
    expect(log.lines).toEqual([]);
  });

  test("the warning cannot grow without bound", () => {
    __resetReplayKeyDerivationLog();
    const log = capture();
    try {
      for (let i = 0; i < 500; i += 1) {
        midnightReplayKey({
          identifiers: () => {
            throw new Error(`distinct reason ${i}`);
          },
        });
      }
    } finally {
      log.restore();
    }
    // A per-reason set that never stops growing is a leak with a log attached.
    expect(log.lines.length).toBeLessThanOrEqual(REPLAY_KEY_FAILURE_LOG_LIMIT);
    expect(log.lines.length).toBeGreaterThan(0);
  });
});
