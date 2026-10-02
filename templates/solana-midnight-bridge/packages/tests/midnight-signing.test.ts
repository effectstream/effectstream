// Native unit tests (no chain, no ports) for the Midnight signing path:
// the mint digest through the compiled contract's pure circuit, the operator's
// Ed25519 signature and its circuit encoding, the network tag, and the
// batcher's parsing of the raw 0.35.0 contract info (engine E8, questions-file Q16).
//
// Needs the compiled contract: `bun run --filter @solana-midnight-bridge/contracts-midnight compile`.
//
// Run: bun test ./midnight-signing.test.ts
import { describe, expect, test } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import nacl from "tweetnacl";
import { parseCircuitArgs } from "@effectstream/batcher-sdk";
import {
  ED25519_L,
  MINT_MESSAGE_PREFIX,
  bytesToHex,
  decodeEd25519Signature,
  ed25519PointFromBytes,
  mintArgsJson,
  mintDigest,
  mintMessage,
  networkTagFor,
  operatorKeyFromSolanaPublicKey,
  readContractInfo,
  shieldedRecipient,
  signMint,
  tokenColor,
  verifyMintSignature,
  type MintAuthorization,
} from "@solana-midnight-bridge/contracts-midnight";

const rnd = (n: number) => new Uint8Array(randomBytes(n));
const sha256 = (s: string) => new Uint8Array(createHash("sha256").update(s).digest());

const operator = nacl.sign.keyPair();
const base: MintAuthorization = {
  contractAddress: rnd(32),
  networkTag: networkTagFor("undeployed"),
  lockNonce: 7n,
  recipient: shieldedRecipient(rnd(32)),
  amount: 10_000_000n,
};

describe("network tag and operator key", () => {
  test("networkTagFor = sha256('midnight:<id>'), the value P0 S1/S2 deployed with", () => {
    // p0/s2/payloads.json: the S1 contract's sealed networkTag.
    expect(bytesToHex(networkTagFor("undeployed"))).toBe(
      "c3a7d1a422e45906240064d53c5b9570f43edb734ce665aa01563f614dc7ad8f",
    );
    expect(bytesToHex(networkTagFor("stagenet"))).toBe(bytesToHex(sha256("midnight:stagenet")));
    expect(bytesToHex(networkTagFor("stagenet"))).not.toBe(bytesToHex(networkTagFor("undeployed")));
  });

  test("operator key point equals the one the S1 contract sealed on chain", () => {
    // S1's throwaway operator (public label-derived) and its sealed operatorKey (p0/s2/payloads.json).
    const s1 = nacl.sign.keyPair.fromSeed(sha256("e00050 S1 throwaway operator ed25519 key"));
    const p = operatorKeyFromSolanaPublicKey(s1.publicKey);
    expect(p.x.toString()).toBe("50087795020505605798482810850979986636267271374380613869845015634089425188765");
    expect(p.y.toString()).toBe("7551062098947779119989329979174326363827073095372262107980523282835112377933");
  });

  test("strict point decoding refuses the identity, small-order and malformed points", () => {
    const identity = new Uint8Array(32);
    identity[0] = 1; // y = 1, x = 0
    expect(() => ed25519PointFromBytes(identity)).toThrow(/prime-order/);
    // (x = 0, y = -1): order 2
    const order2 = Uint8Array.from(Buffer.from("ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f", "hex"));
    expect(() => ed25519PointFromBytes(order2)).toThrow(/prime-order|not a valid/);
    expect(() => ed25519PointFromBytes(new Uint8Array(31))).toThrow(/32 bytes/);
    const notOnCurve = new Uint8Array(32).fill(0xff);
    expect(() => ed25519PointFromBytes(notOnCurve)).toThrow();
  });
});

describe("mint digest and message", () => {
  test("digest comes from the contract's pure circuit: 32 bytes, deterministic", () => {
    const d1 = mintDigest(base);
    const d2 = mintDigest({ ...base, recipient: shieldedRecipient(base.recipient.left.bytes) });
    expect(d1.length).toBe(32);
    expect(bytesToHex(d1)).toBe(bytesToHex(d2));
  });

  test("every bound field changes the digest", () => {
    const d = bytesToHex(mintDigest(base));
    const variants: MintAuthorization[] = [
      { ...base, contractAddress: rnd(32) },
      { ...base, networkTag: networkTagFor("stagenet") },
      { ...base, lockNonce: base.lockNonce + 1n },
      { ...base, recipient: shieldedRecipient(rnd(32)) },
      { ...base, amount: base.amount + 1n },
    ];
    for (const v of variants) expect(bytesToHex(mintDigest(v))).not.toBe(d);
  });

  test("message is 'SMBRDG1:' ‖ digest (40 bytes)", () => {
    const m = mintMessage(base);
    expect(m.length).toBe(40);
    expect(Buffer.from(m.subarray(0, 8)).toString("utf8")).toBe("SMBRDG1:");
    expect(bytesToHex(m.subarray(0, 8))).toBe(bytesToHex(MINT_MESSAGE_PREFIX));
    expect(bytesToHex(m.subarray(8))).toBe(bytesToHex(mintDigest(base)));
  });
});

describe("operator signature", () => {
  test("signMint signs with the Solana keypair format and pre-checks", () => {
    const { message, signature, sig } = signMint(operator.secretKey, base);
    expect(nacl.sign.detached.verify(message, signature, operator.publicKey)).toBe(true);
    expect(verifyMintSignature(operator.publicKey, base, signature)).toBe(true);
    expect(sig.s < ED25519_L).toBe(true);
    // R decodes to the same point the circuit receives.
    expect(sig.r).toEqual(ed25519PointFromBytes(signature.subarray(0, 32)));
  });

  test("a signature does not verify for other arguments or another key", () => {
    const { signature } = signMint(operator.secretKey, base);
    expect(verifyMintSignature(operator.publicKey, { ...base, amount: 1n }, signature)).toBe(false);
    expect(verifyMintSignature(operator.publicKey, { ...base, contractAddress: rnd(32) }, signature)).toBe(false);
    expect(verifyMintSignature(nacl.sign.keyPair().publicKey, base, signature)).toBe(false);
  });

  test("s >= L is refused (non-canonical signature)", () => {
    const { signature } = signMint(operator.secretKey, base);
    const bad = Uint8Array.from(signature);
    let l = ED25519_L;
    for (let i = 32; i < 64; i++) {
      bad[i] = Number(l & 0xffn);
      l >>= 8n;
    }
    expect(() => decodeEd25519Signature(bad)).toThrow(/s >= L/);
    expect(() => decodeEd25519Signature(signature.subarray(0, 63))).toThrow(/64 bytes/);
  });

  test("a wrong-length secret key is refused", () => {
    expect(() => signMint(operator.secretKey.subarray(0, 32), base)).toThrow(/64 bytes/);
  });
});

describe("token colour", () => {
  test("colour is per (mint, contract)", () => {
    const mint = rnd(32);
    const a = rnd(32);
    const c = tokenColor(mint, a);
    expect(c.length).toBe(32);
    expect(bytesToHex(tokenColor(mint, a))).toBe(bytesToHex(c));
    expect(bytesToHex(tokenColor(mint, rnd(32)))).not.toBe(bytesToHex(c));
    expect(bytesToHex(tokenColor(rnd(32), a))).not.toBe(bytesToHex(c));
  });
});

describe("batcher argument parsing of the raw contract info (engine E8, Q16)", () => {
  const { sig } = signMint(operator.secretKey, base);
  const mintNonce = rnd(32);
  const json = JSON.parse(JSON.stringify(mintArgsJson({ ...base, mintNonce, sig })));
  const raw = readContractInfo();

  test("the compiled contract info carries 0.35.0's Curve25519 type names for `sig`", () => {
    const mint = raw.circuits.find((c) => c.name === "mintFromSolana")!;
    const sigType = mint.arguments.find((a) => a.name === "sig")!.type;
    expect(sigType.name).toBe("Ed25519Signature");
    expect(sigType.elements).toEqual([
      { name: "r", type: { "type-name": "Curve25519Point" } },
      { name: "s", type: { "type-name": "Curve25519Scalar" } },
    ]);
  });

  test("the raw info parses mintFromSolana's JSON args back to the circuit values", () => {
    const parsed = parseCircuitArgs("mintFromSolana", json, raw as any);
    expect(parsed[0]).toBe(base.lockNonce);
    expect(parsed[1].is_left).toBe(true);
    expect(bytesToHex(parsed[1].left.bytes)).toBe(bytesToHex(base.recipient.left.bytes));
    expect(bytesToHex(parsed[1].right.bytes)).toBe("00".repeat(32));
    expect(parsed[2]).toBe(base.amount);
    expect(bytesToHex(parsed[3])).toBe(bytesToHex(mintNonce));
    expect(parsed[4]).toEqual({ r: { x: sig.r.x, y: sig.r.y }, s: sig.s });
  });

  test("a non-canonical s or an out-of-range R coordinate is refused before queueing", () => {
    const withSig = (r: { x: string; y: string }, s: string) => [...json.slice(0, 4), { r, s }];
    expect(() =>
      parseCircuitArgs("mintFromSolana", withSig(json[4].r, ED25519_L.toString()), raw as any),
    ).toThrow(/argument "sig".*Curve25519Scalar must be < L/);
    expect(() =>
      parseCircuitArgs(
        "mintFromSolana",
        withSig({ x: ((1n << 255n) - 19n).toString(), y: json[4].r.y }, json[4].s),
        raw as any,
      ),
    ).toThrow(/argument "sig".*Curve25519Point x must be < 2\^255 - 19/);
  });
});
