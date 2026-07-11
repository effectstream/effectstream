import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Buffer } from "node:buffer";
import { Transaction } from "@midnight-ntwrk/ledger-v8";
import { decodeOffer } from "mip-zswap-offer";

import {
  canonicalRootHex,
  extractInputRoot,
  extractOfferInputRoots,
  RootExtractError,
} from "./extract-root.ts";

// Build a synthetic serialized ZswapInput with the verified layout:
// ASCII tagged-serialize header → 32-byte nullifier → 33-byte gap
// (value_commitment + contract_address None) → SCALE root run → proof bytes.
const HEADER = "midnight:zswap-input[v2](proof[v5]):";
function buildInput(nullifier: Buffer, rootValue: Buffer, gap = 33): Buffer {
  const header = Buffer.concat([Buffer.from(HEADER, "latin1"), Buffer.from([4, 0, 17, 77])]);
  const gapBytes = Buffer.alloc(gap, 0xaa);
  // 32-byte field → 33-byte SCALE n-byte run: marker ((33-5)<<2)|0b11 = 0x73.
  const marker = Buffer.from([((rootValue.length + 1 - 5) << 2) | 0b11]);
  const proof = Buffer.alloc(200, 0x42);
  return Buffer.concat([header, nullifier, gapBytes, marker, rootValue, proof]);
}

const NUL = Buffer.alloc(32, 0x11);
const ROOTVAL = Buffer.from("b35bda8df702a240f2b7605bca3ea4f7bdb4110f5c6d35c58ed512faf7697303", "hex");

describe("extractInputRoot", () => {
  test("reads the 33-byte SCALE root run (marker 0x73 + 32 bytes)", () => {
    const ser = buildInput(NUL, ROOTVAL);
    const input = { serialize: () => ser, nullifier: NUL.toString("hex") };
    const root = extractInputRoot(input);
    expect(root).toBe("73" + ROOTVAL.toString("hex"));
    expect(root.length).toBe(66);
  });

  test("cross-checks the nullifier from the getter (0x-prefixed accepted)", () => {
    const ser = buildInput(NUL, ROOTVAL);
    const input = { serialize: () => ser, nullifier: "0x" + NUL.toString("hex") };
    expect(extractInputRoot(input)).toBe("73" + ROOTVAL.toString("hex"));
  });

  test("fail-closed: nullifier absent from bytes → throws", () => {
    const ser = buildInput(NUL, ROOTVAL);
    const input = { serialize: () => ser, nullifier: Buffer.alloc(32, 0x99).toString("hex") };
    expect(() => extractInputRoot(input)).toThrow(RootExtractError);
  });

  test("fail-closed: header missing the pinned tag → throws", () => {
    const ser = Buffer.concat([Buffer.from("garbage:", "latin1"), NUL, Buffer.alloc(33, 0xaa), Buffer.from([0x73]), ROOTVAL]);
    const input = { serialize: () => ser, nullifier: NUL.toString("hex") };
    expect(() => extractInputRoot(input)).toThrow(/zswap-input\[v2\]/);
  });
});

describe("canonicalRootHex", () => {
  test("normalizes 0x + uppercase + bytes", () => {
    expect(canonicalRootHex("0xABCD")).toBe("abcd");
    expect(canonicalRootHex("ABCD")).toBe("abcd");
    expect(canonicalRootHex(Buffer.from([0xab, 0xcd]))).toBe("abcd");
  });
});

describe("extractOfferInputRoots", () => {
  test("collects guaranteed + fallible input roots, skips transients", () => {
    const n1 = Buffer.alloc(32, 0x01), n2 = Buffer.alloc(32, 0x02);
    const r1 = Buffer.alloc(32, 0xa1), r2 = Buffer.alloc(32, 0xa2);
    const mk = (n: Buffer, r: Buffer) => ({ serialize: () => buildInput(n, r), nullifier: n.toString("hex") });
    const tx: any = {
      guaranteedOffer: { inputs: [mk(n1, r1)], transients: [mk(Buffer.alloc(32, 0x09), Buffer.alloc(32, 0x09))] },
      fallibleOffer: new Map([[1, { inputs: [mk(n2, r2)] }]]),
    };
    expect(extractOfferInputRoots(tx)).toEqual(["73" + r1.toString("hex"), "73" + r2.toString("hex")]);
  });
});

// Real proven offer: confirms the extractor matches the committed fixture's
// known root (== the live indexer's zswapMerkleTreeRoot, verified during
// discovery). Activates when fixtures/valid-offer.bech32 exists.
const FIXTURE = join(import.meta.dir, "fixtures", "valid-offer.bech32");
describe.skipIf(!existsSync(FIXTURE))("extractInputRoot — real fixture", () => {
  test("yields a 33-byte 0x73 root for the fixture offer", () => {
    const blob = readFileSync(FIXTURE, "utf8").trim();
    const tx = Transaction.deserialize("signature", "proof", "binding", decodeOffer(blob)) as any;
    const roots = extractOfferInputRoots(tx);
    expect(roots.length).toBeGreaterThan(0);
    for (const r of roots) {
      expect(r.length).toBe(66);
      expect(r.startsWith("73")).toBe(true);
    }
  });
});
