// 00058 P4 (native; no chain): the relayer's contract branch (plan Interfaces D-2) over PGLite, with
// a fake adapter and a spied signer.
//   - refuse → undeliverable with its code, attempts and submitted_at unchanged, NOTHING signed;
//   - retry → attempts + 1, never submitted; a missing contract past the grace → not-a-contract;
//   - no router at all → no-adapter;
//   - deliverable → signed once, delivered, `delivery` recorded (the coin before submission too);
//   - a restart with the nonce already in mintedLocks → no signature, "already settled";
//   - a "lock already minted" refusal from the delivery → recorded as settled;
//   - wallet locks keep the 00050 path (relayer-jobs.test.ts runs unchanged);
// plus the delivery wallet role (FR-013: dev seed on loopback only, live seed from a 600 file).
//
// Run: bun test ./relayer-delivery.test.ts
import { beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import fastify from "fastify";
import { DeliveryRouter, type ContractDeliveryAdapter, type MintToSign, type Recognition, type SignedMint } from "@solana-midnight-bridge/delivery";
import { BridgeRelayer } from "@solana-midnight-bridge/node/relayer";
import { createApiRouter } from "@solana-midnight-bridge/node/api";
import { liveSeedPath, resolveSeed } from "@solana-midnight-bridge/contracts-midnight/wallets";
import { asConnection, freshDb } from "./helpers/pglite-db.ts";

const C = "a1".repeat(32);
const W = "ab".repeat(64);

type Spy = { signed: MintToSign[]; delivered: string[]; minted: string[] };

function setup(db: PGlite, answer: Recognition | null, opts: { mintExists?: boolean; deliverError?: string; graceMs?: number; now?: () => number } = {}) {
  const spy: Spy = { signed: [], delivered: [], minted: [] };
  const adapter: ContractDeliveryAdapter = {
    id: "passport-ed25519@21493588",
    info: { id: "passport-ed25519", keySet: "21".repeat(32), passportCommit: "59".repeat(20) },
    init: async () => {},
    recognise: async () => answer!,
    deliver: async (contract, mint, hooks) => {
      await hooks?.onComposed?.({ nonce: "5e".repeat(32), colour: "c3".repeat(32), value: String(mint.amount) });
      if (opts.deliverError) throw new Error(opts.deliverError);
      spy.delivered.push(contract);
      return { tx: "00tx", coin: { nonce: "5e".repeat(32), colour: "c3".repeat(32), value: String(mint.amount) } };
    },
  };
  const router = answer === null
    ? undefined
    : new DeliveryRouter([adapter], {
        signMint: (m): SignedMint => {
          spy.signed.push(m);
          return { ...m, mintNonce: new Uint8Array(32), sig: { r: { x: 1n, y: 2n }, s: 3n } };
        },
        graceMs: opts.graceMs ?? 600_000,
        ...(opts.now ? { now: opts.now } : {}),
      });
  const relayer = new BridgeRelayer({
    db: asConnection(db),
    submitMint: async (j) => {
      spy.minted.push(String(j.sourceId));
      return { tx: "wallet-mint" };
    },
    submitRelease: async () => ({ tx: "rel" }),
    releaseReceiptExists: async () => false,
    mintExists: async () => opts.mintExists ?? false,
    ...(router ? { delivery: router } : {}),
    ...(opts.now ? { now: opts.now } : {}),
    log: () => {},
  });
  return { relayer, spy };
}

const job = async (db: PGlite, id = 0) =>
  (await db.query<any>(`SELECT attempts, submitted_at IS NOT NULL AS submitted, last_tx, last_error, undeliverable_code, undeliverable_reason, delivery FROM relayer_jobs WHERE direction='s2m' AND source_id=${id}`)).rows[0];

let db: PGlite;
beforeEach(async () => {
  db = await freshDb();
  await db.exec(`INSERT INTO bridge_transfers (direction, source_id, amount, recipient, recipient_kind, sender, status, observed_block, observed_at)
                 VALUES ('s2m', 0, 500000000, '${C}', 'contract', 'dep', 'observed', 1, '2026-10-04T12:00:00Z')`);
});

async function tick(r: BridgeRelayer) {
  await r.tick();
  await r.drain();
}

describe("contract jobs (D-2)", () => {
  test("refuse → undeliverable(code), no attempt, nothing signed; the API shows it", async () => {
    const { relayer, spy } = setup(db, { verdict: "refuse", code: "authority-live", message: "live authority" });
    await tick(relayer);
    expect(await job(db)).toMatchObject({ attempts: 0, submitted: false, undeliverable_code: "authority-live", delivery: null });
    expect(spy.signed).toEqual([]);
    expect(spy.delivered).toEqual([]);
    // It is no longer a candidate: a second tick does nothing.
    await tick(relayer);
    expect(spy.signed).toEqual([]);
    const server = fastify();
    await createApiRouter()(server as any, asConnection(db) as any);
    const t = (await server.inject({ method: "GET", url: "/transfers/s2m:0" })).json() as any;
    expect(t.transfer).toMatchObject({ status: "undeliverable", recipientKind: "contract", reason: { code: "authority-live" }, relayer: { attempts: 0, submittedAt: null } });
    await server.close();
  });

  test("no adapter at all → undeliverable(no-adapter), nothing signed", async () => {
    const { relayer, spy } = setup(db, null);
    await tick(relayer);
    expect(await job(db)).toMatchObject({ undeliverable_code: "no-adapter", submitted: false });
    expect(spy.signed).toEqual([]);
  });

  test("retry → attempts + 1, never submitted; a missing contract past the grace → not-a-contract", async () => {
    let now = Date.parse("2026-10-04T12:00:30Z");
    const { relayer, spy } = setup(db, { verdict: "retry", message: "no state", missing: true }, { graceMs: 60_000, now: () => now });
    await tick(relayer);
    expect(await job(db)).toMatchObject({ attempts: 1, submitted: false, undeliverable_code: null });
    expect((await job(db)).last_error).toMatch(/recognition: .*no state/);
    now = Date.parse("2026-10-04T12:05:00Z"); // past the backoff and the grace
    await tick(relayer);
    expect(await job(db)).toMatchObject({ submitted: false, undeliverable_code: "not-a-contract" });
    expect(spy.signed).toEqual([]);
  });

  test("deliverable → signed once for right(contract), delivered, delivery recorded, submitted", async () => {
    const { relayer, spy } = setup(db, { verdict: "deliverable", facts: {} });
    await tick(relayer);
    expect(spy.signed.length).toBe(1);
    expect(spy.signed[0]!.recipient.is_left).toBe(false);
    expect(Buffer.from(spy.signed[0]!.recipient.right.bytes).toString("hex")).toBe(C);
    expect(spy.delivered).toEqual([C]);
    expect(spy.minted).toEqual([]); // never the wallet path
    const j = await job(db);
    expect(j).toMatchObject({ attempts: 1, submitted: true, last_tx: "00tx", last_error: null });
    expect(j.delivery).toEqual({ adapter: "passport-ed25519@21493588", account: C, coin: { nonce: "5e".repeat(32), colour: "c3".repeat(32), value: "500000000" }, tx: "00tx" });
  });

  test("a delivery that fails after composing keeps the coin facts (tx null) and stays submitted with the error", async () => {
    const { relayer } = setup(db, { verdict: "deliverable", facts: {} }, { deliverError: "proof server: out of memory" });
    await tick(relayer);
    const j = await job(db);
    expect(j).toMatchObject({ submitted: true, undeliverable_code: null });
    expect(j.last_error).toMatch(/out of memory/);
    expect(j.delivery).toMatchObject({ coin: { value: "500000000" }, tx: null });
  });

  test("a restart with the nonce already in mintedLocks: no signature, already settled", async () => {
    const { relayer, spy } = setup(db, { verdict: "deliverable", facts: {} }, { mintExists: true });
    await tick(relayer);
    expect(spy.signed).toEqual([]);
    expect((await job(db)).last_error).toMatch(/already settled/);
  });

  test("'lock already minted' from the delivery is recorded as settled", async () => {
    const { relayer } = setup(db, { verdict: "deliverable", facts: {} }, { deliverError: "failed assert: lock already minted" });
    await tick(relayer);
    expect((await job(db)).last_error).toMatch(/^already settled on chain: .*lock already minted/);
  });

  test("a wallet lock beside it still takes the 00050 mint path", async () => {
    await db.exec(`INSERT INTO bridge_transfers (direction, source_id, amount, recipient, recipient_kind, sender, status, observed_block)
                   VALUES ('s2m', 1, 10, '${W}', 'wallet', 'dep', 'observed', 1)`);
    const { relayer, spy } = setup(db, { verdict: "deliverable", facts: {} });
    await tick(relayer); // one s2m job at a time: the lowest id (the contract) first
    await tick(relayer);
    expect(spy.delivered).toEqual([C]);
    expect(spy.minted).toEqual(["1"]);
    expect(spy.signed.length).toBe(1); // the wallet mint is signed by its own (00050) path, not the router
  });
});

describe("the delivery wallet (D-7, FR-013)", () => {
  const local = { id: "undeployed" as never, indexer: "http://127.0.0.1:8088/api/v4/graphql", indexerWS: "ws://127.0.0.1:8088", node: "http://127.0.0.1:9944", proofServer: "", contractProofServer: "" };
  test("locally it is a dev seed, refused off loopback", () => {
    expect(resolveSeed("local", "delivery", local)).toBe("0".repeat(63) + "3");
    expect(() => resolveSeed("local", "delivery", { ...local, indexer: "http://indexer:8088/api/v4/graphql", node: "http://node:9944" })).toThrow(/refusing a public local dev seed/);
  });

  test("live, only from <secrets>/midnight-delivery.seed with 700/600 permissions", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "delivery-secrets-"));
    const prev = process.env.BRIDGE_SECRETS_DIR;
    process.env.BRIDGE_SECRETS_DIR = dir;
    try {
      fs.chmodSync(dir, 0o700);
      expect(liveSeedPath("delivery")).toBe(path.join(dir, "midnight-delivery.seed"));
      const urls = { ...local, id: "stagenet" as never, indexer: "https://indexer.example/api", node: "wss://rpc.example" };
      expect(() => resolveSeed("stagenet", "delivery", urls)).toThrow(/not found/);
      fs.writeFileSync(liveSeedPath("delivery"), "ab".repeat(32), { mode: 0o644 });
      fs.chmodSync(liveSeedPath("delivery"), 0o644);
      expect(() => resolveSeed("stagenet", "delivery", urls)).toThrow(/group\/other/);
      fs.chmodSync(liveSeedPath("delivery"), 0o600);
      expect(resolveSeed("stagenet", "delivery", urls)).toBe("ab".repeat(32));
    } finally {
      if (prev === undefined) delete process.env.BRIDGE_SECRETS_DIR;
      else process.env.BRIDGE_SECRETS_DIR = prev;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
