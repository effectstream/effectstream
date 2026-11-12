import { expect, test } from "bun:test";
import { ConfigNetworkType, ConfigSyncProtocolType } from "@effectstream/config";
import { ckbScriptHash } from "ckb-multichain-connector";
import { run } from "effection";
import type { CkbFetch } from "ckb-multichain-connector";
import { CkbRpcClient } from "ckb-multichain-connector";
import { CkbFetcher } from "./fetcher.ts";
import { CkbSyncState } from "./state.ts";
import type { ConfigType, Output, Page } from "./types.ts";
import type { RootPage } from "../types.ts";
import { genSyncProtocols } from "../../syncProtocolFactory.ts";

const hash = (n: string): `0x${string}` => `0x${n.repeat(64)}`;
const script = { code_hash: hash("a"), hash_type: "type", args: "0x1234" };
const network = {
  name: "ckb-devnet",
  type: ConfigNetworkType.CKB,
  rpcUrl: "http://127.0.0.1:8114",
  network: "devnet" as const,
  genesisBlockHash: hash("0"),
};
const syncProtocol = {
  name: "ckb-cells",
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
const config = {
  network,
  syncProtocol,
  primitives: [{ id: "cell-created" }],
} as unknown as ConfigType;

function block(height: number, blockHash: string, txs: unknown[] = []) {
  return {
    header: {
      number: `0x${height.toString(16)}`,
      hash: hash(blockHash),
      timestamp: `0x${(100 + height * 100).toString(16)}`,
    },
    transactions: txs,
  };
}

function matchingTx(txHash: string) {
  return {
    hash: hash(txHash),
    inner: {
      outputs: [
        { capacity: "0x2540be400", lock: script, type: null },
        { capacity: "0x1", lock: script, type: null },
      ],
      outputs_data: ["0x", "0x1234"],
    },
  };
}

function fixtureFetch(initial: Record<number, unknown>) {
  const chain = new Map(Object.entries(initial).map(([height, value]) => [Number(height), value]));
  const fetch: CkbFetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body)) as { id: number; method: string; params: string[] };
    const height = request.params[0] == null ? undefined : Number(BigInt(request.params[0]));
    let result: unknown;
    if (request.method === "get_block_by_number") result = chain.get(height!);
    else if (request.method === "get_header_by_number") {
      result = (chain.get(height!) as ReturnType<typeof block> | undefined)?.header;
    } else if (request.method === "get_tip_header") {
      const tip = Math.max(...chain.keys());
      result = (chain.get(tip) as ReturnType<typeof block>).header;
    } else throw new Error(`Unexpected RPC call ${request.method}`);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }), { status: 200 });
  };
  return { fetch, replace: (height: number, value: unknown) => chain.set(height, value) };
}

const rootConversion = {
  toRootPage: (output: Output) => Number(output.raw.timestamp) as RootPage,
} as any;

test("CKB fetcher maps exact cell events to one native primitive per output", async () => {
  const rpc = fixtureFetch({
    0: block(0, "0"),
    1: block(1, "1", [matchingTx("b")]),
    2: block(2, "2"),
  });
  const fetcher = new CkbFetcher(config, rpc.fetch);
  const result = await run(() => fetcher.readData({
    from: { height: 0 },
    to: { height: 1 },
    isPresync: false,
  }, rootConversion));

  expect(result.output).toHaveLength(2);
  const primitives = result.output.flatMap(({ output }) => output.primitives);
  expect(primitives).toHaveLength(2);
  expect(primitives.map((primitive) => primitive.output.payload.cell.outPoint.index)).toEqual(["0", "1"]);
  expect(primitives[0]?.output.payload.cell.capacityShannons).toBe("10000000000");
  expect(primitives[0]?.syncProtocol.contractAddress).toBeUndefined();
  expect(primitives[0]?.output.payload.cell.matchedScriptHash).toBe(ckbScriptHash({
    codeHash: hash("a"), hashType: "type", args: "0x1234",
  }));
  expect(primitives[0]?.output.payload.eventId).toMatch(/^ckb-cell-created:[0-9a-f]{64}$/);
  expect(result.lastPage.own.height).toBe(1);
  expect(result.lastPage.own.cursor?.lastProcessed?.height).toBe("1");
});

test("native factory restores CKB SyncState and block commit markers carry the observer cursor", async () => {
  const rpc = fixtureFetch({
    0: block(0, "0"),
    1: block(1, "1", [matchingTx("b")]),
    2: block(2, "2"),
  });
  const syncInfo = [{
    networkType: ConfigNetworkType.CKB,
    syncProtocolType: ConfigSyncProtocolType.CKB_RPC_PARALLEL,
    syncProtocol,
    network,
    primitives: [{
      syncProtocol: ConfigSyncProtocolType.CKB_RPC_PARALLEL,
      id: "cell-created",
      primitive: { name: "cell-created", type: "CKB:CellCreated", startBlockHeight: 0 },
    }],
  }] as any;
  const dbConn = { query: async () => ({ rows: [] }) } as any;
  const [state] = await run(() => genSyncProtocols(dbConn, syncInfo));
  expect(state).toBeInstanceOf(CkbSyncState);
  const ckbState = state as CkbSyncState;
  (ckbState.fetcher as any).fetchImpl = rpc.fetch;
  (ckbState.fetcher as any).rpc = new CkbRpcClient(
    "http://127.0.0.1:8114",
    1_000,
    rpc.fetch,
  );

  const input = await run(() => ckbState.stateToInput());
  expect(input).toBeDefined();
  const fetched = await run(() => ckbState.fetcher.readData(input!, ckbState));
  await run(() => ckbState.updateState(input!, fetched));
  const firstBlockMarker = ckbState.outputToLastPage(fetched.output[1]!.output);
  const merged = { primitives: [], blockInfo: [] } as any;
  ckbState.mergeDatum(fetched.output[1]!.output, merged);

  expect(ckbState.bufferedData.size()).toBe(2);
  expect(firstBlockMarker.own.cursor?.lastProcessed?.height).toBe("1");
  expect(merged.primitives).toHaveLength(2);
  expect(merged.blockInfo[0].blockHash).toBe(hash("1"));

  const savedPage = ckbState.outputToLastPage(fetched.output[1]!.output);
  const restartDb = { query: async () => ({ rows: [{ page: savedPage }] }) } as any;
  const [restarted] = await run(() => genSyncProtocols(restartDb, syncInfo));
  expect(restarted).toBeInstanceOf(CkbSyncState);
  if (!(restarted instanceof CkbSyncState)) throw new Error("Expected the CKB sync state.");
  const ckbRestarted = restarted;
  (ckbRestarted.fetcher as any).fetchImpl = rpc.fetch;
  (ckbRestarted.fetcher as any).rpc = new CkbRpcClient("http://127.0.0.1:8114", 1_000, rpc.fetch);
  const resumedInput = await run(() => ckbRestarted.stateToInput());
  expect(resumedInput?.from.height).toBe(2);
  const resumed = await run(() => ckbRestarted.fetcher.readData(resumedInput!, ckbRestarted));
  expect(resumed.output).toHaveLength(1);
  expect(resumed.output[0]?.output.primitives).toHaveLength(0);
  expect(resumed.output[0]?.output.page.cursor?.lastProcessed?.height).toBe("2");
});

test("a changed committed checkpoint fails closed even when the block had no matching cells", async () => {
  const rpc = fixtureFetch({
    0: block(0, "0"),
    1: block(1, "1"),
    2: block(2, "2"),
  });
  const firstFetcher = new CkbFetcher(config, rpc.fetch);
  const first = await run(() => firstFetcher.readData({
    from: { height: 0 },
    to: { height: 1 },
    isPresync: false,
  }, rootConversion));
  rpc.replace(1, block(1, "a"));
  const restarted = new CkbFetcher(config, rpc.fetch);

  let failure: unknown;
  try {
    await run(() => restarted.readData({
      from: { height: 2, cursor: first.lastPage.own.cursor },
      to: { height: 2, cursor: first.lastPage.own.cursor },
      isPresync: false,
    }, rootConversion));
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toMatch(/canonical history changed/i);
});

test("a failed block parse returns no native page and retries the same interval", async () => {
  const malformed = { hash: hash("b"), inner: { outputs: [], outputs_data: ["0x"] } };
  const rpc = fixtureFetch({
    0: block(0, "0"),
    1: block(1, "1", [malformed]),
  });
  const fetcher = new CkbFetcher(config, rpc.fetch);
  let failure: unknown;
  try {
    await run(() => fetcher.readData({
      from: { height: 0 },
      to: { height: 1 },
      isPresync: false,
    }, rootConversion));
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);

  rpc.replace(1, block(1, "1", [matchingTx("b")]));
  const retried = await run(() => fetcher.readData({
    from: { height: 0 },
    to: { height: 1 },
    isPresync: false,
  }, rootConversion));
  expect(retried.lastPage.own.height).toBe(1);
  expect(retried.output[1]?.output.primitives).toHaveLength(2);
});
