import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bech32m } from "@scure/base";
import {
  LedgerState,
  Transaction,
  WellFormedStrictness,
} from "@midnight-ntwrk/ledger-v8";
import { decodeOffer, OFFER_HRP } from "mip-zswap-offer";

import {
  buildStrictness,
  getBlankRefState,
  validateZswapOffer,
} from "./mod.ts";

// A reference state is only consulted in step 5 (wellFormed); steps 1–4 never
// touch it, so the cheap-path tests pass a dummy.
const NO_REF = undefined as unknown as LedgerState;
const TBLOCK = new Date(0);

// Build a syntactically valid bech32m `zswapoffer1…` blob wrapping arbitrary
// bytes (decodeOffer does pure bech32m, so this passes encoding but not
// deserialization).
function craftBlob(byteLen: number): string {
  return bech32m.encode(OFFER_HRP, bech32m.toWords(new Uint8Array(byteLen).fill(7)), false);
}

describe("validateZswapOffer — encoding (step 1)", () => {
  test("non-bech32m string → BAD_ENCODING", () => {
    const r = validateZswapOffer("definitely-not-an-offer", {
      refState: NO_REF,
      tblock: TBLOCK,
      maxBytes: 10_000,
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("BAD_ENCODING");
  });

  test("right HRP but bad checksum → BAD_ENCODING", () => {
    const r = validateZswapOffer(`${OFFER_HRP}1qqqqqzzzz`, {
      refState: NO_REF,
      tblock: TBLOCK,
      maxBytes: 10_000,
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("BAD_ENCODING");
  });
});

describe("validateZswapOffer — size (step 2)", () => {
  test("decoded bytes over maxBytes → TOO_LARGE", () => {
    const r = validateZswapOffer(craftBlob(40), {
      refState: NO_REF,
      tblock: TBLOCK,
      maxBytes: 8,
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("TOO_LARGE");
  });
});

describe("validateZswapOffer — deserialize (step 3)", () => {
  test("valid bech32m of junk bytes → BAD_DESERIALIZE", () => {
    const r = validateZswapOffer(craftBlob(40), {
      refState: NO_REF,
      tblock: TBLOCK,
      maxBytes: 10_000,
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("BAD_DESERIALIZE");
  });
});

describe("config helpers", () => {
  test("buildStrictness sets every flag explicitly (balancing OFF)", () => {
    const s = buildStrictness();
    expect(s.enforceBalancing).toBe(false);
    expect(s.verifyNativeProofs).toBe(true);
    expect(s.verifyContractProofs).toBe(true);
    expect(s.verifySignatures).toBe(true);
    expect((s as unknown as { enforceLimits: boolean }).enforceLimits).toBe(false);
  });

  test("getBlankRefState returns a LedgerState and caches per network id", () => {
    const a = getBlankRefState("undeployed");
    const b = getBlankRefState("undeployed");
    expect(a).toBeInstanceOf(LedgerState);
    expect(a).toBe(b); // cached
  });
});

// ── Cryptographic + liveness path (step 5–6) ──────────────────────────────
//
// These require a REAL proven offer; ZK proofs cannot be synthesized. Drop a
// Lace-made `zswapoffer1…` string into packages/validator/fixtures/valid-offer.bech32
// (and set ZSWAP_TEST_NETWORK_ID if the offer's network is not "undeployed"),
// then these activate automatically. See fixtures/README.md.
const FIXTURE = join(import.meta.dir, "fixtures", "valid-offer.bech32");
const NETWORK_ID = process.env["ZSWAP_TEST_NETWORK_ID"] ?? "undeployed";
const hasFixture = existsSync(FIXTURE);

describe.skipIf(!hasFixture)("validateZswapOffer — crypto + liveness (real fixture)", () => {
  const blob = hasFixture ? readFileSync(FIXTURE, "utf8").trim() : "";
  const opts = () => ({
    refState: getBlankRefState(NETWORK_ID),
    tblock: TBLOCK,
    maxBytes: 1_000_000,
  });

  test("a valid open offer passes with a BLANK refState (the #1 risk)", () => {
    const r = validateZswapOffer(blob, opts());
    expect(r.ok).toBe(true);
    expect(r.gives!.length).toBeGreaterThan(0);
    expect(r.wants!.length).toBeGreaterThan(0);
    // open offer must have at least one spendable input
    expect((r.nullifiers!.length + r.unshieldedSpends!.length)).toBeGreaterThan(0);
  });

  test("enforceBalancing=true rejects the same open offer (proves false is required)", () => {
    const raw = decodeOffer(blob);
    const tx = Transaction.deserialize("signature", "proof", "binding", raw);
    const strict = new WellFormedStrictness();
    strict.enforceBalancing = true;
    strict.verifyNativeProofs = true;
    strict.verifyContractProofs = true;
    strict.verifySignatures = true;
    (strict as unknown as { enforceLimits: boolean }).enforceLimits = true;
    expect(() => tx.wellFormed(getBlankRefState(NETWORK_ID), strict, TBLOCK)).toThrow();
  });

  test("tampered proof bytes are rejected (PROOF_INVALID or BAD_DESERIALIZE)", () => {
    const raw = decodeOffer(blob);
    const tampered = Uint8Array.from(raw);
    // Flip bytes deep in the blob (proof region) to corrupt the ZK proof.
    const at = Math.floor(tampered.length * 0.8);
    tampered[at] = tampered[at]! ^ 0xff;
    const blob2 = bech32m.encode(OFFER_HRP, bech32m.toWords(tampered), false);
    const r = validateZswapOffer(blob2, opts());
    expect(r.ok).toBe(false);
  });

  test("liveness: a spent nullifier → NULLIFIER_SPENT", () => {
    const probe = validateZswapOffer(blob, opts());
    if (!probe.ok || probe.nullifiers!.length === 0) return; // unshielded-only fixture
    const spent = new Set(probe.nullifiers);
    const r = validateZswapOffer(blob, {
      ...opts(),
      isNullifierSpent: (n) => spent.has(n),
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("NULLIFIER_SPENT");
  });

  test("populates inputRoots (33-byte 0x73 hex) on a valid offer", () => {
    const r = validateZswapOffer(blob, opts());
    expect(r.ok).toBe(true);
    expect(r.inputRoots!.length).toBeGreaterThan(0);
    for (const root of r.inputRoots!) {
      expect(root.length).toBe(66);
      expect(root.startsWith("73")).toBe(true);
    }
  });

  test("root-known: accepts when the input root IS known, rejects when not", () => {
    const probe = validateZswapOffer(blob, opts());
    const known = new Set(probe.inputRoots);
    // Known → ok (this is the accept path the always-on check must NOT brick).
    expect(validateZswapOffer(blob, { ...opts(), isKnownRoot: (r) => known.has(r) }).ok).toBe(true);
    // Unknown → ROOT_UNKNOWN.
    const r = validateZswapOffer(blob, { ...opts(), isKnownRoot: () => false });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("ROOT_UNKNOWN");
  });

  test("existence: a never-created unshielded UTXO → UTXO_UNKNOWN (if offer has one)", () => {
    const probe = validateZswapOffer(blob, opts());
    if (!probe.ok || (probe.unshieldedSpends?.length ?? 0) === 0) return; // shielded-only fixture
    const r = validateZswapOffer(blob, { ...opts(), isUnshieldedCreated: () => false });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("UTXO_UNKNOWN");
  });

  test("determinism: identical verdict + roots on repeat", () => {
    const a = validateZswapOffer(blob, opts());
    const b = validateZswapOffer(blob, opts());
    expect(a.ok).toBe(b.ok);
    expect(a.nullifiers).toEqual(b.nullifiers);
    expect(a.inputRoots).toEqual(b.inputRoots);
    expect(a.gives).toEqual(b.gives);
    expect(a.wants).toEqual(b.wants);
  });
});
