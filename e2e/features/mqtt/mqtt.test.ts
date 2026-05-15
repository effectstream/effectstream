import { assert, printSummary, anyError } from "@e2e/engine";
import { TcpClient } from "@seriousme/opifex/tcpClient";

const MQTT_PORT = 18883;
const MQTT_WS_PORT = 19883;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function startBroker() {
  // Set env vars so EventBroker uses our test ports
  process.env["MQTT_ENGINE_BROKER_PORT"] = String(MQTT_PORT);
  process.env["MQTT_ENGINE_BROKER_WS_PORT"] = String(MQTT_WS_PORT);
  process.env["MQTT_BROKER"] = "true";

  const { EventBroker } = await import("@effectstream/event-server");
  const broker = new EventBroker("effectstream-engine");
  await broker.start();
  return broker;
}

export async function mqttTest() {
  let broker: Awaited<ReturnType<typeof startBroker>> | null = null;

  try {
    broker = await startBroker();

    // Test 1: TCP connection
    await assert("MQTT broker accepts TCP connection", async () => {
      const client = new TcpClient();
      await client.connect({
        url: new URL(`mqtt://127.0.0.1:${MQTT_PORT}`),
        numberOfRetries: 0,
      });
      await client.disconnect();
      return true;
    });

    // Test 2: pub/sub message delivery
    await assert("MQTT pub/sub delivers messages", async () => {
      const client = new TcpClient();
      await client.connect({
        url: new URL(`mqtt://127.0.0.1:${MQTT_PORT}`),
        numberOfRetries: 0,
      });

      await client.subscribe({
        subscriptions: [{ topicFilter: "test/foo/+", qos: 0 }],
      });

      const received: { topic: string; payload: string }[] = [];
      const msgIterator = client.messages();
      const msgPromise = (async () => {
        for await (const msg of msgIterator) {
          received.push({
            topic: msg.topic!,
            payload: new TextDecoder().decode(msg.payload as Uint8Array),
          });
          break;
        }
      })();

      await delay(100);

      // Publish from a second client
      const publisher = new TcpClient();
      await publisher.connect({
        url: new URL(`mqtt://127.0.0.1:${MQTT_PORT}`),
        numberOfRetries: 0,
      });

      const payload = JSON.stringify({ value: 42 });
      await publisher.publish({
        topic: "test/foo/bar",
        payload: new TextEncoder().encode(payload),
        qos: 0,
      });

      await Promise.race([msgPromise, delay(5000)]);

      await publisher.disconnect();
      await client.disconnect();

      return (
        received.length === 1 &&
        received[0].topic === "test/foo/bar" &&
        received[0].payload === payload
      );
    });

    // Test 3: wildcard topic matching
    await assert("MQTT wildcard topic matching works", async () => {
      const client = new TcpClient();
      await client.connect({
        url: new URL(`mqtt://127.0.0.1:${MQTT_PORT}`),
        numberOfRetries: 0,
      });

      await client.subscribe({
        subscriptions: [{ topicFilter: "node/block/+", qos: 0 }],
      });

      const received: string[] = [];
      const msgIterator = client.messages();
      const msgPromise = (async () => {
        for await (const msg of msgIterator) {
          received.push(msg.topic!);
          if (received.length >= 2) break;
        }
      })();

      await delay(100);

      const publisher = new TcpClient();
      await publisher.connect({
        url: new URL(`mqtt://127.0.0.1:${MQTT_PORT}`),
        numberOfRetries: 0,
      });

      await publisher.publish({
        topic: "node/block/42",
        payload: new TextEncoder().encode("{}"),
        qos: 0,
      });
      await publisher.publish({
        topic: "node/block/43",
        payload: new TextEncoder().encode("{}"),
        qos: 0,
      });

      await Promise.race([msgPromise, delay(5000)]);

      await publisher.disconnect();
      await client.disconnect();

      return (
        received.length === 2 &&
        received[0] === "node/block/42" &&
        received[1] === "node/block/43"
      );
    });

    // Test 4: QoS 2 (exactly-once) delivery
    await assert("MQTT QoS 2 delivery works", async () => {
      const client = new TcpClient();
      await client.connect({
        url: new URL(`mqtt://127.0.0.1:${MQTT_PORT}`),
        numberOfRetries: 0,
      });

      await client.subscribe({
        subscriptions: [{ topicFilter: "qos2/test", qos: 2 }],
      });

      const received: string[] = [];
      const msgIterator = client.messages();
      const msgPromise = (async () => {
        for await (const msg of msgIterator) {
          received.push(
            new TextDecoder().decode(msg.payload as Uint8Array)
          );
          break;
        }
      })();

      await delay(100);

      const publisher = new TcpClient();
      await publisher.connect({
        url: new URL(`mqtt://127.0.0.1:${MQTT_PORT}`),
        numberOfRetries: 0,
      });

      await publisher.publish({
        topic: "qos2/test",
        payload: new TextEncoder().encode("qos2-payload"),
        qos: 2,
      });

      await Promise.race([msgPromise, delay(5000)]);

      await publisher.disconnect();
      await client.disconnect();

      return received.length === 1 && received[0] === "qos2-payload";
    });

    // Test 5: registerEvents auto-prepends blockHeight + roundtrip via raw client
    //
    // Verifies the SDK invariants for custom app events without depending on
    // EventManager's hard-coded broker URL (a separate, pre-existing TODO in
    // event-connect.ts). We declare an event with `registerEvents`, derive the
    // MQTT topic from its `path` + `fillPath`, and publish via raw TcpClient.
    //
    // This proves:
    //   - the path carries `blockHeight` as an auto-prepended indexed field,
    //     BEFORE the user-declared indexed fields
    //   - a subscriber on the auto-injected topic shape receives the message
    //
    // The full end-to-end test (STF emit → block COMMIT → MQTT delivery) lives
    // in the preorder template's stm/frontend tests, where the runtime is set
    // up with a real Pool.
    await assert("registerEvents: blockHeight auto-prepend + roundtrip", async () => {
      const { registerEvents, genEvent, fillPath } = await import(
        "@effectstream/event-client"
      );
      const { Type } = await import("@sinclair/typebox");

      // The `as any` casts here work around a pre-existing typebox version
      // mismatch between @e2e/features (^0.34.30) and the SDK packages (0.34.41).
      // The runtime shapes are identical; only the symbol-keyed type brand
      // differs. See e2e/evm/grammar.ts for the same workaround.
      const TestEvents = registerEvents({
        WidgetUpdated: genEvent({
          name: "WidgetUpdated",
          fields: [
            { name: "widgetId", type: Type.Integer() as any, indexed: true },
            { name: "value", type: Type.Number() as any },
          ],
        } as any),
      });

      // The path should be: ['app', topicHash, 'blockHeight', {arg}, 'widgetId', {arg}]
      // i.e. blockHeight comes BEFORE the user-declared indexed fields.
      const path = TestEvents.WidgetUpdated.path;
      const stringSegments = path.filter((p: any) => typeof p === "string");
      const blockHeightFirst = stringSegments.includes("blockHeight") &&
        stringSegments.indexOf("blockHeight") < stringSegments.indexOf("widgetId");
      if (!blockHeightFirst) {
        console.error("Path missing blockHeight or in wrong position:", path);
        return false;
      }

      // Build the concrete topic the runtime would produce after auto-injecting
      // blockHeight=100 and a user-supplied widgetId=7.
      const concreteTopic = fillPath(path as any, {
        blockHeight: 100,
        widgetId: 7,
      } as any);

      // Subscribe with a `+` wildcard on blockHeight and a `+` wildcard on
      // widgetId via the `fillPath` undefined-handling. This matches what the
      // frontend's typical `filter: { blockHeight: undefined, widgetId: undefined }`
      // produces.
      const wildcardTopic = fillPath(path as any, {
        blockHeight: undefined,
        widgetId: undefined,
      } as any);

      const sub = new TcpClient();
      await sub.connect({
        url: new URL(`mqtt://127.0.0.1:${MQTT_PORT}`),
        numberOfRetries: 0,
      });
      await sub.subscribe({
        subscriptions: [{ topicFilter: wildcardTopic, qos: 2 }],
      });

      const received: { topic: string; payload: any }[] = [];
      const msgPromise = (async () => {
        for await (const msg of sub.messages()) {
          received.push({
            topic: msg.topic!,
            payload: JSON.parse(
              new TextDecoder().decode(msg.payload as Uint8Array),
            ),
          });
          break;
        }
      })();

      await delay(100);

      // Mimic what the runtime does at post-COMMIT flush time: publish on the
      // concrete topic with the non-indexed body fields as JSON.
      const pub = new TcpClient();
      await pub.connect({
        url: new URL(`mqtt://127.0.0.1:${MQTT_PORT}`),
        numberOfRetries: 0,
      });
      await pub.publish({
        topic: concreteTopic,
        payload: new TextEncoder().encode(JSON.stringify({ value: 3.14 })),
        qos: 2,
      });

      await Promise.race([msgPromise, delay(5000)]);

      await pub.disconnect();
      await sub.disconnect();

      if (received.length !== 1) {
        console.error("Did not receive 1 message, got:", received.length);
        return false;
      }
      // Topic should contain both block height and widget id segments.
      if (!received[0].topic.includes("/100/")) {
        console.error("Topic missing blockHeight segment:", received[0].topic);
        return false;
      }
      if (!received[0].topic.endsWith("/7")) {
        console.error("Topic missing widgetId segment:", received[0].topic);
        return false;
      }
      // Payload should carry the non-indexed body.
      if (received[0].payload.value !== 3.14) {
        console.error("Payload mismatch:", received[0].payload);
        return false;
      }
      return true;
    });

    // Test 6: multiple subscribers receive same message
    await assert("MQTT multiple subscribers receive same message", async () => {
      const client1 = new TcpClient();
      const client2 = new TcpClient();
      await client1.connect({
        url: new URL(`mqtt://127.0.0.1:${MQTT_PORT}`),
        numberOfRetries: 0,
      });
      await client2.connect({
        url: new URL(`mqtt://127.0.0.1:${MQTT_PORT}`),
        numberOfRetries: 0,
      });

      await client1.subscribe({
        subscriptions: [{ topicFilter: "multi/test", qos: 0 }],
      });
      await client2.subscribe({
        subscriptions: [{ topicFilter: "multi/test", qos: 0 }],
      });

      const received1: string[] = [];
      const received2: string[] = [];

      const p1 = (async () => {
        for await (const msg of client1.messages()) {
          received1.push(msg.topic!);
          break;
        }
      })();
      const p2 = (async () => {
        for await (const msg of client2.messages()) {
          received2.push(msg.topic!);
          break;
        }
      })();

      await delay(100);

      const publisher = new TcpClient();
      await publisher.connect({
        url: new URL(`mqtt://127.0.0.1:${MQTT_PORT}`),
        numberOfRetries: 0,
      });

      await publisher.publish({
        topic: "multi/test",
        payload: new TextEncoder().encode("hello"),
        qos: 0,
      });

      await Promise.race([Promise.all([p1, p2]), delay(5000)]);

      await publisher.disconnect();
      await client1.disconnect();
      await client2.disconnect();

      return received1.length === 1 && received2.length === 1;
    });

  } finally {
    broker?.stop();
    // Clean up env vars
    delete process.env["MQTT_ENGINE_BROKER_PORT"];
    delete process.env["MQTT_ENGINE_BROKER_WS_PORT"];
    delete process.env["MQTT_BROKER"];
  }
}
