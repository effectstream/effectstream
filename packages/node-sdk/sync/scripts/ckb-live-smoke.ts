import { readFile, writeFile } from "node:fs/promises";
import { ConfigNetworkType, ConfigSyncProtocolType } from "@effectstream/config";
import { run } from "effection";
import { CkbFetcher } from "../src/sync-protocols/ckb/fetcher.ts";
import { CkbSyncState } from "../src/sync-protocols/ckb/state.ts";
import type { ConfigType, Page } from "../src/sync-protocols/ckb/types.ts";

const [mode, cursorPath = "/tmp/effectstream-ckb-live-cursor.json", expectedTransactionHash] = process.argv.slice(2);
if (mode !== "scan" && mode !== "resume") {
  throw new Error("Usage: bun run packages/node-sdk/sync/scripts/ckb-live-smoke.ts <scan|resume> [cursor-file]");
}

const rpcUrl = process.env["CKB_RPC_URL"] ?? "http://127.0.0.1:8114";
const rpc = async <T>(method: string, params: unknown[] = []): Promise<T> => {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await response.json() as {
    error?: { code: number; message: string };
    result?: T;
  };
  if (!response.ok || body.error || body.result === undefined) {
    throw new Error(`CKB RPC ${method} failed: ${body.error?.message ?? `HTTP ${response.status}`}`);
  }
  return body.result;
};

const genesis = await rpc<{ header: { hash: string } }>("get_block_by_number", ["0x0"]);
const network = {
  name: "ckb-live-smoke",
  type: ConfigNetworkType.CKB,
  rpcUrl,
  network: "devnet" as const,
  genesisBlockHash: process.env["CKB_GENESIS_BLOCK_HASH"] ?? genesis.header.hash,
};
const protocol = {
  name: "ckb-live-smoke",
  type: ConfigSyncProtocolType.CKB_RPC_PARALLEL,
  startBlockHeight: 0,
  stopBlockHeight: null,
  pollingInterval: 1_000,
  requestTimeoutMs: 15_000,
  confirmationDepth: 0,
  reorgWindow: 24,
  stepSize: 24,
  delayMs: 0,
  targetScript: {
    role: (process.env["CKB_TARGET_SCRIPT_ROLE"] ?? "lock") as "lock" | "type",
    script: {
      codeHash: process.env["CKB_TARGET_SCRIPT_CODE_HASH"] ?? "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
      hashType: (process.env["CKB_TARGET_SCRIPT_HASH_TYPE"] ?? "type") as "data" | "type" | "data1" | "data2",
      args: process.env["CKB_TARGET_SCRIPT_ARGS"] ?? "0x8e42b1999f265a0078503c4acec4d5e134534297",
    },
  },
};
const config = {
  network,
  syncProtocol: protocol,
  primitives: [{ id: "cell-created" }],
} as unknown as ConfigType;
const fetcher = new CkbFetcher(config);
const state = new CkbSyncState(undefined, config, fetcher, {} as never);
const genesisBlock = await fetcher.getBlock(0);
if (genesisBlock.hash !== network.genesisBlockHash) {
  throw new Error(`Configured genesis hash does not match RPC block 0: ${genesisBlock.hash}`);
}

if (mode === "scan") {
  const tip = await rpc<{ number: string }>("get_tip_header");
  const height = Number(BigInt(tip.number));
  const input = { from: { height: 0 }, to: { height }, isPresync: false } as const;
  const fetched = await run(() => fetcher.readData(input, state));
  const outputs = fetched.output.map(({ output }) => output);
  const nativePage = state.toPage(input, outputs);
  const marker = state.outputToLastPage(outputs.at(-1)!);
  if (nativePage.height !== height || marker.own.height !== height) {
    throw new Error("CKB SyncState did not retain the scan frontier as its resume marker.");
  }
  const events = outputs.flatMap((output) => output.primitives.map((primitive: any) => primitive.output.payload));
  if (!events.length) {
    throw new Error(`No matching live cell creation found in blocks 0..${height}; check the configured script filter.`);
  }
  const page = marker.own;
  await writeFile(cursorPath, JSON.stringify(page, null, 2));
  console.log(JSON.stringify({
    mode,
    genesisBlockHash: genesisBlock.hash,
    scannedBlocks: outputs.length,
    fromHeight: 0,
    throughHeight: height,
    matchingEvents: events.length,
    sampleEvent: {
      blockHeight: events[0].source.blockHeight,
      blockHash: events[0].source.blockHash,
      transactionHash: events[0].source.transactionHash,
      outPoint: events[0].cell.outPoint,
      eventId: events[0].eventId,
    },
    persistedResumeMarkerHeight: page.height,
    cursorFile: cursorPath,
  }));
} else {
  const page = JSON.parse(await readFile(cursorPath, "utf8")) as Page;
  let tip: { number: string } | undefined;
  if (expectedTransactionHash) {
    let committed = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      const transaction = await rpc<{
        tx_status?: { status?: string };
      } | null>("get_transaction", [expectedTransactionHash]);
      if (transaction?.tx_status?.status === "committed") {
        committed = true;
        break;
      }
      await Bun.sleep(500);
    }
    if (!committed) throw new Error(`Transaction ${expectedTransactionHash} was not committed within 60 seconds.`);
    tip = await rpc<{ number: string }>("get_tip_header");
  } else {
    for (let attempt = 0; attempt < 120; attempt++) {
      tip = await rpc<{ number: string }>("get_tip_header");
      if (Number(BigInt(tip.number)) > page.height) break;
      await Bun.sleep(500);
    }
  }
  if (!tip || Number(BigInt(tip.number)) <= page.height) {
    throw new Error(`No canonical block appeared after resume height ${page.height} within 60 seconds.`);
  }
  const height = Number(BigInt(tip.number));
  const input = {
    from: { height: page.height + 1, cursor: page.cursor },
    to: { height, cursor: page.cursor },
    isPresync: false,
  } as const;
  const fetched = await run(() => fetcher.readData(input, state));
  const outputs = fetched.output.map(({ output }) => output);
  const nativePage = state.toPage(input, outputs);
  const marker = state.outputToLastPage(outputs.at(-1)!);
  const priorIds = new Set(page.cursor?.observedEvents.map((event) => event.eventId) ?? []);
  const events = outputs.flatMap((output) => output.primitives.map((primitive: any) => primitive.output.payload));
  const duplicates = events.map((event) => event.eventId).filter((id) => priorIds.has(id));
  if (duplicates.length) throw new Error(`Restart emitted previously observed event IDs: ${duplicates.join(", ")}`);
  if (expectedTransactionHash && !events.some((event) => event.source.transactionHash.toLowerCase() === expectedTransactionHash.toLowerCase())) {
    throw new Error(`Restart did not emit a matching event from expected transaction ${expectedTransactionHash}.`);
  }
  if (nativePage.height !== height || marker.own.height !== height) {
    throw new Error("CKB SyncState did not advance to the scanned frontier after restart.");
  }
  await writeFile(cursorPath, JSON.stringify(marker.own, null, 2));
  console.log(JSON.stringify({
    mode,
    resumedFromHeight: page.height + 1,
    scannedThroughHeight: height,
    expectedTransactionHash: expectedTransactionHash ?? null,
    matchingEvents: events.length,
    expectedTransactionEvents: expectedTransactionHash
      ? events.filter((event) => event.source.transactionHash.toLowerCase() === expectedTransactionHash.toLowerCase())
          .map((event) => ({
            blockHeight: event.source.blockHeight,
            blockHash: event.source.blockHash,
            transactionHash: event.source.transactionHash,
            eventId: event.eventId,
            outPoint: event.cell.outPoint,
          }))
      : [],
    duplicatePriorEventIds: duplicates.length,
    advancedResumeMarkerHeight: marker.own.height,
    cursorFile: cursorPath,
  }));
}
