// 00058 P4 (native; no chain): the delivery router (plan Interfaces D-1).
//   - the verdict table: the first adapter answer that is not `not-mine` decides; none → no-adapter
//     or not-a-passport-account; a missing contract becomes not-a-contract after the grace window;
//     an adapter that throws is a retry, never undeliverable;
//   - the signing boundary: only `deliver` signs, once, for right(contract); `recognise` never does;
//     what an adapter receives carries no key material;
//   - a second (fake) adapter delivers what the first calls not-mine (US6);
//   - the node's signer (operatorMintSigner) and configuration (deliveryConfig).
//
// Run: bun test ./delivery-router.test.ts
import { describe, expect, test } from "bun:test";
import nacl from "tweetnacl";
import {
  DeliveryRouter,
  contractRecipientOf,
  normaliseContract,
  type ContractDeliveryAdapter,
  type MintToSign,
  type Recognition,
  type SignedMint,
} from "@solana-midnight-bridge/delivery";
import { deliveryConfig, operatorMintSigner, recogniseForApi } from "@solana-midnight-bridge/node/delivery";
import { verifyMintSignature, mintMessage } from "@solana-midnight-bridge/contracts-midnight/signing";
import { DEFAULT_BUNDLE_DIR } from "@solana-midnight-bridge/delivery-passport";

const A = "a1".repeat(32);

function fake(id: string, answer: Recognition | (() => Promise<Recognition>)) {
  const seen: { recognised: string[]; delivered: Array<{ contract: string; mint: SignedMint }> } = { recognised: [], delivered: [] };
  const adapter: ContractDeliveryAdapter = {
    id,
    info: { id, keySet: "00".repeat(32), passportCommit: "00".repeat(20) },
    init: async () => {},
    recognise: async (c) => {
      seen.recognised.push(c);
      return typeof answer === "function" ? answer() : answer;
    },
    deliver: async (contract, mint) => {
      seen.delivered.push({ contract, mint });
      return { tx: `tx-${id}`, coin: { nonce: "5e".repeat(32), colour: "c3".repeat(32), value: String(mint.amount) } };
    },
  };
  return { adapter, seen };
}

function spySigner() {
  const calls: MintToSign[] = [];
  const signMint = (m: MintToSign): SignedMint => {
    calls.push(m);
    return { ...m, mintNonce: new Uint8Array(32).fill(7), sig: { r: { x: 1n, y: 2n }, s: 3n } };
  };
  return { calls, signMint };
}

const deliverable: Recognition = { verdict: "deliverable", facts: { encKey: "ab" } };
const notMine: Recognition = { verdict: "not-mine", detail: "other circuits" };
const refuse: Recognition = { verdict: "refuse", code: "authority-live", message: "live" };
const retry: Recognition = { verdict: "retry", message: "indexer down" };
const missing: Recognition = { verdict: "retry", message: "no state", missing: true };

describe("verdict table", () => {
  const table: Array<[string, Recognition[], string, string?]> = [
    ["[] → no-adapter", [], "undeliverable", "no-adapter"],
    ["[not-mine] → not-a-passport-account", [notMine], "undeliverable", "not-a-passport-account"],
    ["[not-mine, deliverable] → the second delivers", [notMine, deliverable], "deliverable"],
    ["[refuse] → its code", [refuse], "undeliverable", "authority-live"],
    ["[deliverable, refuse] → the first decides", [deliverable, refuse], "deliverable"],
    ["[refuse, deliverable] → the first decides", [refuse, deliverable], "undeliverable", "authority-live"],
    ["[retry] → retry", [retry], "retry"],
    ["[not-mine, retry] → retry", [notMine, retry], "retry"],
  ];
  for (const [name, answers, kind, code] of table) {
    test(name, async () => {
      const adapters = answers.map((a, i) => fake(`f${i}`, a));
      const s = spySigner();
      const r = new DeliveryRouter(adapters.map((x) => x.adapter), { signMint: s.signMint });
      const d = await r.recognise(A);
      expect(d.kind).toBe(kind);
      if (code) expect(d.kind === "undeliverable" && d.code).toBe(code);
      if (d.kind === "deliverable") expect(d.adapter.id).toBe(adapters[answers.indexOf(deliverable)]!.adapter.id);
      expect(s.calls.length).toBe(0); // recognise never signs
    });
  }

  test("adapters are asked in order, and only until one decides", async () => {
    const a = fake("a", notMine), b = fake("b", deliverable), c = fake("c", deliverable);
    const r = new DeliveryRouter([a.adapter, b.adapter, c.adapter], { signMint: spySigner().signMint });
    expect((await r.recognise(A)).kind).toBe("deliverable");
    expect([a.seen.recognised.length, b.seen.recognised.length, c.seen.recognised.length]).toEqual([1, 1, 0]);
  });

  test("a missing contract: retry before the grace window, not-a-contract after it", async () => {
    let now = 1_000_000;
    const r = new DeliveryRouter([fake("p", missing).adapter], { signMint: spySigner().signMint, graceMs: 60_000, now: () => now });
    expect((await r.recognise(A, { firstSeenAt: now - 59_000 })).kind).toBe("retry");
    now += 2_000;
    const d = await r.recognise(A, { firstSeenAt: now - 61_000 });
    expect(d.kind === "undeliverable" && d.code).toBe("not-a-contract");
    // Without a first-seen time (GET /recipients) a missing contract stays a retry.
    expect((await r.recognise(A)).kind).toBe("retry");
    // A non-missing retry never turns into not-a-contract.
    const r2 = new DeliveryRouter([fake("p", retry).adapter], { signMint: spySigner().signMint, graceMs: 0, now: () => now });
    expect((await r2.recognise(A, { firstSeenAt: 0 })).kind).toBe("retry");
  });

  test("an adapter that throws (an infrastructure error) is a retry, never undeliverable", async () => {
    const r = new DeliveryRouter([fake("p", () => Promise.reject(new Error("ECONNREFUSED"))).adapter], { signMint: spySigner().signMint, graceMs: 0 });
    const d = await r.recognise(A, { firstSeenAt: 0 });
    expect(d.kind).toBe("retry");
    expect(d.kind === "retry" && d.message).toMatch(/ECONNREFUSED/);
  });

  test("addresses: 64 hex, 0x optional, lowercased; anything else throws", () => {
    expect(normaliseContract(`0x${A.toUpperCase()}`)).toBe(A);
    expect(() => normaliseContract("a1")).toThrow();
    const rc = contractRecipientOf(A);
    expect(rc.is_left).toBe(false);
    expect(Buffer.from(rc.right.bytes).toString("hex")).toBe(A);
    expect(rc.left.bytes).toEqual(new Uint8Array(32));
  });
});

describe("the signing boundary (FR-003, FR-005)", () => {
  test("deliver signs exactly once, for right(contract), and the adapter gets no key material", async () => {
    const p = fake("p", deliverable);
    const s = spySigner();
    const r = new DeliveryRouter([p.adapter], { signMint: s.signMint });
    const d = await r.recognise(A);
    if (d.kind !== "deliverable") throw new Error("expected deliverable");
    const res = await r.deliver(d.adapter, A, { lockNonce: 7n, amount: 500n });
    expect(res.tx).toBe("tx-p");
    expect(s.calls.length).toBe(1);
    expect(s.calls[0]!.recipient.is_left).toBe(false);
    expect(Buffer.from(s.calls[0]!.recipient.right.bytes).toString("hex")).toBe(A);
    expect([s.calls[0]!.lockNonce, s.calls[0]!.amount]).toEqual([7n, 500n]);
    const got = p.seen.delivered[0]!.mint;
    expect(Object.keys(got).sort()).toEqual(["amount", "lockNonce", "mintNonce", "recipient", "sig"]);
    expect(Object.keys(got.sig).sort()).toEqual(["r", "s"]);
  });

  test("US6: a fake adapter delivers what the Passport-like adapter calls not-mine, without the key", async () => {
    const passport = fake("passport-ed25519@21493588", notMine);
    const other = fake("fake-vault@1", deliverable);
    const s = spySigner();
    const r = new DeliveryRouter([passport.adapter, other.adapter], { signMint: s.signMint });
    const d = await r.recognise(A);
    expect(d.kind === "deliverable" && d.adapter.id).toBe("fake-vault@1");
    if (d.kind === "deliverable") await r.deliver(d.adapter, A, { lockNonce: 1n, amount: 1n });
    expect(passport.seen.recognised).toEqual([A]);
    expect(passport.seen.delivered).toEqual([]);
    expect(other.seen.delivered.length).toBe(1);
    expect(r.infos().map((i) => i.id)).toEqual(["passport-ed25519@21493588", "fake-vault@1"]);
  });

  test("the node's signer signs the bridge's message with the operator key and only for contracts", () => {
    const kp = nacl.sign.keyPair();
    const addrs = { contractAddress: "ab".repeat(32), networkTag: "cd".repeat(32) };
    const sign = operatorMintSigner(kp.secretKey, addrs);
    const recipient = contractRecipientOf(A);
    const m = sign({ lockNonce: 9n, amount: 42n, recipient });
    expect(m.mintNonce.length).toBe(32);
    expect(m.recipient).toBe(recipient);
    // The circuit's own digest over right(A): rebuild the message and check a signature of it.
    const auth = { contractAddress: Buffer.from(addrs.contractAddress, "hex"), networkTag: Buffer.from(addrs.networkTag, "hex"), lockNonce: 9n, recipient, amount: 42n };
    const msg = mintMessage(auth);
    expect(verifyMintSignature(kp.publicKey, auth, nacl.sign.detached(msg, kp.secretKey))).toBe(true);
    expect(() => sign({ lockNonce: 1n, amount: 1n, recipient: { ...recipient, is_left: true } as never })).toThrow(/only signs contract recipients/);
  });
});

describe("node configuration", () => {
  test("BRIDGE_DELIVERY_ADAPTERS, PASSPORT_BUNDLE_DIR, BRIDGE_DELIVERY_NOT_FOUND_GRACE_MS", () => {
    expect(deliveryConfig({})).toEqual({ adapters: [], bundleDir: DEFAULT_BUNDLE_DIR, graceMs: 600_000 });
    expect(deliveryConfig({ BRIDGE_DELIVERY_ADAPTERS: " passport , passport", BRIDGE_DELIVERY_NOT_FOUND_GRACE_MS: "60000", PASSPORT_BUNDLE_DIR: "/x" }))
      .toEqual({ adapters: ["passport"], bundleDir: "/x", graceMs: 60_000 });
    expect(() => deliveryConfig({ BRIDGE_DELIVERY_ADAPTERS: "vault" })).toThrow(/unknown adapter "vault"/);
    expect(() => deliveryConfig({ BRIDGE_DELIVERY_NOT_FOUND_GRACE_MS: "-1" })).toThrow();
  });

  test("the API's recogniser maps router decisions to RecipientVerdict fields", async () => {
    const r = (a: Recognition) => new DeliveryRouter([fake("passport-ed25519@21493588", a).adapter], { signMint: spySigner().signMint });
    expect(await recogniseForApi(r(deliverable), A)).toEqual({ verdict: "deliverable", adapter: "passport-ed25519@21493588", code: null, message: null });
    expect(await recogniseForApi(r(refuse), A)).toMatchObject({ verdict: "undeliverable", adapter: null, code: "authority-live" });
    expect(await recogniseForApi(r(missing), A)).toMatchObject({ verdict: "retry", adapter: null, code: null });
    expect(await recogniseForApi(new DeliveryRouter([], { signMint: spySigner().signMint }), A)).toMatchObject({ verdict: "undeliverable", code: "no-adapter" });
  });
});
