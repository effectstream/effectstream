import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { run } from "effection";

import {
  MidnightContractEventCursor,
  filterMidnightContractEvents,
  toMidnightContractEventPayload,
} from "/effectstream/packages/node-sdk/sync/src/sync-protocols/midnight/contract-events.ts";
import { MidnightClient } from "/effectstream/packages/node-sdk/sync/src/sync-protocols/midnight/MidnightClient.ts";
import { MidnightContractEventPrimitive } from "/effectstream/packages/node-sdk/sm/primitives/src/mod.ts";
import { ConfigSyncProtocolType } from "@effectstream/config";
import { createNodeConfig } from "/effectstream/template/packages/node/src/config.ts";
import { getSinkEvent, getSinkEventSummary } from "/effectstream/template/packages/node/src/query.ts";
import { applySinkContractEvent } from "/effectstream/template/packages/node/src/state-machine.ts";

const phase = process.argv[2];
if (phase !== "initial" && phase !== "replay") throw new Error(`Unknown application phase: ${phase}`);

const resultFile = requiredEnv("MIDNIGHT_V2_E2E_RESULT_FILE");
const databaseDir = requiredEnv("MIDNIGHT_V2_APPLICATION_DB");
const cursorFile = requiredEnv("MIDNIGHT_V2_CURSOR_FILE");
const chainResult = JSON.parse(readFileSync(resultFile, "utf8"));
const config = createNodeConfig({
  sinkContractAddress: chainResult.sinkAddress,
  startBlockHeight: chainResult.startBlockHeight,
});
const networkId = requiredEnv("MIDNIGHT_V2_NETWORK_ID");
if (chainResult.networkId !== networkId) {
  throw new Error(`Contract and application network identities differ: ${chainResult.networkId} != ${networkId}`);
}
const client = new MidnightClient(requiredEnv("MIDNIGHT_V2_INDEXER_HTTP_URL"), networkId);
const decodedEvents = await client.fetchContractEvents(
  chainResult.call.blockHeight,
  {
    apiVersion: 4,
    contractAddress: config.primitive.contractAddress,
    types: [config.primitive.eventType],
  },
);
const exactEvents = decodedEvents.filter(
  (candidate) => candidate.transactionHash === chainResult.call.transactionHash,
);
if (exactEvents.length !== 1) {
  throw new Error(`API-v4 decoder found ${exactEvents.length} exact finalized root-call events`);
}
const event = exactEvents[0];

if (config.primitive.type !== "Midnight:ContractEvent" || config.primitive.eventType !== "Unpaused") {
  throw new Error("Application did not construct the C14 Midnight contract-event primitive config");
}
if (
  event.blockHash !== chainResult.call.blockHash ||
  event.blockHeight !== chainResult.call.blockHeight ||
  event.transactionHash !== chainResult.call.transactionHash
) {
  throw new Error("Indexed event is not pinned to the finalized root-call block and transaction");
}
if (
  event.id !== chainResult.indexedEvent.id ||
  event.transactionId !== chainResult.indexedEvent.transactionId ||
  event.raw !== chainResult.indexedEvent.raw
) {
  throw new Error("Shared API-v4 decoder evidence differs from the provider's indexed event");
}
if (
  chainResult.localEvent.eventType !== "unpaused" ||
  chainResult.localEvent.degraded !== false ||
  chainResult.localEvent.contractAddress !== config.primitive.contractAddress
) {
  throw new Error("Local event evidence does not identify the non-degraded sink event");
}

const priorSnapshot = existsSync(cursorFile)
  ? JSON.parse(readFileSync(cursorFile, "utf8"))
  : undefined;
const cursor = new MidnightContractEventCursor(priorSnapshot);
if (phase === "replay") cursor.rewindFromBlock(config.primitive.startBlockHeight);
const accepted = cursor.accept([event, event]);
if (accepted.length !== 1) {
  throw new Error(`${phase} overlap expected one deduplicated event, received ${accepted.length}`);
}
const filtered = filterMidnightContractEvents(accepted, {
  contractAddress: config.primitive.contractAddress,
  eventType: config.primitive.eventType,
});
if (filtered.length !== 1) throw new Error("Primitive filter did not select exactly the sink Unpaused event");
const payload = toMidnightContractEventPayload(filtered[0]);
const primitive = new MidnightContractEventPrimitive({
  instanceName: config.primitive.name,
  startBlockHeight: config.primitive.startBlockHeight,
  stateMachinePrefix: config.primitive.stateMachinePrefix,
  contractAddress: config.primitive.contractAddress,
  eventType: config.primitive.eventType,
});
let primitiveOutput: any;
await run(function* () {
  primitiveOutput = primitive.getPayload(event.blockHeight, {
    syncProtocol: {
      name: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
      blockNumber: event.blockHeight,
      transactionHash: event.transactionHash,
      contractAddress: event.contractAddress,
    },
    primitive: config.primitive.name,
    output: { payloadType: "midnight-contract-event", payload },
  }).next().value.data[0];
});
if (
  primitiveOutput.stateMachinePayload[0] !== "midnightSinkEvent" ||
  primitiveOutput.stateMachinePayload[1] !== payload.eventIdentity ||
  primitiveOutput.accountingPayload.eventIdentity !== payload.eventIdentity
) {
  throw new Error("Primitive output did not route the composite event identity to the state machine");
}

const db = new PGlite(databaseDir);
try {
  await db.exec(readFileSync("/effectstream/template/packages/node/src/schema.sql", "utf8"));
  const transition = await applySinkContractEvent(
    db,
    payload,
    chainResult.expectedDigest,
    {
      contractAddress: config.primitive.contractAddress,
      eventType: config.primitive.eventType,
    },
  );
  const expectedApplied = phase === "initial";
  if (transition.applied !== expectedApplied || transition.processedCount !== 1) {
    throw new Error(`${phase} transition was not exactly-once: ${JSON.stringify(transition)}`);
  }
  const stored = await getSinkEvent(db, payload.eventIdentity);
  if (
    stored?.digest !== chainResult.expectedDigest ||
    stored.transactionHash !== chainResult.call.transactionHash ||
    stored.blockHash !== chainResult.call.blockHash ||
    stored.emitterContractAddress !== config.primitive.contractAddress ||
    stored.indexerTransactionId !== String(event.transactionId)
  ) {
    throw new Error(`${phase} stored row does not join the indexed event to block-pinned sink state`);
  }
  const summary = await getSinkEventSummary(db);
  if (summary.processedCount !== 1 || summary.latestBlockHeight !== String(event.blockHeight)) {
    throw new Error(`${phase} query output drifted: ${JSON.stringify(summary)}`);
  }
  writeFileSync(cursorFile, JSON.stringify(cursor.snapshot()));
  console.log(JSON.stringify({
    checkpoint: "C16-application",
    phase,
    networkId,
    primitive: config.primitive.type,
    eventIdentity: payload.eventIdentity,
    transition,
    summary,
    status: "pass",
  }));
} finally {
  await db.close();
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
