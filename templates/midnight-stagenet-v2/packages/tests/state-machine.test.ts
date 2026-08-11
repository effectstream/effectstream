import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

import { createNodeConfig } from "../node/src/config.ts";
import { getSinkEvent, getSinkEventSummary } from "../node/src/query.ts";
import { applySinkContractEvent } from "../node/src/state-machine.ts";

const SINK = "11".repeat(32);
const DIGEST = "290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563";
const EVENT_IDENTITY = JSON.stringify([
  2_000_000,
  SINK,
  42,
  "33".repeat(32),
  "22".repeat(32),
  13,
  7,
  1,
  "Unpaused",
  "abcd",
]);

const event = {
  eventIdentity: EVENT_IDENTITY,
  eventId: 7,
  eventVersion: 1,
  protocolVersion: 2_000_000,
  contractAddress: SINK,
  indexerTransactionId: 13,
  transactionHash: "22".repeat(32),
  blockHash: "33".repeat(32),
  blockHeight: 42,
  eventType: "Unpaused",
  raw: "abcd",
};

const db = new PGlite();

afterAll(async () => {
  await db.close();
});

describe("Midnight stagenet-v2 application slice", () => {
  test("configures the API-v4 contract-event primitive at deployment block", () => {
    const config = createNodeConfig({ sinkContractAddress: `0x${SINK}`, startBlockHeight: 42 });
    expect(config.syncProtocol.indexer).toBe(
      "https://indexer.stagenet.shielded.tools/api/v4/graphql",
    );
    expect(config.primitive).toMatchObject({
      type: "Midnight:ContractEvent",
      startBlockHeight: 42,
      contractAddress: SINK,
      eventType: "Unpaused",
      stateMachinePrefix: "midnightSinkEvent",
    });
  });

  test("stores one matching event exactly once and exposes query results", async () => {
    const schema = readFileSync(
      "/app/packages/node/src/schema.sql",
      "utf8",
    );
    await db.exec(schema);

    const config = { contractAddress: SINK, eventType: "Unpaused" as const };
    expect(await applySinkContractEvent(db, event, DIGEST, config)).toEqual({
      applied: true,
      processedCount: 1,
    });
    expect(await applySinkContractEvent(db, event, DIGEST, config)).toEqual({
      applied: false,
      processedCount: 1,
    });

    expect(await getSinkEvent(db, EVENT_IDENTITY)).toEqual({
      eventIdentity: EVENT_IDENTITY,
      eventId: 7,
      indexerTransactionId: "13",
      transactionHash: event.transactionHash,
      blockHash: event.blockHash,
      blockHeight: "42",
      emitterContractAddress: SINK,
      eventType: "Unpaused",
      digest: DIGEST,
    });
    expect(await getSinkEventSummary(db)).toEqual({
      processedCount: 1,
      latestBlockHeight: "42",
    });
  });

  test("ignores a nonmatching emitter or event type", async () => {
    const config = { contractAddress: SINK, eventType: "Unpaused" as const };
    expect(await applySinkContractEvent(
      db,
      { ...event, eventIdentity: "wrong-emitter", contractAddress: "99".repeat(32) },
      DIGEST,
      config,
    )).toEqual({ applied: false, processedCount: 1 });
    expect(await applySinkContractEvent(
      db,
      { ...event, eventIdentity: "wrong-type", eventType: "Paused" },
      DIGEST,
      config,
    )).toEqual({ applied: false, processedCount: 1 });
    expect(await getSinkEventSummary(db)).toEqual({
      processedCount: 1,
      latestBlockHeight: "42",
    });
  });
});
