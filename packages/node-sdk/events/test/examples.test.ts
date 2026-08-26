// Examples for the README — verify EventBroker is exported and
// constructible. We don't actually open the listener in the test.

import { test, expect } from "bun:test";
import { EventBroker } from "../src/mod.ts";

test("README: EventBroker class is exported and constructible", () => {
  process.env.MQTT_BROKER = "true";
  const engine = new EventBroker("effectstream-engine");
  expect(typeof engine.createServer).toBe("function");
  expect(typeof engine.start).toBe("function");
  expect(typeof engine.shutdown).toBe("function");
  expect(typeof engine.stop).toBe("function");
});

test("README: separate engine vs batcher brokers", () => {
  process.env.MQTT_BROKER = "true";
  const engine = new EventBroker("effectstream-engine");
  const batcher = new EventBroker("Batcher");
  expect(engine).toBeInstanceOf(EventBroker);
  expect(batcher).toBeInstanceOf(EventBroker);
});
