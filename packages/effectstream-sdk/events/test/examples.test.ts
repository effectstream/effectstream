// Examples for the README — verifies the public API surface compiles
// without actually opening an MQTT connection.

import { test, expect } from "bun:test";
import {
  BuiltinEvents,
  EventBrokerNames,
  EventManager,
  registerEvents,
  TopicPrefix,
  toSignature,
  toSignatureHash,
} from "../src/mod.ts";
import { Type } from "@sinclair/typebox";

test("README: EventBrokerNames enum lists Engine and Batcher", () => {
  expect(EventBrokerNames.Engine).toBeDefined();
  expect(EventBrokerNames.Batcher).toBeDefined();
});

test("README: BuiltinEvents.RollupBlock looks like a registered EventPathAndDef", () => {
  expect(Array.isArray(BuiltinEvents.RollupBlock.path)).toBe(true);
  expect(typeof BuiltinEvents.RollupBlock.broker).toBe("string");
  expect(BuiltinEvents.RollupBlock.type).toBeDefined();
});

test("README: EventManager.Instance is a singleton", () => {
  expect(EventManager.Instance).toBe(EventManager.Instance);
  expect(typeof EventManager.Instance.subscribe).toBe("function");
  expect(typeof EventManager.Instance.unsubscribe).toBe("function");
});

test("README: registerEvents returns one entry per input with a topicHash", () => {
  const events = registerEvents({
    GameStarted: {
      name: "GameStarted",
      fields: [
        { name: "gameId", type: Type.String(), indexed: true },
        { name: "players", type: Type.Array(Type.String()), indexed: false },
      ],
    },
  });

  expect(events.GameStarted.topicHash).toMatch(/^[0-9a-f]{64}$/);
  expect(events.GameStarted.broker).toBe(EventBrokerNames.Engine);
});

test("README: toSignature/toSignatureHash agree on the event name", () => {
  const event = {
    name: "GameStarted",
    fields: [
      { name: "gameId", type: Type.String(), indexed: false },
    ],
  };
  expect(toSignature(event)).toContain("GameStarted");
  expect(toSignatureHash(event)).toMatch(/^[0-9a-f]{64}$/);
});
