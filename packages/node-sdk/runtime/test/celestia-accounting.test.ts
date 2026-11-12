/**
 * What the celestia-generic primitive keeps in `effectstream.primitive_accounting`
 * and what it hands to the state machine.
 *
 * Everything below runs on the engine's real paths:
 * - the database is built by the same system migrations startup applies;
 * - blobs come out of the real `CelestiaFetcher`, with only its RPC client
 *   replaced by a stub that answers like celestia-node (`blob.GetAll`);
 * - blocks go through the real `processFinalizedBlock`, and the state machine
 *   parses its input with the primitive's own grammar.
 *
 * Backend: in-memory PGlite by default. With `PGLITE=false` the file connects
 * with the engine's `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PW` / `DB_NAME`
 * settings and works in a temporary database that it creates and drops.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";
import { Client, type Pool } from "pg";
import { run } from "effection";
import { ConfigSyncProtocolType } from "@effectstream/config";
import {
  builtInPrimitivesMap,
  type CelestiaGenericPrimitive,
  StateMachine,
} from "@effectstream/sm";
import { PrimitiveTypeCelestiaGeneric } from "@effectstream/sm/builtin";
import { builtinGrammars } from "@effectstream/sm/grammar";
import { CelestiaFetcher, type ChainBlock } from "@effectstream/sync";
import { getLastBlockHeight, getVersionInfo } from "@effectstream/db/version";
import { type PgliteHandle, startPglite } from "@effectstream/db/start-pglite";
import { ENV } from "@effectstream/utils/node-env";
import { processFinalizedBlock } from "../src/process-blocks.ts";
import { applySystemMigrations } from "../src/version-migrations.ts";
import type { StartConfig, StartConfigGameStateTransitions } from "../src/types.ts";

const NAMESPACE = "000000000000deadbeef";
const PREFIX = "celestia-blob";
const backend = process.env.PGLITE === "false" ? "postgres" : "pglite";

let client: Client;
let pglite: PgliteHandle | undefined;
let admin: Client | undefined;
let databaseName: string | undefined;

beforeAll(async () => {
  if (backend === "postgres") {
    const server = {
      host: ENV.DB_HOST,
      port: ENV.DB_PORT,
      user: ENV.DB_USER,
      password: ENV.DB_PW,
    };
    admin = new Client({ ...server, database: ENV.DB_NAME });
    await admin.connect();
    databaseName = `celestia_accounting_${randomBytes(6).toString("hex")}`;
    await admin.query(`CREATE DATABASE ${databaseName}`);
    client = new Client({ ...server, database: databaseName });
  } else {
    pglite = await startPglite(0);
    client = new Client({
      host: "127.0.0.1",
      port: pglite.port,
      user: ENV.DB_USER,
      database: ENV.DB_NAME,
    });
  }
  await client.connect();
  // The same calls startup makes on an empty database.
  await run(function* () {
    const versionInfo = yield* getVersionInfo(client);
    const lastBlockHeight = yield* getLastBlockHeight(versionInfo, client);
    yield* applySystemMigrations(
      "0.0.1",
      versionInfo,
      lastBlockHeight,
      client,
      undefined,
    );
  });
});

afterAll(async () => {
  await client?.end();
  await pglite?.close();
  if (admin && databaseName) {
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  }
  await admin?.end();
});

// ---------------------------------------------------------------- helpers

/** Each test gets its own primitive instance and its own rollup heights. */
let instanceCounter = 0;
let nextRollupHeight = 100;

/**
 * Builds the primitive the way the runtime does: the app's primitive config is
 * spread into the built-in constructor together with the instance name.
 */
function newPrimitive(
  options: { persistBody?: boolean; stateMachinePrefix?: string } = {},
): CelestiaGenericPrimitive {
  const instanceName = `celestiaAccounting${++instanceCounter}`;
  const appConfig = {
    name: instanceName,
    type: PrimitiveTypeCelestiaGeneric,
    startBlockHeight: 0,
    namespace: NAMESPACE,
    stateMachinePrefix: "stateMachinePrefix" in options
      ? options.stateMachinePrefix
      : PREFIX,
    ...("persistBody" in options ? { persistBody: options.persistBody } : {}),
  };
  const Ctor = builtInPrimitivesMap[PrimitiveTypeCelestiaGeneric];
  return new Ctor({
    ...appConfig,
    instanceName,
    securityNamespace: undefined,
  } as ConstructorParameters<typeof Ctor>[0]);
}

/** Stand-in for a blob commitment: same namespace and body, same value. */
function commitmentOf(body: Uint8Array): string {
  return createHash("sha256")
    .update(NAMESPACE)
    .update(body)
    .digest("base64");
}

/** The body as the fetcher hands it on: `atob` output, one char per byte. */
function binaryString(body: Uint8Array): string {
  return Buffer.from(body).toString("latin1");
}

function ascii(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, "latin1"));
}

/** Deterministic bytes (xorshift32), so a failure reproduces exactly. */
function pseudoRandomBytes(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let x = seed >>> 0 || 1;
  for (let i = 0; i < length; i++) {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    out[i] = x & 0xff;
  }
  return out;
}

/** 0x00 first, then every byte value up to 0xFF. */
const ALL_BYTE_VALUES = Uint8Array.from({ length: 256 }, (_, i) => i);
const ONE_MIB = 1024 * 1024;

type StubBlob = { body: Uint8Array; index?: number };

/** A blob as celestia-node's `blob.GetAll` returns it. */
type RpcBlob = {
  namespace: string;
  data: string;
  share_version: number;
  commitment: string;
  signer: string;
  index: number;
};

/**
 * Runs the real `CelestiaFetcher.fetchBlobsForPrimitive` for one Celestia
 * height. Only `client.getBlobsAtHeight` is replaced: it answers for the
 * primitive's namespace with celestia-node shaped blobs (base64 `data` and
 * `commitment`), so the bodies go through the fetcher's own decoding. Returns
 * the fetched items and the blobs the stub answered with.
 */
async function fetchFromStub(
  primitive: CelestiaGenericPrimitive,
  celestiaHeight: number,
  blobs: StubBlob[],
) {
  const fetcher = new CelestiaFetcher(
    {
      syncProtocol: { name: "celestiaParallel" },
      network: { rpcUrl: "http://celestia.invalid" },
      primitives: [],
    } as unknown as ConstructorParameters<typeof CelestiaFetcher>[0],
  );
  const requests: { height: number; namespaceB64: string }[] = [];
  const answered: RpcBlob[] = [];
  (fetcher as unknown as {
    client: {
      getBlobsAtHeight: (height: number, namespaceB64: string) => Promise<
        RpcBlob[]
      >;
    };
  }).client = {
    getBlobsAtHeight: (height, namespaceB64) => {
      requests.push({ height, namespaceB64 });
      const answer = blobs.map((blob, i) => ({
        namespace: namespaceB64,
        data: Buffer.from(blob.body).toString("base64"),
        share_version: 0,
        commitment: commitmentOf(blob.body),
        signer: "",
        index: blob.index ?? i,
      }));
      answered.push(...answer);
      return Promise.resolve(answer);
    },
  };
  const items = await run(() =>
    fetcher.fetchBlobsForPrimitive(
      celestiaHeight,
      `celestia-block-${celestiaHeight}`,
      {
        syncProtocol: ConfigSyncProtocolType.CELESTIA_PARALLEL,
        // What startup leaves in the sync config after building the primitive.
        primitive: primitive.getConfig(),
        id: primitive.instanceName,
      },
    )
  );
  expect(requests).toEqual([{
    height: celestiaHeight,
    namespaceB64: Buffer.concat([
      Buffer.alloc(1),
      Buffer.from(NAMESPACE.padStart(56, "0"), "hex"),
    ]).toString("base64"),
  }]);
  return { items, answered };
}

async function fetchItems(
  primitive: CelestiaGenericPrimitive,
  celestiaHeight: number,
  blobs: StubBlob[],
) {
  return (await fetchFromStub(primitive, celestiaHeight, blobs)).items;
}

/**
 * A state machine for the primitive's grammar. `inputs` counts every scheduled
 * input the block path hands it (parsed or not); `received` holds the bodies
 * it parsed with the grammar.
 */
function recordingStateMachine() {
  const inputs: string[] = [];
  const received: string[] = [];
  const stm = new StateMachine({
    [PREFIX]: builtinGrammars.celestiaGeneric,
  } as const);
  stm.addStateTransition(PREFIX, function* (data) {
    received.push(data.parsedInput.payload.suppliedValue);
  });
  const gameStateTransitions: StartConfigGameStateTransitions = (
    _blockHeight,
    input,
  ) => {
    inputs.push(input.conciseInput);
    return stm.processInput(input);
  };
  return { inputs, received, gameStateTransitions };
}

type FetchedItem = Awaited<ReturnType<typeof fetchItems>>[number];

/** Processes one rollup block through the real block path. */
async function processBlock(
  rollupHeight: number,
  items: FetchedItem[],
  gameStateTransitions?: StartConfigGameStateTransitions,
): Promise<void> {
  const block: ChainBlock = {
    blockNumber: rollupHeight,
    timestamp: Date.UTC(2026, 0, 1) + rollupHeight * 1000,
    blockInfo: [],
    resumePages: [],
    primitives: items.map((item) => ({ ...item, source: "celestiaParallel" })),
  };
  const config: StartConfig = {
    appName: "celestia-accounting-test",
    appVersion: "0.0.1",
    syncInfo: [],
    gameStateTransitions,
  };
  await run(() =>
    processFinalizedBlock(block, config, client as unknown as Pool, null)
  );
}

/** Fetch one Celestia height and process it as its own rollup block. */
async function fetchAndProcess(
  primitive: CelestiaGenericPrimitive,
  celestiaHeight: number,
  blobs: StubBlob[],
  gameStateTransitions?: StartConfigGameStateTransitions,
): Promise<number> {
  const rollupHeight = nextRollupHeight++;
  const items = await fetchItems(primitive, celestiaHeight, blobs);
  await processBlock(rollupHeight, items, gameStateTransitions);
  return rollupHeight;
}

/**
 * Fetch one Celestia height and process it as its own rollup block. Returns
 * the base64 `data` of each blob as the RPC answered it.
 */
async function fetchAndProcessData(
  primitive: CelestiaGenericPrimitive,
  celestiaHeight: number,
  blobs: StubBlob[],
): Promise<string[]> {
  const { items, answered } = await fetchFromStub(
    primitive,
    celestiaHeight,
    blobs,
  );
  await processBlock(nextRollupHeight++, items);
  return answered.map((blob) => blob.data);
}

type AccountingRow = {
  text: string;
  rollupHeight: number;
};

/** The primitive's accounting rows, as stored, read back with SQL. */
async function accountingRows(
  primitive: CelestiaGenericPrimitive,
): Promise<AccountingRow[]> {
  const { rows } = await client.query<
    { text: string; effectstream_block_height: number }
  >(
    `SELECT payload::text AS text, effectstream_block_height
       FROM effectstream.primitive_accounting
      WHERE primitive_name = $1 AND payload_type = $2
      ORDER BY id`,
    [primitive.instanceName, PrimitiveTypeCelestiaGeneric],
  );
  return rows.map((row) => ({
    text: row.text,
    rollupHeight: row.effectstream_block_height,
  }));
}

function reference(
  body: Uint8Array,
  blobIndex: number,
  height: number,
): Record<string, unknown> {
  return {
    namespace: NAMESPACE,
    commitment: commitmentOf(body),
    blobIndex,
    height,
  };
}

/** Byte-for-byte comparison that does not print megabytes on failure. */
function expectSameBytes(actual: string | undefined, expected: Uint8Array) {
  expect(actual).toBeString();
  const want = binaryString(expected);
  expect(actual!.length).toBe(want.length);
  let firstDifference = -1;
  for (let i = 0; i < want.length; i++) {
    if (actual!.charCodeAt(i) !== want.charCodeAt(i)) {
      firstDifference = i;
      break;
    }
  }
  expect(firstDifference).toBe(-1);
}

// ------------------------------------------------------------------ tests

describe(`celestia-generic accounting row (${backend})`, () => {
  for (
    const [label, options] of [
      ["persistBody unset", {}],
      ["persistBody: false", { persistBody: false }],
    ] as const
  ) {
    test(`${label}: the row is exactly the blob reference`, async () => {
      const primitive = newPrimitive(options);
      const body = ascii("an ordinary blob body");
      const celestiaHeight = 5_000_123;
      const rollupHeight = await fetchAndProcess(primitive, celestiaHeight, [
        { body, index: 3 },
      ]);

      const rows = await accountingRows(primitive);
      expect(rows).toHaveLength(1);
      expect(rows[0].rollupHeight).toBe(rollupHeight);
      const stored = JSON.parse(rows[0].text);
      expect(Object.keys(stored)).toEqual(["payload"]);
      expect(Object.keys(stored.payload).sort()).toEqual([
        "blobIndex",
        "commitment",
        "height",
        "namespace",
      ]);
      expect(stored).toStrictEqual({
        payload: reference(body, 3, celestiaHeight),
      });
    });
  }

  test("a 1 MiB blob leaves a row under 512 bytes", async () => {
    const primitive = newPrimitive();
    await fetchAndProcess(primitive, 5_000_200, [
      { body: pseudoRandomBytes(ONE_MIB, 0x5eed) },
    ]);

    const { rows } = await client.query<{ size: number }>(
      `SELECT length(payload::text) AS size
         FROM effectstream.primitive_accounting
        WHERE primitive_name = $1`,
      [primitive.instanceName],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].size).toBeLessThan(512);
  });

  test("a body with 0x00 and every byte value leaves a row JSON operators accept", async () => {
    const primitive = newPrimitive();
    await fetchAndProcess(primitive, 5_000_300, [{ body: ALL_BYTE_VALUES }]);

    const { rows } = await client.query<
      { as_jsonb: unknown; commitment: string }
    >(
      `SELECT payload::jsonb AS as_jsonb,
              payload->'payload'->>'commitment' AS commitment
         FROM effectstream.primitive_accounting
        WHERE primitive_name = $1`,
      [primitive.instanceName],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].commitment).toBe(commitmentOf(ALL_BYTE_VALUES));
    expect(rows[0].as_jsonb).toStrictEqual({
      payload: reference(ALL_BYTE_VALUES, 0, 5_000_300),
    });
  });

  test("the reference fields keep their payload->'payload' SQL paths", async () => {
    const primitive = newPrimitive();
    const body = ascii("located by SQL");
    await fetchAndProcess(primitive, 5_000_400, [{ body, index: 7 }]);

    const { rows } = await client.query(
      `SELECT payload->'payload'->>'namespace' AS namespace,
              payload->'payload'->>'commitment' AS commitment,
              (payload->'payload'->>'blobIndex')::int AS blob_index,
              (payload->'payload'->>'height')::bigint::text AS height
         FROM effectstream.primitive_accounting
        WHERE primitive_name = $1`,
      [primitive.instanceName],
    );
    expect(rows).toEqual([{
      namespace: NAMESPACE,
      commitment: commitmentOf(body),
      blob_index: 7,
      height: "5000400",
    }]);
  });

  test("height is the Celestia block height, not the rollup block height", async () => {
    const primitive = newPrimitive();
    const celestiaHeight = 4_321_987;
    const rollupHeight = await fetchAndProcess(primitive, celestiaHeight, [
      { body: ascii("height check") },
    ]);
    expect(rollupHeight).not.toBe(celestiaHeight);

    const rows = await accountingRows(primitive);
    expect(rows).toHaveLength(1);
    expect(rows[0].rollupHeight).toBe(rollupHeight);
    expect(JSON.parse(rows[0].text).payload.height).toBe(celestiaHeight);
  });

  test("the same body at two Celestia heights in one rollup block keeps two rows", async () => {
    const primitive = newPrimitive();
    const body = ascii("posted twice");
    const first = await fetchItems(primitive, 6_000_001, [{ body, index: 0 }]);
    const second = await fetchItems(primitive, 6_000_002, [{ body, index: 0 }]);
    await processBlock(nextRollupHeight++, [...first, ...second]);

    const stored = (await accountingRows(primitive)).map((row) =>
      JSON.parse(row.text)
    );
    expect(stored).toHaveLength(2);
    expect(stored).toContainEqual({ payload: reference(body, 0, 6_000_001) });
    expect(stored).toContainEqual({ payload: reference(body, 0, 6_000_002) });
  });

  test("the same body twice at one Celestia height keeps one row per index", async () => {
    const primitive = newPrimitive();
    const body = ascii("posted twice in one block");
    await fetchAndProcess(primitive, 6_000_100, [
      { body, index: 0 },
      { body, index: 1 },
    ]);

    const stored = (await accountingRows(primitive)).map((row) =>
      JSON.parse(row.text)
    );
    expect(stored).toHaveLength(2);
    expect(stored).toContainEqual({ payload: reference(body, 0, 6_000_100) });
    expect(stored).toContainEqual({ payload: reference(body, 1, 6_000_100) });
  });

  test("persistBody: true adds the body to the reference as Celestia's base64", async () => {
    const primitive = newPrimitive({ persistBody: true });
    // 7 bytes, so standard base64 needs padding.
    const body = ascii("keep me");
    const [data] = await fetchAndProcessData(primitive, 7_000_001, [{ body }]);
    expect(data).toBe("a2VlcCBtZQ==");

    const { rows } = await client.query<
      { text: string; keys: string[]; body_base64: string | null }
    >(
      `SELECT payload::text AS text,
              ARRAY(SELECT json_object_keys(payload->'payload')) AS keys,
              payload->'payload'->>'bodyBase64' AS body_base64
         FROM effectstream.primitive_accounting
        WHERE primitive_name = $1`,
      [primitive.instanceName],
    );
    expect(rows).toHaveLength(1);
    expect([...rows[0].keys].sort()).toEqual([
      "blobIndex",
      "bodyBase64",
      "commitment",
      "height",
      "namespace",
    ]);
    expect(rows[0].body_base64).toBe(data);
    expect(JSON.parse(rows[0].text)).toStrictEqual({
      payload: { ...reference(body, 0, 7_000_001), bodyBase64: data },
    });
  });

  test("persistBody: true stores a body with 0x00 and every byte value as base64 JSON operators accept", async () => {
    const primitive = newPrimitive({ persistBody: true });
    const [data] = await fetchAndProcessData(primitive, 7_000_002, [
      { body: ALL_BYTE_VALUES },
    ]);

    const { rows } = await client.query<{
      as_jsonb: unknown;
      commitment: string;
      body_base64: string | null;
      same_bytes: boolean | null;
    }>(
      `SELECT payload::jsonb AS as_jsonb,
              payload->'payload'->>'commitment' AS commitment,
              payload->'payload'->>'bodyBase64' AS body_base64,
              decode(payload->'payload'->>'bodyBase64', 'base64') = $2
                AS same_bytes
         FROM effectstream.primitive_accounting
        WHERE primitive_name = $1`,
      [primitive.instanceName, Buffer.from(ALL_BYTE_VALUES)],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].commitment).toBe(commitmentOf(ALL_BYTE_VALUES));
    expect(rows[0].body_base64).toBe(data);
    expect(rows[0].same_bytes).toBe(true);
    expect(rows[0].as_jsonb).toStrictEqual({
      payload: { ...reference(ALL_BYTE_VALUES, 0, 7_000_002), bodyBase64: data },
    });
  });

  test("persistBody: true stores a 1 MiB body at base64 size, decodable byte for byte", async () => {
    const primitive = newPrimitive({ persistBody: true });
    const body = pseudoRandomBytes(ONE_MIB, 0xba5e);
    await fetchAndProcess(primitive, 7_000_003, [{ body }]);

    // The size is read from the text form first: it works on any row.
    const sizes = await client.query<{ size: number }>(
      `SELECT length(payload::text) AS size
         FROM effectstream.primitive_accounting
        WHERE primitive_name = $1`,
      [primitive.instanceName],
    );
    expect(sizes.rows).toHaveLength(1);
    // Base64 of the body plus the reference fields.
    expect(sizes.rows[0].size).toBeLessThanOrEqual(
      4 * Math.ceil(ONE_MIB / 3) + 512,
    );

    const { rows } = await client.query<
      { body_size: number; same_bytes: boolean }
    >(
      `SELECT length(decode(payload->'payload'->>'bodyBase64', 'base64'))
                AS body_size,
              decode(payload->'payload'->>'bodyBase64', 'base64') = $2
                AS same_bytes
         FROM effectstream.primitive_accounting
        WHERE primitive_name = $1`,
      [primitive.instanceName, Buffer.from(body)],
    );
    expect(rows).toEqual([{ body_size: ONE_MIB, same_bytes: true }]);
  });

  test("without a stateMachinePrefix the row is written and the state machine gets nothing", async () => {
    const primitive = newPrimitive({ stateMachinePrefix: undefined });
    const body = ascii("accounting only");
    const stm = recordingStateMachine();
    const rollupHeight = await fetchAndProcess(
      primitive,
      8_000_001,
      [{ body }],
      stm.gameStateTransitions,
    );

    const rows = await accountingRows(primitive);
    expect(rows).toHaveLength(1);
    expect(rows[0].rollupHeight).toBe(rollupHeight);
    expect(JSON.parse(rows[0].text)).toStrictEqual({
      payload: reference(body, 0, 8_000_001),
    });
    expect(stm.inputs).toEqual([]);
    expect(stm.received).toEqual([]);
  });

  for (
    const [label, body] of [
      ["empty", new Uint8Array(0)],
      ["the namespace hex", ascii(NAMESPACE)],
      ["the JSON key \"payload\"", ascii("payload")],
    ] as const
  ) {
    test(`a body that is ${label} still leaves the plain reference`, async () => {
      const primitive = newPrimitive();
      await fetchAndProcess(primitive, 9_000_001, [{ body, index: 2 }]);

      const rows = await accountingRows(primitive);
      expect(rows.map((row) => JSON.parse(row.text))).toStrictEqual([
        { payload: reference(body, 2, 9_000_001) },
      ]);
    });
  }
});

describe(`celestia-generic state machine input (${backend})`, () => {
  const bodies = [
    ["0x00 and 0x80-0xFF", ALL_BYTE_VALUES],
    ["1 MiB", pseudoRandomBytes(ONE_MIB, 0xb10b)],
    ["empty", new Uint8Array(0)],
  ] as const;

  for (const persistBody of [undefined, true]) {
    for (const [label, body] of bodies) {
      const setting = persistBody === undefined
        ? "persistBody unset"
        : "persistBody: true";
      test(`${setting}: the ${label} body reaches the state machine byte for byte`, async () => {
        const primitive = newPrimitive(
          persistBody === undefined ? {} : { persistBody },
        );
        const stm = recordingStateMachine();
        await fetchAndProcess(
          primitive,
          10_000_001,
          [{ body }],
          stm.gameStateTransitions,
        );

        expect(stm.inputs).toHaveLength(1);
        expect(stm.received).toHaveLength(1);
        expectSameBytes(stm.received[0], body);
      });
    }
  }
});

describe("celestia-generic getConfig", () => {
  test("reports persistBody as a boolean", () => {
    expect(newPrimitive().getConfig().persistBody).toBe(false);
    expect(newPrimitive({ persistBody: false }).getConfig().persistBody).toBe(
      false,
    );
    expect(newPrimitive({ persistBody: true }).getConfig().persistBody).toBe(
      true,
    );
  });
});
