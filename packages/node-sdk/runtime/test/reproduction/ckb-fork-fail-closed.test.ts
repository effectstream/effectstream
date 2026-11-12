/**
 * Persisted-state CKB fork detection and root-transaction atomicity.
 *
 * This deliberately does not claim recovery: the CKB adapter fails closed and
 * EffectStream has no canonical rewind/rebuild API. It verifies the existing
 * safety boundary against isolated real PostgreSQL databases.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import pg from "pg";
import { ConfigNetworkType, ConfigSyncProtocolType } from "@effectstream/config";
import { Primitive, PrimitiveRegistry } from "@effectstream/sm";
import { run } from "effection";
import type { CkbFetch } from "ckb-multichain-connector";
import { CkbFetcher, CkbSyncState } from "@effectstream/sync";
import { processFinalizedBlock } from "../../src/process-blocks.ts";
import type { StartConfig } from "../../src/types.ts";
import type { ChainBlock } from "@effectstream/sync";
import { postgresAvailable, setupHarness } from "./harness.ts";

const hash = (n: string) => `0x${n.repeat(64)}`;
const protocolName = "ckb-fork-repro";
const primitiveName = "ckb-fork-event-repro";
const script = { code_hash: hash("a"), hash_type: "type", args: "0x1234" };
const network = {
  name: "ckb-fork-repro-net",
  type: ConfigNetworkType.CKB,
  // The injected fetch never opens a socket, but connector config requires a
  // loopback HTTP URL for local fixtures.
  rpcUrl: "http://127.0.0.1:8114",
  network: "devnet" as const,
  genesisBlockHash: hash("0"),
};
const syncProtocol = {
  name: protocolName,
  type: ConfigSyncProtocolType.CKB_RPC_PARALLEL,
  startBlockHeight: 0,
  stopBlockHeight: null,
  pollingInterval: 1_000,
  requestTimeoutMs: 1_000,
  confirmationDepth: 0,
  reorgWindow: 4,
  targetScript: {
    role: "lock" as const,
    script: { codeHash: hash("a"), hashType: "type" as const, args: "0x1234" },
  },
  delayMs: 0,
  stepSize: 2,
};
const fetchConfig: any = {
  network,
  syncProtocol,
  primitives: [{ id: primitiveName }],
};
const runtimeConfig = {
  appName: "ckb-fork-repro",
  appVersion: "1.0.0",
  syncInfo: [],
} as StartConfig;

class CkbAccountingProbe extends Primitive<any, any> {
  readonly internalTypeName = "CKB:CellCreated" as any;
  override grammar = [] as any;

  constructor() {
    super({ instanceName: primitiveName, startBlockHeight: 0, stateMachinePrefix: undefined });
  }

  override *getPayload(_height: number, primitiveData: any): any {
    return {
      isBatched: false,
      data: [{
        fromAddressAndType: { type: "none", address: "0x0" },
        accountingPayload: primitiveData.output.payload,
        stateMachinePayload: null,
      }],
    };
  }

  override getConfig(): any {
    return { name: primitiveName, type: this.internalTypeName, startBlockHeight: 0 };
  }
}

type FixtureBlock = { header: { number: string; hash: string; timestamp: string; parent_hash: string }; transactions: unknown[] };
function block(height: number, id: string, parent: string, transactions: unknown[] = []): FixtureBlock {
  return {
    header: {
      number: `0x${height.toString(16)}`,
      hash: hash(id),
      parent_hash: hash(parent),
      timestamp: `0x${(1_700_000_000_000 + height * 1_000).toString(16)}`,
    },
    transactions,
  };
}

function matchingTx(id: string, capacity = "0x2540be400") {
  return {
    hash: hash(id),
    inner: {
      outputs: [{ capacity, lock: script, type: null }],
      outputs_data: ["0x"],
    },
  };
}

function rpcFixture(initial: FixtureBlock[]) {
  let history = new Map(initial.map((item) => [Number(BigInt(item.header.number)), item]));
  const fetch: CkbFetch = async (_input, init) => {
    const req = JSON.parse(String(init?.body)) as { id: number; method: string; params: string[] };
    const height = req.params[0] == null ? undefined : Number(BigInt(req.params[0]));
    let result: unknown;
    if (req.method === "get_block_by_number") result = history.get(height!);
    else if (req.method === "get_header_by_number") result = history.get(height!)?.header;
    else if (req.method === "get_tip_header") result = history.get(Math.max(...history.keys()))?.header;
    else throw new Error(`Unexpected CKB RPC method ${req.method}`);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id, result }), { status: 200 });
  };
  return { fetch, replace: (next: FixtureBlock[]) => { history = new Map(next.map((item) => [Number(BigInt(item.header.number)), item])); } };
}

function chainBlock(output: any, rootHeight: number, state: CkbSyncState, invalidResumePage = false): ChainBlock {
  const rootOutput: any = { primitives: [], blockInfo: [] };
  state.mergeDatum(output, rootOutput);
  const resumePage = state.outputToLastPage(output);
  return {
    blockNumber: rootHeight as any,
    timestamp: Number(output.raw.timestamp) as any,
    blockInfo: rootOutput.blockInfo,
    resumePages: [{
      protocol_name: protocolName,
      lastPage: {
        ...resumePage,
        ownBlockNumber: invalidResumePage ? "invalid" : output.page.height,
      } as any,
    }],
    primitives: rootOutput.primitives,
  } as ChainBlock;
}

async function persist(pool: pg.Pool, value: ChainBlock, previousHash: any): Promise<any> {
  const client = await pool.connect();
  try {
    return await run(() => processFinalizedBlock(value, runtimeConfig, client as any, previousHash));
  } finally {
    client.release();
  }
}

async function previousRootHash(pool: pg.Pool): Promise<string | null> {
  const result = await pool.query<{ hash: string | null }>(
    `SELECT encode(effectstream_block_hash, 'hex') AS hash
       FROM effectstream.effectstream_blocks WHERE block_height = 1`,
  );
  const hex = result.rows[0]?.hash;
  return hex == null ? null : Buffer.from(hex, "hex").toString();
}

async function capture(pool: pg.Pool) {
  const [blocks, pages, accounting] = await Promise.all([
    pool.query(`SELECT block_height, encode(main_chain_block_hash, 'hex') AS source_marker,
                       encode(effectstream_block_hash, 'hex') AS root_hash
                  FROM effectstream.effectstream_blocks WHERE block_height >= 2 ORDER BY block_height`),
    pool.query(`SELECT protocol_name, page_number, page FROM effectstream.sync_protocol_pagination
                 WHERE protocol_name = $1`, [protocolName]),
    pool.query(`SELECT effectstream_block_height, payload_type, payload
                  FROM effectstream.primitive_accounting
                 WHERE primitive_name = $1 ORDER BY effectstream_block_height, payload::text`, [primitiveName]),
  ]);
  return { blocks: blocks.rows, pages: pages.rows, accounting: accounting.rows };
}

let harnessA: Awaited<ReturnType<typeof setupHarness>> | undefined;
let harnessB: Awaited<ReturnType<typeof setupHarness>> | undefined;
const itWithPostgres = process.env.PGLITE === "false" && postgresAvailable() ? test : test.skip;

beforeAll(() => {
  if (!PrimitiveRegistry.primitives[primitiveName]) new CkbAccountingProbe();
});

afterAll(async () => {
  await harnessA?.teardown();
  await harnessB?.teardown();
});

itWithPostgres("persisted CKB fork fails closed without partial root writes; clean replacement replay differs", async () => {
  harnessA = await setupHarness({ backend: "postgres" });
  harnessB = await setupHarness({ backend: "postgres" });

  // Boot the real runtime once per isolated DB to apply its system migrations,
  // with the supported harness's MQTT broker disabled.
  await harnessA.runToHeight({ events: [], tips: { mainClock: 1, parallelP: 2 }, target: 1, apiPort: 19431 });
  await harnessB.runToHeight({ events: [], tips: { mainClock: 1, parallelP: 2 }, target: 1, apiPort: 19432 });

  const historyA = [block(0, "0", "0"), block(1, "1", "0", [matchingTx("b")]), block(2, "2", "1")];
  const fixture = rpcFixture(historyA);
  const fetchA = new CkbFetcher(fetchConfig, fixture.fetch);
  const stateA = new CkbSyncState(undefined, fetchConfig, fetchA, {} as any);
  const fetchedA = await run(() => fetchA.readData({
    from: { height: 0 }, to: { height: 1 }, isPresync: false,
  } as any, { toRootPage: (item: any) => Number(item.raw.timestamp) } as any));
  expect(fetchedA.output.map((item) => item.output.raw.hash)).toEqual([hash("0"), hash("1")]);

  let prevA = await previousRootHash(harnessA.pool);
  prevA = (await persist(harnessA.pool, chainBlock(fetchedA.output[0]!.output, 2, stateA), prevA)).blockHash;
  await persist(harnessA.pool, chainBlock(fetchedA.output[1]!.output, 3, stateA), prevA);
  const beforeFork = await capture(harnessA.pool);
  expect(beforeFork.pages).toHaveLength(1);
  expect(beforeFork.pages[0]?.page.own.cursor.lastProcessed).toEqual({ height: "1", hash: hash("1") });
  expect(beforeFork.accounting).toHaveLength(1);
  expect(beforeFork.accounting[0]?.payload.cell.outPoint.transactionHash).toBe(hash("b"));

  // Prove a transaction failure after block/accounting writes rolls back the
  // entire root transaction, including its resume marker.
  await expect(persist(harnessA.pool, chainBlock(fetchedA.output[1]!.output, 4, stateA, true), prevA)).rejects.toThrow();
  expect(await capture(harnessA.pool)).toEqual(beforeFork);

  const historyB = [block(0, "0", "0"), block(1, "a", "0", [matchingTx("c", "0x2")] ), block(2, "d", "a")];
  fixture.replace(historyB);
  const restarted = new CkbFetcher(fetchConfig, fixture.fetch);
  await expect(Promise.resolve(run(() => restarted.readData({
    from: { height: 2, cursor: fetchedA.lastPage.own.cursor },
    to: { height: 2, cursor: fetchedA.lastPage.own.cursor },
    isPresync: false,
  } as any, { toRootPage: (item: any) => Number(item.raw.timestamp) } as any)))).rejects.toThrow(/canonical history changed/i);
  expect(await capture(harnessA.pool)).toEqual(beforeFork);

  // Independent clean replay establishes the replacement canonical result and
  // demonstrates why the retained History A DB cannot be called recovered.
  const fetchB = new CkbFetcher(fetchConfig, fixture.fetch);
  const stateB = new CkbSyncState(undefined, fetchConfig, fetchB, {} as any);
  const fetchedB = await run(() => fetchB.readData({
    from: { height: 0 }, to: { height: 1 }, isPresync: false,
  } as any, { toRootPage: (item: any) => Number(item.raw.timestamp) } as any));
  let prevB = await previousRootHash(harnessB.pool);
  prevB = (await persist(harnessB.pool, chainBlock(fetchedB.output[0]!.output, 2, stateB), prevB)).blockHash;
  await persist(harnessB.pool, chainBlock(fetchedB.output[1]!.output, 3, stateB), prevB);
  const cleanB = await capture(harnessB.pool);
  expect(cleanB.accounting).toHaveLength(1);
  expect(cleanB.accounting[0]?.payload.cell.outPoint.transactionHash).toBe(hash("c"));
  expect(cleanB.pages[0]?.page.own.cursor.lastProcessed).toEqual({ height: "1", hash: hash("a") });
  expect(cleanB).not.toEqual(beforeFork);
}, 120_000);
