// T4 tests (native; no chain, no ports): the relayer's job selection and
// backoff over a test database (in-process PGLite with the template's
// migrations), its bookkeeping with fake submitters, and the two counterpart
// inputs it builds — checked against the engine adapters' own validation and,
// for the mint, by running the bridge circuit locally on the result.
//
// Run: bun test ./relayer-jobs.test.ts
import { beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { Keypair, PublicKey } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import type { PGlite } from "@electric-sql/pglite";
import {
  SolanaSignerAdapter,
  parseCircuitArgs,
  validateCoinEncPublicKeyMappings,
} from "@effectstream/batcher-sdk";
import {
  BridgeRelayer,
  DEFAULT_POLICIES,
  backoffMs,
  buildMintInput,
  buildReleaseInput,
  isDue,
  isReplayRefusal,
  nextTimestamp,
  selectDueJobs,
  type RelayerCandidate,
} from "@solana-midnight-bridge/node/relayer";
import {
  Bridge,
  BridgeRuntime as rt,
  bytesToHex,
  networkTagFor,
  operatorKeyFromSolanaPublicKey,
  readContractInfo,
  tokenColor,
} from "@solana-midnight-bridge/contracts-midnight";
import { asConnection, freshDb, transferRows } from "./helpers/pglite-db.ts";

const rnd = (n: number) => new Uint8Array(randomBytes(n));
const MIN = 60_000;

const cand = (o: Partial<RelayerCandidate>): RelayerCandidate => ({
  direction: "s2m", sourceId: 0n, amount: 10n, recipient: "aa", attempts: 0,
  lastAttemptAt: null, lastTx: null, lastError: null, ...o,
});

describe("backoff and selection (pure)", () => {
  test("exponential backoff, capped", () => {
    const p = { baseMs: 1000, maxMs: 5000 };
    expect([0, 1, 2, 3, 4, 10].map((a) => backoffMs(a, p))).toEqual([0, 1000, 2000, 4000, 5000, 5000]);
  });

  test("a job is due when never attempted, or when its backoff has passed", () => {
    const now = 1_000_000;
    const p = DEFAULT_POLICIES.s2m;
    expect(isDue(cand({}), now, p)).toBe(true);
    expect(isDue(cand({ attempts: 1, lastAttemptAt: new Date(now - p.baseMs + 1) }), now, p)).toBe(false);
    expect(isDue(cand({ attempts: 1, lastAttemptAt: new Date(now - p.baseMs) }), now, p)).toBe(true);
    expect(isDue(cand({ attempts: 2, lastAttemptAt: new Date(now - p.baseMs) }), now, p)).toBe(false);
  });

  test("at most one job per direction, the lowest due id, none while that direction is in flight", () => {
    const c = [
      cand({ sourceId: 5n }), cand({ sourceId: 2n }),
      cand({ direction: "m2s", sourceId: 9n }), cand({ direction: "m2s", sourceId: 1n, attempts: 1, lastAttemptAt: new Date() }),
    ];
    const due = selectDueJobs(c, { now: Date.now(), inFlight: new Set() });
    expect(due.map((j) => `${j.direction}:${j.sourceId}`)).toEqual(["s2m:2", "m2s:9"]);
    expect(selectDueJobs(c, { now: Date.now(), inFlight: new Set(["s2m:7"]) }).map((j) => j.direction)).toEqual(["m2s"]);
  });

  test("input timestamps are unique, increasing milliseconds", () => {
    const ts = Array.from({ length: 50 }, () => Number(nextTimestamp()));
    expect(new Set(ts).size).toBe(50);
    expect(ts.every((t, i) => i === 0 || t > ts[i - 1]!)).toBe(true);
    expect(Math.abs(ts[0]! - Date.now())).toBeLessThan(60_000);
  });

  test("replay refusals are recognized (left to sync)", () => {
    expect(isReplayRefusal("Error: failed assert: lock already minted")).toBe(true);
    expect(isReplayRefusal('Transaction simulation failed: {"InstructionError":[1,{"Custom":6}]}')).toBe(true);
    expect(isReplayRefusal("custom program error: 0x6")).toBe(true);
    expect(isReplayRefusal("failed assert: bad signature")).toBe(false);
  });
});

describe("relayer over a test database", () => {
  let db: PGlite;
  let clock: number;
  let mints: RelayerCandidate[];
  let releases: RelayerCandidate[];
  let gate: { release: () => void; promise: Promise<void> };
  let receiptExists: Set<bigint>;
  let mintBehaviour: (job: RelayerCandidate) => Promise<{ tx: string }>;

  const newGate = () => {
    let release!: () => void;
    const promise = new Promise<void>((r) => (release = r));
    return { release, promise };
  };

  const relayer = () =>
    new BridgeRelayer({
      db: asConnection(db),
      now: () => clock,
      submitMint: (job) => {
        mints.push(job);
        return mintBehaviour(job);
      },
      submitRelease: async (job) => {
        releases.push(job);
        await gate.promise;
        return { tx: `sig-${job.sourceId}` };
      },
      releaseReceiptExists: async (id) => receiptExists.has(id),
      log: () => {},
    });

  const jobs = async () =>
    (await db.query<any>(
      `SELECT direction, source_id::TEXT AS source_id, attempts, last_tx, last_error, submitted_at IS NOT NULL AS submitted
       FROM relayer_jobs ORDER BY direction, source_id`,
    )).rows;

  beforeEach(async () => {
    db = await freshDb();
    clock = Date.parse("2026-10-02T12:00:00Z");
    mints = [];
    releases = [];
    gate = newGate();
    receiptExists = new Set();
    mintBehaviour = async (job) => ({ tx: `mint-${job.sourceId}` });
    await db.exec(`
      INSERT INTO bridge_transfers (direction, source_id, amount, recipient, sender, status, src_ref, observed_block)
      VALUES ('s2m', 0, 10, '${"ab".repeat(64)}', 'dep', 'observed', 'solana-slot:1', 1),
             ('s2m', 1, 5, '${"cd".repeat(64)}', 'dep', 'observed', 'solana-slot:2', 2),
             ('s2m', 2, 5, NULL, NULL, 'completed', NULL, 3),
             ('m2s', 0, 4, '${Keypair.generate().publicKey.toBase58()}', NULL, 'observed', 'midnight-block:4', 4),
             ('m2s', 1, 4, '${Keypair.generate().publicKey.toBase58()}', NULL, 'completed', 'midnight-block:5', 5);
    `);
  });

  test("candidates are the observed transfers with a recipient", async () => {
    const c = await relayer().candidates();
    expect(c.map((j) => `${j.direction}:${j.sourceId}`)).toEqual(["m2s:0", "s2m:0", "s2m:1"]);
  });

  test("a tick starts one job per direction, records the attempts, and never writes bridge_transfers", async () => {
    const before = await transferRows(db);
    const r = relayer();
    expect(await r.tick()).toEqual(["s2m:0", "m2s:0"]);
    // The release is still in flight: a second tick starts the next mint only once the first finished.
    await Bun.sleep(10);
    expect(await r.tick()).toEqual(["s2m:1"]);
    expect(await r.tick()).toEqual([]);
    gate.release();
    await r.drain();
    expect(await jobs()).toEqual([
      { direction: "m2s", source_id: "0", attempts: 1, last_tx: "sig-0", last_error: null, submitted: true },
      { direction: "s2m", source_id: "0", attempts: 1, last_tx: "mint-0", last_error: null, submitted: true },
      { direction: "s2m", source_id: "1", attempts: 1, last_tx: "mint-1", last_error: null, submitted: true },
    ]);
    expect(await transferRows(db)).toEqual(before);
  });

  test("a submitted job waits for its backoff, then is re-attempted until sync completes it", async () => {
    gate.release();
    const r = relayer();
    await r.tick();
    await r.drain();
    await r.tick(); // s2m:1
    await r.drain();
    expect(mints.map((j) => j.sourceId)).toEqual([0n, 1n]);
    // Nothing is due before the shorter (release) backoff has passed...
    const t0 = clock;
    clock = t0 + DEFAULT_POLICIES.m2s.baseMs - 1;
    expect(await r.tick()).toEqual([]);
    // ...then the release is re-attempted, and the mint only after its own (longer) backoff.
    clock = t0 + DEFAULT_POLICIES.m2s.baseMs;
    expect(await r.tick()).toEqual(["m2s:0"]);
    await r.drain();
    clock = t0 + DEFAULT_POLICIES.s2m.baseMs - 1;
    expect(await r.tick()).toEqual([]);
    clock = t0 + DEFAULT_POLICIES.s2m.baseMs;
    expect(await r.tick()).toEqual(["s2m:0"]);
    await r.drain();
    expect((await jobs()).find((j: any) => j.direction === "s2m" && j.source_id === "0").attempts).toBe(2);
    // Sync marks it completed: it is no longer a candidate.
    await db.exec(`UPDATE bridge_transfers SET status = 'completed' WHERE direction = 's2m' AND source_id = 0`);
    clock += 10 * MIN;
    const started = await r.tick();
    expect(started).not.toContain("s2m:0");
  });

  test("an existing release receipt means no release is sent", async () => {
    receiptExists.add(0n);
    const r = relayer();
    await r.tick();
    await r.drain();
    expect(releases).toEqual([]);
    const j = (await jobs()).find((x: any) => x.direction === "m2s");
    expect(j).toMatchObject({ attempts: 1, last_tx: null });
    expect(j.last_error).toContain("release receipt exists on chain");
  });

  test("an on-chain replay refusal is recorded as already settled; other errors as errors", async () => {
    mintBehaviour = async (job) => {
      throw new Error(job.sourceId === 0n ? "Failed to submit batch: failed assert: lock already minted" : "proof server unreachable");
    };
    gate.release();
    const r = relayer();
    await r.tick();
    await r.drain();
    await r.tick();
    await r.drain();
    const rows = await jobs();
    expect(rows.find((x: any) => x.source_id === "0" && x.direction === "s2m").last_error).toStartWith("already settled on chain:");
    expect(rows.find((x: any) => x.source_id === "1" && x.direction === "s2m").last_error).toBe("proof server unreachable");
  });
});

describe("counterpart inputs", () => {
  const operator = Keypair.generate();
  const programId = Keypair.generate().publicKey;
  const mint = Keypair.generate().publicKey;
  const cpk = rnd(32);
  const epk = rnd(32);
  const recipientHex = bytesToHex(cpk) + bytesToHex(epk);

  test("the mint input parses with the batcher's parser over the raw contract info and passes the circuit (run locally)", async () => {
    // A bridge instance in the local runtime, sealed with this operator and network.
    const tag = networkTagFor("undeployed");
    const sourceMint = mint.toBytes();
    const contract = new Bridge.Contract({});
    const cpkCaller = bytesToHex(rnd(32));
    const ctor = await contract.initialState(rt.createConstructorContext({}, cpkCaller), operatorKeyFromSolanaPublicKey(operator.publicKey.toBytes()), sourceMint, tag);
    const address = rt.sampleContractAddress();

    const { input, mapping } = buildMintInput(
      { sourceId: 7n, amount: 10_000_000n, recipient: recipientHex },
      { contractAddress: address, networkTag: bytesToHex(tag) },
      operator.secretKey,
    );
    expect(input.target).toBe("midnight");
    const body = JSON.parse(input.input);
    expect(body.circuit).toBe("mintFromSolana");
    expect(mapping).toEqual([bytesToHex(cpk), bytesToHex(epk)]);
    expect(body.coinEncPublicKeyMappings).toEqual([mapping]);
    expect(validateCoinEncPublicKeyMappings(body.coinEncPublicKeyMappings)).toBeFalsy();

    // The relayer's MidnightAdapter gets the raw compactc 0.35.0 contract info (engine E8).
    const args = parseCircuitArgs("mintFromSolana", body.args, readContractInfo() as any);
    const ctx = rt.createCircuitContext({ circuitId: "mintFromSolana", contractAddress: address, coinPublicKeyOrZswapState: cpkCaller, contractState: ctor.currentContractState, privateState: {} });
    const r = await (contract.circuits as any).mintFromSolana(ctx, ...args);
    expect(r.result.value).toBe(10_000_000n);
    expect(bytesToHex(r.result.color)).toBe(bytesToHex(tokenColor(sourceMint, Uint8Array.from(Buffer.from(address, "hex")))));

    // The same input against an instance on another network tag is refused in-circuit.
    const other = await contract.initialState(rt.createConstructorContext({}, cpkCaller), operatorKeyFromSolanaPublicKey(operator.publicKey.toBytes()), sourceMint, networkTagFor("stagenet"));
    const ctx2 = rt.createCircuitContext({ circuitId: "mintFromSolana", contractAddress: address, coinPublicKeyOrZswapState: cpkCaller, contractState: other.currentContractState, privateState: {} });
    await expect((contract.circuits as any).mintFromSolana(ctx2, ...args)).rejects.toThrow(/bad signature/);
  });

  test("the release input passes the SolanaSignerAdapter's signature and allow-list checks", () => {
    const owner = Keypair.generate().publicKey;
    const { input, destination } = buildReleaseInput(
      { sourceId: 3n, amount: 4_000_000n, recipient: owner.toBase58() },
      { programId: programId.toBase58(), mint: mint.toBase58() },
      operator,
    );
    expect(destination).toBe(getAssociatedTokenAddressSync(mint, owner, true).toBase58());
    const adapter = new SolanaSignerAdapter({
      rpcUrl: "http://127.0.0.1:1",
      operatorSecretKey: bs58.encode(operator.secretKey),
      allowedProgramIds: [programId.toBase58(), ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()],
    });
    expect(adapter.verifySignature(input)).toBe(true);
    expect(adapter.validateInput(input)).toEqual({ valid: true });
    const body = JSON.parse(input.input);
    expect(body.computeUnitLimit).toBe(150_000);
    expect(body.instructions.map((i: any) => i.programId)).toEqual([ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(), programId.toBase58()]);
    const data = Buffer.from(body.instructions[1].dataBase64, "base64");
    expect([data[0], data.readBigUInt64LE(1), data.readBigUInt64LE(9)]).toEqual([2, 3n, 4_000_000n]);

    // Without the associated-token program in the allow-list the input is refused.
    const strict = new SolanaSignerAdapter({
      rpcUrl: "http://127.0.0.1:1",
      operatorSecretKey: bs58.encode(operator.secretKey),
      allowedProgramIds: [programId.toBase58()],
    });
    expect(strict.validateInput(input).valid).toBe(false);
    // A release signed by another key does not pass the operator check.
    const forged = buildReleaseInput(
      { sourceId: 3n, amount: 4_000_000n, recipient: owner.toBase58() },
      { programId: programId.toBase58(), mint: mint.toBase58() },
      Keypair.generate(),
    ).input;
    expect(adapter.verifySignature({ ...forged, address: operator.publicKey.toBase58() })).toBe(false);
  });
});
