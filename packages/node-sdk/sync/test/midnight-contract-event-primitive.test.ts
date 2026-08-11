import { describe, expect, test } from "bun:test";
import { run } from "effection";

import { ConfigSyncProtocolType } from "@effectstream/config";
import { PrimitiveRegistry } from "../../sm/primitives/PrimitiveRegistry.ts";
import {
  MidnightContractEventPrimitive,
  builtInPrimitivesMap,
} from "../../sm/primitives/src/mod.ts";
import { PrimitiveTypeMidnightContractEvent } from "../../sm/primitives/src/builtin.ts";
import { builtinGrammars } from "../../sm/primitives/src/grammar.ts";
import {
  MidnightContractEventCursor,
  filterMidnightContractEvents,
  midnightContractEventIdentity,
  toMidnightContractEventPayload,
  validateMidnightContractEventFilter,
} from "../src/sync-protocols/midnight/contract-events.ts";
import type { MidnightContractEvent } from "../src/sync-protocols/midnight/MidnightClient.ts";
import { MidnightFetcher } from "../src/sync-protocols/midnight/fetcher.ts";

const CONTRACT = "11".repeat(32);
const OTHER_CONTRACT = "12".repeat(32);

const unpaused: MidnightContractEvent = {
  id: 10,
  maxId: 12,
  version: 1,
  protocolVersion: 2_000_000,
  contractAddress: CONTRACT,
  transactionId: 41,
  transactionHash: "22".repeat(32),
  blockHash: "33".repeat(32),
  blockHeight: 42,
  raw: "abcd",
  eventType: "Unpaused",
};

const misc: MidnightContractEvent = {
  ...unpaused,
  id: 11,
  transactionId: 42,
  transactionHash: "44".repeat(32),
  blockHash: "55".repeat(32),
  blockHeight: 43,
  raw: "dcba",
  eventType: "Misc",
  name: "66".repeat(32),
  payload: "77".repeat(32),
};

describe("Midnight:ContractEvent filtering and identity", () => {
  test("requires an emitter and validates typed filters", () => {
    expect(() =>
      validateMidnightContractEventFilter({ contractAddress: "" }),
    ).toThrow("requires one 32-byte contractAddress");
    expect(() =>
      validateMidnightContractEventFilter({
        contractAddress: CONTRACT,
        eventFieldFilters: { payload: "aa" },
      }),
    ).toThrow("require one concrete eventType");
    expect(() =>
      validateMidnightContractEventFilter({
        contractAddress: CONTRACT,
        eventType: "Unpaused",
        eventFieldFilters: { payload: "aa" },
      }),
    ).toThrow("not valid for Midnight Unpaused");
  });

  test("matches emitter, concrete type, and typed fields without duplicates", () => {
    const wrongEmitter = { ...misc, contractAddress: OTHER_CONTRACT };
    const filtered = filterMidnightContractEvents(
      [misc, misc, unpaused, wrongEmitter],
      {
        contractAddress: `0x${CONTRACT.toUpperCase()}`,
        eventType: "Misc",
        eventFieldFilters: { name: misc.name, payload: misc.payload },
      },
    );
    expect(filtered).toEqual([misc]);
    expect(JSON.parse(toMidnightContractEventPayload(misc).fields)).toEqual({
      name: misc.name,
      payload: misc.payload,
    });
  });

  test("uses a composite identity, not an indexer id or transaction id alone", () => {
    const reorged = {
      ...unpaused,
      blockHash: "99".repeat(32),
      transactionHash: "88".repeat(32),
    };
    expect(reorged.id).toBe(unpaused.id);
    expect(reorged.transactionId).toBe(unpaused.transactionId);
    expect(midnightContractEventIdentity(reorged)).not.toBe(
      midnightContractEventIdentity(unpaused),
    );
  });
});

describe("Midnight contract-event replay cursor", () => {
  test("survives overlap/restart, advances inclusive fromId, and rewinds for reorgs", () => {
    const cursor = new MidnightContractEventCursor();
    expect(cursor.accept([unpaused, unpaused])).toEqual([unpaused]);
    expect(cursor.resumeFromId).toBe(11);
    expect(cursor.accept([unpaused, misc])).toEqual([misc]);
    expect(cursor.resumeFromId).toBe(12);

    const restarted = new MidnightContractEventCursor(cursor.snapshot());
    expect(restarted.accept([unpaused, misc])).toEqual([]);
    expect(restarted.resumeFromId).toBe(12);

    restarted.rewindFromBlock(42);
    const replacement = {
      ...unpaused,
      blockHash: "99".repeat(32),
      transactionHash: "88".repeat(32),
    };
    expect(restarted.accept([replacement])).toEqual([replacement]);
    expect(restarted.resumeFromId).toBe(11);
  });
});

describe("Midnight:ContractEvent primitive surfaces", () => {
  test("is registered in built-ins and grammar exports", () => {
    expect(builtInPrimitivesMap[PrimitiveTypeMidnightContractEvent]).toBe(
      MidnightContractEventPrimitive,
    );
    expect(builtinGrammars.midnightContractEvent).toHaveLength(13);
  });

  test("emits deterministic accounting and state-machine payloads", async () => {
    PrimitiveRegistry.primitives = {};
    const primitive = new MidnightContractEventPrimitive({
      instanceName: "sink-events",
      startBlockHeight: 42,
      stateMachinePrefix: "sinkEvent",
      contractAddress: `0x${CONTRACT.toUpperCase()}`,
      eventType: "Misc",
      eventFieldFilters: { name: misc.name },
    });
    expect(primitive.getConfig()).toMatchObject({
      type: "Midnight:ContractEvent",
      contractAddress: CONTRACT,
      eventType: "Misc",
      eventFieldFilters: { name: misc.name },
    });

    const payload = toMidnightContractEventPayload(misc);
    let output: any;
    await run(function* () {
      output = primitive.getPayload(100, {
        syncProtocol: {
          name: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
          blockNumber: 43,
          transactionHash: misc.transactionHash,
          contractAddress: misc.contractAddress,
        },
        primitive: "sink-events",
        output: { payloadType: "midnight-contract-event", payload },
      }).next().value;
    });
    expect(output.data[0].accountingPayload).toEqual(payload);
    expect(output.data[0].stateMachinePayload[0]).toBe("sinkEvent");
    expect(output.data[0].stateMachinePayload[1]).toBe(payload.eventIdentity);
  });

  test("fetcher emits a duplicated indexed event exactly once", () => {
    const primitiveEntry = {
      id: "sink-events",
      syncProtocol: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
      primitive: {
        name: "sink-events",
        type: "Midnight:ContractEvent",
        startBlockHeight: 42,
        contractAddress: CONTRACT,
        eventType: "Unpaused",
      },
    } as any;
    const outputs = MidnightFetcher.prototype.fetchContractEvents.call(
      {} as MidnightFetcher,
      42,
      primitiveEntry,
      {
        block: {
          hash: unpaused.blockHash,
          height: 42,
          protocolVersion: 2_000_000,
          timestamp: 0,
          parent: { hash: "00".repeat(32) },
          transactions: [],
        },
        contractEvents: [unpaused, unpaused],
      },
    );
    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toMatchObject({
      primitive: "sink-events",
      syncProtocol: {
        blockNumber: 42,
        transactionHash: unpaused.transactionHash,
        contractAddress: CONTRACT,
      },
      output: { payloadType: "midnight-contract-event" },
    });

    expect(() => MidnightFetcher.prototype.fetchContractEvents.call(
      {} as MidnightFetcher,
      42,
      primitiveEntry,
      {
        block: {
          hash: "ff".repeat(32),
          height: 42,
          protocolVersion: 2_000_000,
          timestamp: 0,
          parent: { hash: "00".repeat(32) },
          transactions: [],
        },
        contractEvents: [unpaused],
      },
    )).toThrow("block hash does not match");
  });
});
