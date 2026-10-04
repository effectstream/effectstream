// 00058 lane L-NODE (plan P3; native, no chain): contract-recipient transfers in the node.
//   - STF: a LOCKC log becomes an s2m row with recipient_kind 'contract' (replay- and order-proof);
//   - status precedence completed > undeliverable > submitted > observed, over every combination;
//   - the relayer queries (undeliverable rows excluded, recordRelayerCheck never submits, a signed
//     job is never undeliverable, deleting the relayer row re-evaluates);
//   - the API: the frozen I-3 example views reproduced from rows, the new filters, /recipients and
//     /deployment;
//   - the deployment record: the I-3 (c) shape, and every mismatch refused;
//   - the start-up checks: the Solana genesis, and the schema of an older database;
//   - the runtime applies a migration at block 1 only (why the schema check exists);
//   - without delivery adapters, the relayer reports a contract lock undeliverable(no-adapter).
//
// Run: bun test ./node-contract-delivery.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { Keypair, PublicKey } from "@solana/web3.js";
import fastify from "fastify";
import { PGlite } from "@electric-sql/pglite";
import { getMigrationsForBlockHeight } from "@effectstream/db";
import {
  getTransfer,
  listRelayerCandidates,
  migrationTable,
  recordDelivery,
  recordRelayerAttempt,
  recordRelayerCheck,
  recordUndeliverable,
} from "@solana-midnight-bridge/database";
import { createBridgeStateMachine } from "@solana-midnight-bridge/node/state-machine";
import { planSolanaLogs } from "@solana-midnight-bridge/node/stf-logic";
import { createApiRouter, toTransferView, type Recognised } from "@solana-midnight-bridge/node/api";
import { checkSolanaGenesis } from "@solana-midnight-bridge/node/config";
import {
  buildDeploymentRecord,
  DEPLOYMENT_RECORD_SCHEMA,
  DeploymentRecordError,
  verifyRecordInBackground,
  type RecordChainReads,
  type RecordSettings,
} from "@solana-midnight-bridge/node/record";
import {
  assertContractDeliverySchema,
  checkContractDeliverySchema,
  SCHEMA_WIPE_MESSAGE,
} from "@solana-midnight-bridge/node/schema-check";
import { BridgeRelayer } from "@solana-midnight-bridge/node/relayer";
import { networkTagFor } from "@solana-midnight-bridge/contracts-midnight/network";
import { bytesToHex, operatorKeyFromSolanaPublicKey, tokenColor } from "@solana-midnight-bridge/contracts-midnight/signing";
import { parseRecordArgs, CliArgError } from "@solana-midnight-bridge/cli/args";
import { asConnection, freshDb, runGenerator, transferRows } from "./helpers/pglite-db.ts";

const fx = JSON.parse(fs.readFileSync(path.join(import.meta.dirname!, "fixtures/00058-interfaces.json"), "utf8"));
const PROGRAM_ID = "2bqN4ePY9kHSyHkSxhc8WTdRDfpk9BGThCAqGoh6cagf";
const MINT = "H5Eivza5kYbPLExwivZpgh3Ea3MF38pCsdKQcjSXi39w"; // the fixture's mint
const LOCKC_LINE: string = fx.i2.logLines[0].line; // LOCKC|0|…|500000000|a1×32
const A1 = "a1".repeat(32);

async function feedSolana(db: PGlite, sm: ReturnType<typeof createBridgeStateMachine>, block: number, slot: number, lines: string[]) {
  const gen = sm.gameStateTransitions(block, {
    blockHeight: block as any,
    blockTimestamp: Date.now() as any,
    conciseInput: JSON.stringify(["bridge-solana-log", slot, PROGRAM_ID, lines]),
    randomGenerator: undefined as any,
    emit: () => {},
  });
  await runGenerator(db, gen as any);
}
const kinds = async (db: PGlite) =>
  (await db.query<any>(`SELECT direction, source_id::TEXT AS source_id, recipient, recipient_kind FROM bridge_transfers ORDER BY direction, source_id`)).rows;

describe("STF: LOCKC → s2m contract transfer", () => {
  let db: PGlite;
  let sm: ReturnType<typeof createBridgeStateMachine>;
  beforeEach(async () => {
    db = await freshDb();
    sm = createBridgeStateMachine({ programId: PROGRAM_ID, mint: MINT });
  });

  test("the recorded LOCKC line gives one s2m row, recipient_kind 'contract', recipient the 64-hex contract", async () => {
    await feedSolana(db, sm, 10, 100, [LOCKC_LINE]);
    expect(await kinds(db)).toEqual([{ direction: "s2m", source_id: "0", recipient: A1, recipient_kind: "contract" }]);
    expect((await transferRows(db))[0]).toMatchObject({ amount: "500000000", status: "observed", src_ref: "solana-slot:100", observed_block: 10 });
  });

  test("a mixed LOCK, LOCKC, LOCK transaction gives wallet, contract, wallet rows", async () => {
    await feedSolana(db, sm, 11, 101, fx.i2.mixedTransaction.logMessages);
    expect((await kinds(db)).map((r: any) => [r.source_id, r.recipient_kind])).toEqual([["3", "wallet"], ["4", "contract"], ["5", "wallet"]]);
  });

  test("replaying and reordering the inputs gives the same rows", async () => {
    const lines = fx.i2.mixedTransaction.logMessages;
    await feedSolana(db, sm, 11, 101, [LOCKC_LINE]);
    await feedSolana(db, sm, 12, 102, lines);
    const once = await transferRows(db);
    await feedSolana(db, sm, 12, 102, lines);
    await feedSolana(db, sm, 11, 101, [LOCKC_LINE]);
    expect(await transferRows(db)).toEqual(once);
    const db2 = await freshDb();
    await feedSolana(db2, sm, 12, 102, lines);
    await feedSolana(db2, sm, 11, 101, [LOCKC_LINE]);
    expect((await kinds(db2)).map((r: any) => [r.source_id, r.recipient_kind])).toEqual((await kinds(db)).map((r: any) => [r.source_id, r.recipient_kind]));
  });

  test("a LOCKC of another mint, or of another program, is ignored", () => {
    const other = LOCKC_LINE.replace(MINT, Keypair.generate().publicKey.toBase58());
    expect(planSolanaLogs({ slot: 1, programId: PROGRAM_ID, logMessages: [other] }, { programId: PROGRAM_ID, expectedMint: MINT })).toEqual([]);
    expect(planSolanaLogs({ slot: 1, programId: "Other1111111111111111111111111111111111111", logMessages: [LOCKC_LINE] }, { programId: PROGRAM_ID })).toEqual([]);
    expect(planSolanaLogs({ slot: 1, programId: PROGRAM_ID, logMessages: [LOCKC_LINE] }, { programId: PROGRAM_ID, expectedMint: MINT })).toEqual([
      { kind: "lock-observed", nonce: 0n, amount: 500_000_000n, recipientKind: "contract", recipientHex: A1, depositor: "2iwbSktGBUzAPK6KPMjUtsHkuZNAJTY1Rve9ZaF21qu6", slot: 1 },
    ]);
  });

  test("a mint seen on Midnight first leaves the kind open until the lock is observed", async () => {
    await db.exec(`INSERT INTO bridge_transfers (direction, source_id, amount, status, dst_ref, observed_block, completed_block)
                   VALUES ('s2m', 0, 500000000, 'completed', 'midnight-block:9', 9, 9)`);
    expect((await kinds(db))[0].recipient_kind).toBeNull();
    await feedSolana(db, sm, 10, 100, [LOCKC_LINE]);
    expect(await kinds(db)).toEqual([{ direction: "s2m", source_id: "0", recipient: A1, recipient_kind: "contract" }]);
  });
});

describe("status precedence: completed > undeliverable > submitted > observed", () => {
  for (const completed of [false, true]) {
    for (const undeliverable of [false, true]) {
      for (const submitted of [false, true]) {
        const expected = completed ? "completed" : undeliverable ? "undeliverable" : submitted ? "submitted" : "observed";
        test(`completed=${completed} undeliverable=${undeliverable} submitted=${submitted} → ${expected}`, async () => {
          const db = await freshDb();
          await db.exec(`INSERT INTO bridge_transfers (direction, source_id, amount, recipient, recipient_kind, sender, status, observed_block)
                         VALUES ('s2m', 7, 1, '${A1}', 'contract', 'dep', '${completed ? "completed" : "observed"}', 1)`);
          // A combination the relayer never writes (code AND submitted) is still ordered.
          await db.exec(`INSERT INTO relayer_jobs (direction, source_id, attempts, submitted_at, undeliverable_code, undeliverable_reason, undeliverable_at)
                         VALUES ('s2m', 7, 1, ${submitted ? "NOW()" : "NULL"}, ${undeliverable ? "'not-a-contract'" : "NULL"}, ${undeliverable ? "'no state'" : "NULL"}, ${undeliverable ? "NOW()" : "NULL"})`);
          const [row] = await getTransfer.run({ direction: "s2m", source_id: "7" }, asConnection(db) as any);
          const v = toTransferView(row as any);
          expect(v.status).toBe(expected);
          expect(v.reason === null).toBe(expected !== "undeliverable");
        });
      }
    }
  }
});

describe("relayer queries", () => {
  let db: PGlite;
  const conn = () => asConnection(db) as any;
  const job = async (id: string) => (await db.query<any>(`SELECT * FROM relayer_jobs WHERE direction='s2m' AND source_id=${id}`)).rows[0];
  beforeEach(async () => {
    db = await freshDb();
    await db.exec(`INSERT INTO bridge_transfers (direction, source_id, amount, recipient, recipient_kind, sender, status, observed_block) VALUES
      ('s2m', 1, 1, '${A1}', 'contract', 'dep', 'observed', 1),
      ('s2m', 2, 1, '${"ab".repeat(64)}', 'wallet', 'dep', 'observed', 1),
      ('s2m', 3, 1, '${"b2".repeat(32)}', 'contract', 'dep', 'observed', 1)`);
  });

  test("listRelayerCandidates returns recipient_kind and excludes undeliverable rows", async () => {
    await recordUndeliverable.run({ direction: "s2m", source_id: "3", code: "not-a-passport-account", reason: "x", now: new Date() }, conn());
    const rows = await listRelayerCandidates.run({ limit: 10 }, conn());
    expect(rows.map((r) => [String(r.source_id), r.recipient_kind])).toEqual([["1", "contract"], ["2", "wallet"]]);
  });

  test("recordRelayerCheck counts an attempt but never sets submitted_at", async () => {
    await recordRelayerCheck.run({ direction: "s2m", source_id: "1", now: new Date(), last_error: "indexer down" }, conn());
    await recordRelayerCheck.run({ direction: "s2m", source_id: "1", now: new Date(), last_error: "not indexed yet" }, conn());
    expect(await job("1")).toMatchObject({ attempts: 2, submitted_at: null, last_error: "not indexed yet", undeliverable_code: null });
  });

  test("recordUndeliverable never marks a job that was already submitted (a signed mint is never undeliverable)", async () => {
    await recordRelayerAttempt.run({ direction: "s2m", source_id: "1", now: new Date() }, conn());
    await recordUndeliverable.run({ direction: "s2m", source_id: "1", code: "not-a-contract", reason: "x", now: new Date() }, conn());
    expect((await job("1")).undeliverable_code).toBeNull();
    await recordUndeliverable.run({ direction: "s2m", source_id: "3", code: "authority-live", reason: "live", now: new Date() }, conn());
    expect(await job("3")).toMatchObject({ undeliverable_code: "authority-live", undeliverable_reason: "live", attempts: 0, submitted_at: null });
  });

  test("the code is a closed set (CHECK)", async () => {
    await expect(recordUndeliverable.run({ direction: "s2m", source_id: "3", code: "bogus", reason: "x", now: new Date() }, conn())).rejects.toThrow();
  });

  test("README re-evaluation: deleting the relayer row makes the transfer a candidate again", async () => {
    await recordUndeliverable.run({ direction: "s2m", source_id: "3", code: "not-a-passport-account", reason: "x", now: new Date() }, conn());
    expect((await listRelayerCandidates.run({ limit: 10 }, conn())).map((r) => String(r.source_id))).not.toContain("3");
    const readme = fs.readFileSync(path.join(import.meta.dirname!, "../../README.md"), "utf8");
    const sql = /```sql\n(DELETE FROM relayer_jobs WHERE direction = 's2m' AND source_id = <lock nonce>;)\n```/.exec(readme)?.[1];
    expect(sql).toBeDefined();
    await db.exec(sql!.replace("<lock nonce>", "3"));
    expect((await listRelayerCandidates.run({ limit: 10 }, conn())).map((r) => String(r.source_id))).toContain("3");
  });

  test("recordDelivery stores {adapter, account, coin, tx}", async () => {
    await recordRelayerAttempt.run({ direction: "s2m", source_id: "1", now: new Date() }, conn());
    const d = { adapter: "passport-ed25519@21493588", account: A1, coin: { nonce: "5e".repeat(32), colour: "c3".repeat(32), value: "1" }, tx: null };
    await recordDelivery.run({ direction: "s2m", source_id: "1", delivery: JSON.stringify(d) as any }, conn());
    expect((await job("1")).delivery).toEqual(d);
  });
});

describe("API (I-3)", () => {
  let db: PGlite;
  let server: ReturnType<typeof fastify>;
  let recogniser: ((a: string) => Promise<Recognised>) | null;
  let recognised: string[];
  let record: any;
  let clock: number;
  const [vContract, vUndeliverable, vWallet] = fx.i3.transferViews;

  beforeEach(async () => {
    db = await freshDb();
    // The three frozen example views (fixtures/00058-interfaces.json i3.transferViews), as rows.
    const d = vContract.delivery;
    await db.exec(`
      INSERT INTO bridge_transfers (direction, source_id, amount, recipient, recipient_kind, sender, status, src_ref, dst_ref, observed_block, completed_block) VALUES
        ('s2m', 4, 500000000, '${vContract.recipient}', 'contract', '${vContract.sender}', 'completed', '${vContract.srcRef}', '${vContract.dstRef}', 120, 131),
        ('s2m', 5, 1000000, '${vUndeliverable.recipient}', 'contract', '${vUndeliverable.sender}', 'observed', '${vUndeliverable.srcRef}', NULL, 140, NULL),
        ('s2m', 3, 10000000, '${vWallet.recipient}', 'wallet', '${vWallet.sender}', 'completed', '${vWallet.srcRef}', '${vWallet.dstRef}', 118, 125),
        ('m2s', 0, 4, 'Owner1111', NULL, NULL, 'observed', 'midnight-block:12', NULL, 12, NULL);
      INSERT INTO relayer_jobs (direction, source_id, submitted_at, attempts, last_attempt_at, last_tx, delivery) VALUES
        ('s2m', 4, '2026-10-04T12:00:05.000Z', 1, '2026-10-04T12:00:05.000Z', '${vContract.relayer.lastTx}', '${JSON.stringify(d)}'),
        ('s2m', 3, '2026-10-04T11:59:00.000Z', 1, '2026-10-04T11:59:00.000Z', '${vWallet.relayer.lastTx}', NULL);
      INSERT INTO relayer_jobs (direction, source_id, attempts, undeliverable_code, undeliverable_reason, undeliverable_at) VALUES
        ('s2m', 5, 0, '${vUndeliverable.reason.code}', '${vUndeliverable.reason.message.replaceAll("'", "''")}', '${vUndeliverable.reason.at}');
    `);
    recogniser = null;
    recognised = [];
    record = null;
    clock = Date.parse("2026-10-04T12:00:00.000Z");
    server = fastify();
    await createApiRouter({ recognise: () => recogniser, deploymentRecord: () => record, now: () => clock })(server as any, asConnection(db) as any);
    await server.ready();
  });
  afterEach(async () => {
    await server.close();
  });
  const get = async (url: string) => {
    const r = await server.inject({ method: "GET", url });
    return { code: r.statusCode, body: r.json() as any };
  };

  test("GET /transfers/:id reproduces the frozen example views exactly", async () => {
    for (const v of [vContract, vUndeliverable, vWallet]) {
      const { code, body } = await get(`/transfers/${v.id}`);
      expect(code).toBe(200);
      expect(body.transfer).toEqual(v);
    }
    expect((await get("/transfers/m2s:0")).body.transfer).toMatchObject({ recipientKind: "solana", status: "observed", reason: null, delivery: null });
  });

  test("GET /transfers carries the v2 fields and filters by status=undeliverable and recipientKind", async () => {
    const all = (await get("/transfers")).body.transfers;
    expect(all.find((t: any) => t.id === "s2m:5")).toEqual(vUndeliverable);
    expect((await get("/transfers?status=undeliverable")).body.transfers.map((t: any) => t.id)).toEqual(["s2m:5"]);
    expect((await get("/transfers?recipientKind=contract")).body.transfers.map((t: any) => t.id).sort()).toEqual(["s2m:4", "s2m:5"]);
    expect((await get("/transfers?recipientKind=wallet")).body.transfers.map((t: any) => t.id)).toEqual(["s2m:3"]);
    expect((await get("/transfers?recipientKind=solana")).body.transfers.map((t: any) => t.id)).toEqual(["m2s:0"]);
  });

  test("bad input: status=bogus, recipientKind=bogus, a malformed address → 400; an unknown id → 404", async () => {
    expect((await get("/transfers?status=bogus")).code).toBe(400);
    expect((await get("/transfers?recipientKind=bogus")).code).toBe(400);
    expect((await get("/recipients/contract/zz")).code).toBe(400);
    expect((await get(`/recipients/contract/${"a1".repeat(31)}`)).code).toBe(400);
    expect((await get("/transfers/s2m:99")).code).toBe(404);
  });

  test("/recipients without a recogniser → 503; with one → the verdict, cached ≤ 30 s, 0x accepted", async () => {
    expect((await get(`/recipients/contract/${A1}`)).code).toBe(503);
    recogniser = async (a) => {
      recognised.push(a);
      return a === A1
        ? { verdict: "deliverable", adapter: "passport-ed25519@21493588", code: null, message: null }
        : { verdict: "undeliverable", adapter: null, code: "not-a-passport-account", message: "not a Passport account" };
    };
    const r1 = await get(`/recipients/contract/0x${A1.toUpperCase()}`);
    expect(r1.code).toBe(200);
    expect(r1.body).toEqual({ ...fx.i3.recipients[0], address: A1 });
    const y = "b2".repeat(32);
    expect((await get(`/recipients/contract/${y}`)).body).toMatchObject({ verdict: "undeliverable", code: "not-a-passport-account", adapter: null });
    await get(`/recipients/contract/${A1}`);
    expect(recognised).toEqual([A1, y]); // the second A1 request was served from the cache
    clock += 30_001;
    await get(`/recipients/contract/${A1}`);
    expect(recognised).toEqual([A1, y, A1]);
  });

  test("/deployment → 503 until the record is verified, then the record", async () => {
    expect((await get("/deployment")).code).toBe(503);
    record = fx.i3.deploymentRecord;
    const r = await get("/deployment");
    expect(r.code).toBe(200);
    expect(r.body).toEqual(fx.i3.deploymentRecord);
  });
});

describe("deployment record (I-3 (c))", () => {
  const mint = Keypair.generate().publicKey;
  const operator = Keypair.generate().publicKey;
  const contract = "ab".repeat(32);
  const mintBytes = mint.toBytes();
  const colour = bytesToHex(tokenColor(mintBytes, Buffer.from(contract, "hex")));
  const opKey = operatorKeyFromSolanaPublicKey(operator.toBytes());
  const GENESIS = Keypair.generate().publicKey.toBase58();
  const settings = (over: { solana?: object; midnight?: object } = {}): RecordSettings => ({
    solana: {
      cluster: "localnet", rpcUrl: "http://127.0.0.1", programId: PROGRAM_ID, mint: mint.toBase58(), mintDecimals: 6,
      config: "c", authority: "a", vault: "v", operator: operator.toBase58(), startSlot: 42, genesisHash: GENESIS,
      signatures: {}, updatedAt: "x", ...over.solana,
    },
    midnight: {
      networkId: "undeployed", contractAddress: contract, tokenColor: colour, sourceMint: bytesToHex(mintBytes),
      networkTag: bytesToHex(networkTagFor("undeployed")), operator: operator.toBase58(),
      operatorKey: { x: opKey.x.toString(), y: opKey.y.toString() }, startBlockHeight: 7, indexer: "http://indexer", updatedAt: "x",
      ...over.midnight,
    },
    midnightUrls: { id: "undeployed" as never },
  });
  const reads = (over: Partial<Record<keyof RecordChainReads, unknown>> = {}): RecordChainReads => ({
    genesisHash: async () => (over.genesisHash as string) ?? GENESIS,
    mintDecimals: async () => (over.mintDecimals as number) ?? 6,
    programConfig: async () => (over.programConfig as any) ?? { operator: operator.toBase58(), mint: mint.toBase58() },
    contractSeals: async () => (over.contractSeals as any) ?? { sourceMint: mintBytes, operatorKey: opKey, networkTag: networkTagFor("undeployed") },
  });

  test("the record has exactly the frozen shape and values", async () => {
    const r = await buildDeploymentRecord(settings(), reads(), { api: "http://127.0.0.1:18080/", name: "X", symbol: "X" });
    expect(Object.keys(r).sort()).toEqual(Object.keys(fx.i3.deploymentRecord).sort());
    expect(r).toEqual({
      schema: DEPLOYMENT_RECORD_SCHEMA, splMint: mint.toBase58(), splMintDecimals: 6, name: "X", symbol: "X",
      bridgeProgram: PROGRAM_ID, bridgeContract: contract, colour, operatorKey: operator.toBase58(), midnightNetwork: "undeployed",
      solanaGenesisHash: GENESIS, api: "http://127.0.0.1:18080", startSlot: 42, startBlockHeight: 7, delivery: { adapters: [] },
    });
    const bare = await buildDeploymentRecord(settings(), reads(), { api: "https://bridge.example.org" });
    expect("name" in bare || "symbol" in bare).toBe(false);
  });

  const other = Keypair.generate().publicKey;
  const cases: Array<[string, () => Promise<unknown>, RegExp]> = [
    ["the program's operator", () => buildDeploymentRecord(settings(), reads({ programConfig: { operator: other.toBase58(), mint: mint.toBase58() } }), { api: "http://a" }), /stored operator/],
    ["the program's mint", () => buildDeploymentRecord(settings(), reads({ programConfig: { operator: operator.toBase58(), mint: other.toBase58() } }), { api: "http://a" }), /stored mint/],
    ["the sealed mint", () => buildDeploymentRecord(settings(), reads({ contractSeals: { sourceMint: other.toBytes(), operatorKey: opKey, networkTag: networkTagFor("undeployed") } }), { api: "http://a" }), /sealed sourceMint/],
    ["the operator key", () => buildDeploymentRecord(settings(), reads({ contractSeals: { sourceMint: mintBytes, operatorKey: operatorKeyFromSolanaPublicKey(other.toBytes()), networkTag: networkTagFor("undeployed") } }), { api: "http://a" }), /sealed operatorKey/],
    ["the network tag", () => buildDeploymentRecord(settings(), reads({ contractSeals: { sourceMint: mintBytes, operatorKey: opKey, networkTag: networkTagFor("stagenet") } }), { api: "http://a" }), /sealed networkTag/],
    ["a colour that does not recompute", () => buildDeploymentRecord(settings({ midnight: { tokenColor: "c3".repeat(32) } }), reads(), { api: "http://a" }), /colour does not recompute/],
    ["the genesis hash", () => buildDeploymentRecord(settings(), reads({ genesisHash: other.toBase58() }), { api: "http://a" }), /genesis hash/],
    ["the mint's decimals", () => buildDeploymentRecord(settings(), reads({ mintDecimals: 9 }), { api: "http://a" }), /decimals/],
    ["the Midnight network", () => buildDeploymentRecord(settings({ midnight: { networkId: "stagenet" } }), reads(), { api: "http://a" }), /Midnight network/],
    ["a symbol over 8 characters", () => buildDeploymentRecord(settings(), reads(), { api: "http://a", symbol: "TOOLONGSYM" }), /symbol/],
    ["a symbol with a space", () => buildDeploymentRecord(settings(), reads(), { api: "http://a", symbol: "A B" }), /symbol/],
    ["an api with a path", () => buildDeploymentRecord(settings(), reads(), { api: "http://a/x" }), /origin/],
  ];
  for (const [what, run, msg] of cases) {
    test(`refused, with a specific message: ${what}`, async () => {
      const e = await run().then(() => null, (x) => x);
      expect(e).toBeInstanceOf(DeploymentRecordError);
      expect(String(e.message)).toMatch(msg);
    });
  }

  test("a deployment the chains do not show yet is a transient error (retried), a mismatch is fatal", async () => {
    const noContract = await buildDeploymentRecord(settings(), { ...reads(), contractSeals: async () => null }, { api: "http://a" }).then(() => null, (x) => x);
    expect(noContract).toBeInstanceOf(DeploymentRecordError);
    expect(noContract.transient).toBe(true);
    const noConfig = await buildDeploymentRecord(settings(), { ...reads(), programConfig: async () => null }, { api: "http://a" }).then(() => null, (x) => x);
    expect(noConfig.transient).toBe(true);
    let tries = 0;
    const mismatches: string[] = [];
    const v = verifyRecordInBackground({
      build: async () => {
        tries++;
        if (tries < 3) throw new DeploymentRecordError("not indexed yet", true);
        return buildDeploymentRecord(settings(), reads(), { api: "http://a" });
      },
      retryMs: 5,
      log: () => {},
      onMismatch: (e) => mismatches.push(e.message),
    });
    for (let i = 0; i < 100 && !v.current(); i++) await Bun.sleep(5);
    expect(v.current()?.colour).toBe(colour);
    expect(tries).toBe(3);
    const w = verifyRecordInBackground({
      build: () => buildDeploymentRecord(settings(), reads({ genesisHash: other.toBase58() }), { api: "http://a" }),
      log: () => {},
      onMismatch: (e) => mismatches.push(e.message),
    });
    for (let i = 0; i < 100 && mismatches.length === 0; i++) await Bun.sleep(5);
    expect(mismatches[0]).toMatch(/genesis hash/);
    expect(w.current()).toBeNull();
  });

  test("bridge:record arguments", () => {
    expect(parseRecordArgs(["--api", "https://x.example.org", "--name", "X", "--symbol", "X"])).toMatchObject({ api: "https://x.example.org", name: "X", symbol: "X", mode: "local" });
    expect(() => parseRecordArgs([])).toThrow(/--api is required/);
    expect(() => parseRecordArgs(["--api", "ftp://x"])).toThrow(CliArgError);
    expect(() => parseRecordArgs(["--api", "http://x", "--symbol", "WAYTOOLONG"])).toThrow(/--symbol/);
    expect(() => parseRecordArgs(["--api", "http://x", "--name", " X"])).toThrow(/--name/);
  });
});

describe("start-up checks", () => {
  const base = { solanaRpcUrl: "http://127.0.0.1:8899", deploymentFile: "deployments/x.json" };
  test("a Solana RPC with another genesis → the node refuses to start", async () => {
    const solana = { genesisHash: "GenesisA111111111111111111111111111111111111" } as any;
    await expect(checkSolanaGenesis({ ...base, solana }, async () => "GenesisB111111111111111111111111111111111111")).rejects.toThrow(/refusing to start/);
    expect(await checkSolanaGenesis({ ...base, solana }, async () => solana.genesisHash)).toEqual({ checked: true, genesis: solana.genesisHash });
    const warned: string[] = [];
    expect(await checkSolanaGenesis({ ...base, solana: {} as any }, async () => "G", (m) => warned.push(m))).toEqual({ checked: false, genesis: "G" });
    expect(warned[0]).toMatch(/no solana.genesisHash/);
  });

  test("schema: a fresh database passes, a 00050 database is refused (wipe and re-sync), a 00058 one passes", async () => {
    const q = (db: PGlite) => (t: string, v?: unknown[]) => db.query<Record<string, unknown>>(t, v as any[]) as any;
    const empty = new PGlite();
    expect(await checkContractDeliverySchema(q(empty))).toEqual({ ok: true, fresh: true });
    const old = new PGlite();
    await old.exec(migrationTable[0]!.sql); // 000-init only: what a 00050 node created
    const v = await checkContractDeliverySchema(q(old));
    expect(v.ok).toBe(false);
    await expect(assertContractDeliverySchema(q(old))).rejects.toThrow(SCHEMA_WIPE_MESSAGE);
    expect(await checkContractDeliverySchema(q(await freshDb()))).toEqual({ ok: true, fresh: false });
  });

  test("the runtime applies a template migration only at its block (default 1): 001 never reaches a database past block 1", () => {
    expect(migrationTable.map((m) => m.name)).toEqual(["000-init.sql", "001-contract-delivery.sql"]);
    expect(getMigrationsForBlockHeight(migrationTable, 1, 1).map((m: any) => m.name)).toEqual(["000-init.sql", "001-contract-delivery.sql"]);
    expect(getMigrationsForBlockHeight(migrationTable, 2, 2)).toEqual([]);
    expect(getMigrationsForBlockHeight(migrationTable, 5000, 5000)).toEqual([]);
  });
});

describe("relayer without delivery adapters: a contract lock is undeliverable(no-adapter), never minted", () => {
  test("the contract candidate gets no-adapter and no signature; the wallet candidate takes the 00050 path", async () => {
    const db = await freshDb();
    await db.exec(`INSERT INTO bridge_transfers (direction, source_id, amount, recipient, recipient_kind, sender, status, observed_block) VALUES
      ('s2m', 0, 1, '${A1}', 'contract', 'dep', 'observed', 1),
      ('s2m', 1, 1, '${"ab".repeat(64)}', 'wallet', 'dep', 'observed', 1)`);
    const minted: string[] = [];
    const r = new BridgeRelayer({
      db: asConnection(db),
      submitMint: async (j) => {
        minted.push(String(j.sourceId));
        return { tx: "t" };
      },
      submitRelease: async () => ({ tx: "t" }),
      releaseReceiptExists: async () => false,
      mintExists: async () => false,
      log: () => {},
    });
    await r.tick();
    await r.drain();
    await r.tick();
    await r.drain();
    expect(minted).toEqual(["1"]);
    const rows = (await db.query<any>(`SELECT source_id::TEXT AS s, undeliverable_code AS c, submitted_at IS NOT NULL AS sub FROM relayer_jobs ORDER BY source_id`)).rows;
    expect(rows).toEqual([{ s: "0", c: "no-adapter", sub: false }, { s: "1", c: null, sub: true }]);
  });
});
