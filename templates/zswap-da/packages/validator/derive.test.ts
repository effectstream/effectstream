import { describe, expect, test } from "bun:test";

import {
  bytesOrStringToHex,
  collectNullifiers,
  collectUnshieldedSpends,
  deriveLegs,
  UnknownTokenTagError,
} from "./derive.ts";

// A valid 32-byte Schnorr verifying key (addressFromKey rejects malformed keys).
const VALID_SVK = "aa".repeat(32);

const shielded = (raw: string) => ({ tag: "shielded" as const, raw });
const unshielded = (raw: string) => ({ tag: "unshielded" as const, raw });
const dust = () => ({ tag: "dust" as const });

// Minimal duck-typed Transaction the derive helpers read.
function mockTx(opts: {
  guaranteed?: any;
  fallible?: Map<number, any>;
  intents?: Map<number, any>;
  imbalances?: Map<number, Map<any, bigint>>;
}) {
  return {
    guaranteedOffer: opts.guaranteed,
    fallibleOffer: opts.fallible,
    intents: opts.intents,
    imbalances(seg: number) {
      return opts.imbalances?.get(seg) ?? new Map();
    },
  } as any;
}

describe("bytesOrStringToHex", () => {
  test("Uint8Array → lowercase hex", () => {
    expect(bytesOrStringToHex(new Uint8Array([0xab, 0x0f]))).toBe("ab0f");
  });
  test("strips 0x and lowercases", () => {
    expect(bytesOrStringToHex("0xABcd")).toBe("abcd");
    expect(bytesOrStringToHex("EE")).toBe("ee");
  });
});

describe("collectNullifiers", () => {
  test("gathers inputs + transients across guaranteed + fallible segments", () => {
    const tx = mockTx({
      guaranteed: {
        inputs: [{ nullifier: new Uint8Array([0x01]) }],
        transients: [{ nullifier: "0x02" }],
      },
      fallible: new Map([
        [1, { inputs: [{ nullifier: "AA" }], transients: [{ nullifier: "bb" }] }],
      ]),
    });
    expect(collectNullifiers(tx).sort()).toEqual(["01", "02", "aa", "bb"]);
  });

  test("empty when no shielded offers", () => {
    expect(collectNullifiers(mockTx({}))).toEqual([]);
  });
});

describe("collectUnshieldedSpends", () => {
  test("derives owner address from the input SVK + intentHash + outputNo", () => {
    const tx = mockTx({
      intents: new Map([
        [
          0,
          {
            guaranteedUnshieldedOffer: {
              inputs: [
                { owner: VALID_SVK, intentHash: "0xDEAD", outputNo: 3 },
              ],
            },
            fallibleUnshieldedOffer: undefined,
          },
        ],
      ]),
    });
    const spends = collectUnshieldedSpends(tx);
    expect(spends).toHaveLength(1);
    expect(spends[0]!.intentHash).toBe("dead");
    expect(spends[0]!.outputNo).toBe(3);
    expect(spends[0]!.owner).toBe(spends[0]!.owner.toLowerCase());
    expect(spends[0]!.owner.length).toBeGreaterThan(0);
  });

  test("empty when no intents", () => {
    expect(collectUnshieldedSpends(mockTx({}))).toEqual([]);
  });
});

describe("deriveLegs", () => {
  test("positive imbalance is a give, negative is a want; dust ignored", () => {
    const tx = mockTx({
      imbalances: new Map([
        [
          0,
          new Map<any, bigint>([
            [unshielded("aabb"), 100n],
            [shielded("ccdd"), -50n],
            [dust(), 999n],
          ]),
        ],
      ]),
    });
    const { gives, wants } = deriveLegs(tx);
    expect(gives).toEqual([{ token: "aabb", amount: "100" }]);
    expect(wants).toEqual([{ token: "ccdd", amount: "50" }]);
  });

  test("merges the same token across segments", () => {
    const tx = mockTx({
      intents: new Map([[1, {}]]),
      imbalances: new Map([
        [0, new Map<any, bigint>([[unshielded("aa"), 30n]])],
        [1, new Map<any, bigint>([[unshielded("aa"), 70n], [shielded("bb"), -10n]])],
      ]),
    });
    const { gives, wants } = deriveLegs(tx);
    expect(gives).toEqual([{ token: "aa", amount: "100" }]);
    expect(wants).toEqual([{ token: "bb", amount: "10" }]);
  });

  test("throws UnknownTokenTagError on an unexpected tag", () => {
    const tx = mockTx({
      imbalances: new Map([
        [0, new Map<any, bigint>([[{ tag: "weird", raw: "00" }, 1n]])],
      ]),
    });
    expect(() => deriveLegs(tx)).toThrow(UnknownTokenTagError);
  });

  test("lowercases token color", () => {
    const tx = mockTx({
      imbalances: new Map([
        [0, new Map<any, bigint>([[unshielded("AABB"), 5n], [shielded("CCDD"), -5n]])],
      ]),
    });
    const { gives, wants } = deriveLegs(tx);
    expect(gives[0]!.token).toBe("aabb");
    expect(wants[0]!.token).toBe("ccdd");
  });
});
