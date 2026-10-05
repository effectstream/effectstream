// 00058 P4 (native; no chain): the Passport delivery adapter (plan Interfaces D-3–D-5).
//   - recognition over the contract states G-COMPOSE captured (fixtures/00058-g7-contract-states.json:
//     accounts A and B, the bridge) and over mutants of A. The mutants change the DECODED view and
//     run the pure rules (`passportRules`), not re-serialised states. When the Passport bundle is
//     imported here, the real decode and the adapter's `recognise` run too;
//   - sealing: the vendored codec (seal.ts) round-trips and keeps the InboxEntry v1 layout; its
//     cross-check against Passport's reference `inbox.ts` is in the 00058 evidence (p4/seal-crosscheck);
//   - the bundle: import refuses an unverified volume, another key set or passport commit, a
//     changed verifier key and a missing prover key; verify refuses a bundle changed after import;
//   - the compose builder (fakes, no submission): two calls in order, offers from the deposit call
//     only, TTL ≤ 1 h, circuitId [mintFromSolana, deposit_shielded], the coin checked BEFORE sealing.
//
// Run: bun test ./delivery-passport.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { x25519 } from "@noble/curves/ed25519.js";
import {
  BUNDLE_FILES,
  BundleError,
  COUNTER_BOUND,
  DEFAULT_BUNDLE_DIR,
  ENTRY_SIZE,
  ENTRY_SUITE,
  ENTRY_VERSION,
  PassportAdapter,
  adapterIdFor,
  buildDeliveryTransaction,
  compareVerifierKeys,
  deliverComposed,
  encKeyProblem,
  generateEncKeyPairPortable,
  importBundle,
  loadPin,
  networkSaltFor,
  openEntryPortable,
  passportRules,
  sealEntryPortable,
  verifyBundle,
  type AccountView,
  type ComposeDeps,
  type PassportPin,
} from "@solana-midnight-bridge/delivery-passport";
import { contractRecipientOf, type SignedMint } from "@solana-midnight-bridge/delivery";

const FIX = JSON.parse(fs.readFileSync(path.join(import.meta.dirname!, "fixtures/00058-g7-contract-states.json"), "utf8"));
const PIN = loadPin();
const NET = "undeployed";
const viewOf = (k: "accountA" | "accountB"): AccountView => {
  const v = FIX[k].view;
  return { operations: v.operations, authority: v.authority, encKey: Buffer.from(v.encKey, "hex"), networkSalt: v.networkSalt, round: BigInt(v.round), inboxCount: BigInt(v.inboxCount) };
};

describe("the pin (D-4)", () => {
  test("9 circuits, key set 21493588…, passport 599327b…, from Night Market's pinned-account-keys.ts", () => {
    expect(Object.keys(PIN.circuits).length).toBe(9);
    expect(PIN.keySet).toBe("21493588f30536e0f409dcf79deea54878f0c2cf6fee601a2359e54a776d5c5e");
    expect(PIN.passportCommit).toBe("599327b918b55afc95d6c98a89bcd15f4e8b0d53");
    expect(PIN.source.sha256).toBe("ca17f0654b435129e84a3fa02f17cd146b6bdcf1151a173836d9e8345c005da7");
    expect(PIN.circuits.deposit_shielded).toBe("6761a2e9cb905a115e7705b63b7df57b3c14dfa39fa48411ff6f512b8ff916b3");
    expect(adapterIdFor(PIN)).toBe("passport-ed25519@21493588");
  });
});

describe("recognition (D-3) over the G-COMPOSE states", () => {
  test("accounts A and B (opened by Night Market's relay) are deliverable", () => {
    for (const k of ["accountA", "accountB"] as const) {
      const r = passportRules(viewOf(k), PIN, NET);
      expect(r.verdict).toBe("deliverable");
    }
    expect(viewOf("accountA").networkSalt).toBe(networkSaltFor(NET));
  });

  test("the bridge contract is not a Passport account; the detail lists the missing and extra circuits", () => {
    const k = compareVerifierKeys(FIX.bridge.operations, PIN.circuits);
    expect(k.equal).toBe(false);
    expect(k.extra).toEqual(["lockForSolana", "mintFromSolana"]);
    expect(k.missing.length).toBe(9);
    expect(FIX.bridge.view).toBeNull(); // its state does not decode as a Passport ledger either
  });

  const A = viewOf("accountA");
  const firstCircuit = Object.keys(PIN.circuits)[0]!;
  const mutants: Array<[string, AccountView, string, RegExp?]> = [
    ["one verifier digest changed", { ...A, operations: { ...A.operations, [firstCircuit]: "00".repeat(32) } }, "not-mine", /different: activate_initial_device_with_ed25519/],
    ["one circuit missing", { ...A, operations: Object.fromEntries(Object.entries(A.operations).filter(([c]) => c !== "deposit_unshielded")) }, "not-mine", /missing: deposit_unshielded/],
    ["one extra circuit", { ...A, operations: { ...A.operations, steal: "11".repeat(32) } }, "not-mine", /extra: steal/],
    ["the authority committee at 1", { ...A, authority: { committee: 1, threshold: 1 } }, "authority-live"],
    ["the authority threshold at 0", { ...A, authority: { committee: 0, threshold: 0 } }, "authority-live"],
    ["enc_key all-zero", { ...A, encKey: new Uint8Array(32) }, "bad-enc-key", /all-zero/],
    ["enc_key a low-order point", { ...A, encKey: Buffer.from("e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800", "hex") }, "bad-enc-key"],
    ["enc_key 31 bytes", { ...A, encKey: new Uint8Array(31).fill(9) }, "bad-enc-key", /31 bytes/],
    ["round = 2^48", { ...A, round: COUNTER_BOUND }, "counters"],
    ["inbox_count = 2^48", { ...A, inboxCount: COUNTER_BOUND }, "counters"],
  ];
  for (const [name, view, expected, detail] of mutants) {
    test(`A with ${name} → ${expected}`, () => {
      const r = passportRules(view, PIN, NET);
      if (expected === "not-mine") {
        expect(r.verdict).toBe("not-mine");
        if (detail) expect(r.verdict === "not-mine" && r.detail).toMatch(detail);
      } else {
        expect(r.verdict === "refuse" && r.code).toBe(expected);
        if (detail) expect(r.verdict === "refuse" && r.message).toMatch(detail);
      }
    });
  }

  test("A recognised by a node configured for another network → wrong-network", () => {
    const r = passportRules(A, PIN, "preview");
    expect(r.verdict === "refuse" && r.code).toBe("wrong-network");
  });

  test("encKeyProblem accepts a real X25519 key", () => {
    expect(encKeyProblem(x25519.getPublicKey(new Uint8Array(randomBytes(32))))).toBeNull();
  });

  const bundleHere = fs.existsSync(path.join(DEFAULT_BUNDLE_DIR, "bundle.json"));
  test.skipIf(!bundleHere)("with the imported bundle: the real decode and the adapter's recognise (A, B deliverable; bridge not-mine; nothing → retry missing)", async () => {
    const { deserializeContractState } = await import("@solana-midnight-bridge/delivery-passport/state");
    const states: Record<string, unknown> = {};
    for (const k of ["accountA", "accountB", "bridge"]) states[FIX[k].address] = deserializeContractState(FIX[k].stateHex);
    const adapter = new PassportAdapter({
      pin: PIN, bundleDir: DEFAULT_BUNDLE_DIR, networkId: NET,
      bridge: { address: FIX.bridge.address, colour: "00".repeat(32), managedDir: "/nonexistent" },
      publicData: { queryContractState: async (a: string) => states[a] ?? null },
      environment: async () => { throw new Error("no wallet in this test"); },
      sdk: {} as never, seal: sealEntryPortable, contractProofServer: "http://127.0.0.1:9",
      log: () => {},
    });
    // init without the SDK: only the bundle check and the module load matter here.
    (adapter as any).cfg.sdk = { CompiledContract: { make: () => ({ pipe: () => ({}) }), withWitnesses: () => 0, withCompiledFileAssets: () => 0 } };
    await adapter.init();
    expect((await adapter.recognise(FIX.accountA.address)).verdict).toBe("deliverable");
    expect((await adapter.recognise(FIX.accountB.address)).verdict).toBe("deliverable");
    const b = await adapter.recognise(FIX.bridge.address);
    expect(b.verdict === "not-mine" && b.detail).toMatch(/extra: lockForSolana, mintFromSolana/);
    expect(await adapter.recognise("77".repeat(32))).toMatchObject({ verdict: "retry", missing: true });
  });
});

describe("sealing (vendored InboxEntry v1 codec)", () => {
  test("192 bytes, version 0x01 and suite 0x01, zero padding; opens with the right secret only", async () => {
    const kp = generateEncKeyPairPortable();
    for (let i = 0; i < 20; i++) {
      const coin = { nonce: new Uint8Array(randomBytes(32)), color: new Uint8Array(randomBytes(32)), value: BigInt(i) * 1_000_003n + 500_000_000n };
      const e = await sealEntryPortable(kp.publicKey, coin);
      expect(e.length).toBe(ENTRY_SIZE);
      expect([e[0], e[1]]).toEqual([ENTRY_VERSION, ENTRY_SUITE]);
      expect([...e.subarray(142)].every((b) => b === 0)).toBe(true);
      const o = await openEntryPortable(kp.secretKey, e);
      expect(o && Buffer.from(o.nonce).equals(Buffer.from(coin.nonce)) && Buffer.from(o.color).equals(Buffer.from(coin.color)) && o.value === coin.value).toBe(true);
      expect(await openEntryPortable(generateEncKeyPairPortable().secretKey, e)).toBeNull();
      const flipped = Uint8Array.from(e);
      flipped[70] ^= 1;
      expect(await openEntryPortable(kp.secretKey, flipped)).toBeNull();
    }
  });

  test("the vendored file names its source commit and sha256s", () => {
    const src = fs.readFileSync(path.resolve(import.meta.dirname!, "../delivery-passport/seal.ts"), "utf8");
    expect(src).toContain("599327b918b55afc95d6c98a89bcd15f4e8b0d53");
    expect(src).toContain("a3e982e3c9ff48e3793962e7925a04d53f348cfae883b7150c0304254db889dd");
    expect(src).toContain("464a3851a3bf8474aad15c51345cf55c4f8cdc4ba5ef5117ef5f80e3a3d0c7c1");
    expect(src).toContain("Apache License, Version 2.0");
  });
});

describe("the bundle (D-5)", () => {
  let tmp: string;
  let vol: string;
  let pin: PassportPin;
  const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-test-"));
    vol = path.join(tmp, "volume");
    for (const f of BUNDLE_FILES) {
      fs.mkdirSync(path.dirname(path.join(vol, "account", f)), { recursive: true });
      fs.writeFileSync(path.join(vol, "account", f), randomBytes(64));
    }
    const vk = fs.readFileSync(path.join(vol, "account", "keys/deposit_shielded.verifier"));
    pin = { ...PIN, keySet: "aa".repeat(32), passportCommit: "bb".repeat(20), accountSourceSha256: "cc".repeat(32), circuits: { ...PIN.circuits, deposit_shielded: sha(vk) } };
    fs.writeFileSync(path.join(vol, ".night-market-keys.json"), JSON.stringify({ verdict: "VERIFIED", fingerprint: pin.keySet, build: { passportCommit: pin.passportCommit, accountSourceSha256: pin.accountSourceSha256 } }));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const out = () => path.join(tmp, "bundle", "account");

  test("a verified volume of the pinned key set is imported, and verifies", () => {
    const m = importBundle(path.join(vol, "account"), pin, out());
    expect(Object.keys(m.files).length).toBe(BUNDLE_FILES.length);
    expect(verifyBundle(out(), pin)).toEqual({ files: BUNDLE_FILES.length });
  });

  const report = (r: object) => fs.writeFileSync(path.join(vol, ".night-market-keys.json"), JSON.stringify(r));
  const refusals: Array<[string, () => void, RegExp]> = [
    ["a report that is not VERIFIED", () => report({ verdict: "UNVERIFIED", fingerprint: "aa".repeat(32), build: { passportCommit: "bb".repeat(20) } }), /not VERIFIED/],
    ["another key set", () => report({ verdict: "VERIFIED", fingerprint: "ee".repeat(32), build: { passportCommit: "bb".repeat(20) } }), /fingerprint/],
    ["another passport commit", () => report({ verdict: "VERIFIED", fingerprint: "aa".repeat(32), build: { passportCommit: "ee".repeat(20) } }), /passport commit/],
    ["a verifier key with one flipped byte", () => {
      const f = path.join(vol, "account", "keys/deposit_shielded.verifier");
      const b = fs.readFileSync(f);
      b[0] ^= 1;
      fs.writeFileSync(f, b);
    }, /verifier key/],
    ["a missing prover key", () => fs.rmSync(path.join(vol, "account", "keys/deposit_shielded.prover")), /lacks keys\/deposit_shielded.prover/],
  ];
  for (const [what, mutate, msg] of refusals) {
    test(`import refuses ${what}`, () => {
      mutate();
      expect(() => importBundle(path.join(vol, "account"), pin, out())).toThrow(msg);
      expect(fs.existsSync(out())).toBe(false);
    });
  }

  test("verify (node start) refuses a bundle changed after import, another pin, or none at all", () => {
    expect(() => verifyBundle(out(), pin)).toThrow(/no Passport bundle/);
    importBundle(path.join(vol, "account"), pin, out());
    expect(() => verifyBundle(out(), { ...pin, keySet: "dd".repeat(32) })).toThrow(/key set/);
    const f = path.join(out(), "contract/index.js");
    fs.appendFileSync(f, "x");
    expect(() => verifyBundle(out(), pin)).toThrow(BundleError);
  });

  const realVolume = "/keys/account";
  test.skipIf(!fs.existsSync(path.join(realVolume, "..", ".night-market-keys.json")))("the real verified key volume (p10i-keys, 21493588…) is accepted with the committed pin", () => {
    const m = importBundle(realVolume, PIN, out());
    expect(m.keySet).toBe(PIN.keySet);
    expect(verifyBundle(out(), PIN).files).toBe(BUNDLE_FILES.length);
  });
});

describe("the compose builder (fakes; no submission)", () => {
  const ACC = "4f".repeat(32);
  const BRIDGE = "97".repeat(32);
  const COLOUR = "9d".repeat(32);
  const coin = { nonce: new Uint8Array(32).fill(5), color: Buffer.from(COLOUR, "hex"), value: 500_000_000n };
  const mint: SignedMint = { lockNonce: 0n, amount: 500_000_000n, recipient: contractRecipientOf(ACC), mintNonce: new Uint8Array(32), sig: { r: { x: 1n, y: 2n }, s: 3n } };
  type Log = { calls: string[]; seals: number; encReads: number; intents: Array<{ ttl: Date; added: string[] }>; parts: unknown[]; submitted: unknown[] };
  function deps(log: Log, minted = coin, status = "SucceedEntirely"): ComposeDeps {
    const stateOf = (who: string) => ({ who, serialize: () => Buffer.from(who) });
    return {
      createUnprovenCallTx: async (_p, o) => {
        log.calls.push(`${o.contractAddress === BRIDGE ? "bridge" : "account"}.${o.circuitId}`);
        return o.circuitId === "mintFromSolana"
          ? { public: { partitionedTranscript: ["g-m", "f-m"] }, private: { result: minted, privateTranscriptOutputs: [], input: 1, output: 2, unprovenTx: { guaranteedOffer: "MINT-OFFER" } } }
          : { public: { partitionedTranscript: ["g-d", "f-d"] }, private: { privateTranscriptOutputs: [], input: 3, output: 4, unprovenTx: { guaranteedOffer: "DEPOSIT-OFFER", fallibleOffer: new Map([[1, "DEPOSIT-FALLIBLE"]]) } } };
      },
      submitTx: async (_p, o) => {
        log.submitted.push(o);
        return { txId: "00ab", status };
      },
      ledger: {
        ContractState: { deserialize: (b: Uint8Array) => ({ operation: (id: string) => ({ verifierKey: Buffer.from(`${Buffer.from(b).toString()}:${id}`) }) }) },
        ContractCallPrototype: class { constructor(public address: string, public circuit: string) {} } as never,
        communicationCommitmentRandomness: () => "rand",
        Intent: { new: (ttl: Date) => { const it = { ttl, added: [] as string[] }; log.intents.push(it); const api = { addCall: (c: any) => { it.added.push(`${c.address === BRIDGE ? "bridge" : "account"}.${c.circuit}`); return api; } }; return api; } },
        Transaction: { fromPartsRandomized: (...a: unknown[]) => { log.parts.push(a); return { tx: true }; } },
      },
      encodeContractKeyLocation: (o) => `contract:${o.contractAddress}/${o.circuitId}?vk=${o.verifierKeyHash}`,
      hashVerifierKey: (vk) => createHash("sha256").update(vk).digest("hex"),
      seal: async (k, c) => { log.seals++; return sealEntryPortable(k, c); },
      now: () => Date.parse("2026-10-04T12:00:00Z"),
    };
  }
  const input = (log: Log, extra: object = {}) => ({
    networkId: NET,
    bridge: { address: BRIDGE, compiled: {}, colour: COLOUR },
    account: { address: ACC, compiled: {}, readEncKey: () => { log.encReads++; return generateEncKeyPairPortable().publicKey; } },
    mint,
    providers: { bridge: {}, account: {}, submit: {}, publicData: { queryContractState: async (a: string) => ({ who: a, serialize: () => Buffer.from(a) }) } },
    ...extra,
  });
  const newLog = (): Log => ({ calls: [], seals: 0, encReads: 0, intents: [], parts: [], submitted: [] });

  test("two calls in order, offers from the deposit call only, TTL ≤ 1 h, circuitId [mintFromSolana, deposit_shielded]", async () => {
    const log = newLog();
    const composed: unknown[] = [];
    const r = await deliverComposed(deps(log), { ...input(log), hooks: { onComposed: (c) => { composed.push(c); expect(log.submitted.length).toBe(0); } } } as never);
    expect(log.calls).toEqual(["bridge.mintFromSolana", "account.deposit_shielded"]);
    expect(log.intents.length).toBe(1);
    expect(log.intents[0]!.added).toEqual(["bridge.mintFromSolana", "account.deposit_shielded"]);
    expect(log.intents[0]!.ttl.getTime() - Date.parse("2026-10-04T12:00:00Z")).toBeLessThanOrEqual(3_600_000);
    expect(log.parts).toEqual([[NET, "DEPOSIT-OFFER", "DEPOSIT-FALLIBLE", expect.anything()]]);
    expect((log.submitted[0] as any).circuitId).toEqual(["mintFromSolana", "deposit_shielded"]);
    expect(log.encReads).toBe(1);
    expect(log.seals).toBe(1);
    expect(composed).toEqual([{ nonce: "05".repeat(32), colour: COLOUR, value: "500000000" }]);
    expect(r).toEqual({ tx: "00ab", coin: composed[0] });
  });

  test("a minted coin of another value or colour is refused BEFORE anything is sealed", async () => {
    for (const bad of [{ ...coin, value: 1n }, { ...coin, color: new Uint8Array(32).fill(1) }]) {
      const log = newLog();
      await expect(buildDeliveryTransaction(deps(log, bad), input(log) as never)).rejects.toThrow(/value|colour/);
      expect(log.seals).toBe(0);
      expect(log.calls).toEqual(["bridge.mintFromSolana"]);
    }
  });

  test("a signed mint for another recipient, a TTL over 1 h, and a failed transaction", async () => {
    const log = newLog();
    await expect(buildDeliveryTransaction(deps(log), { ...input(log), mint: { ...mint, recipient: contractRecipientOf("11".repeat(32)) } } as never)).rejects.toThrow(/another recipient/);
    const l2 = newLog();
    await buildDeliveryTransaction(deps(l2), { ...input(l2), ttlMs: 10 * 3_600_000 } as never);
    expect(l2.intents[0]!.ttl.getTime() - Date.parse("2026-10-04T12:00:00Z")).toBe(3_600_000);
    const l3 = newLog();
    await expect(deliverComposed(deps(l3, coin, "FailEntirely"), input(l3) as never)).rejects.toThrow(/did not succeed/);
  });
});
