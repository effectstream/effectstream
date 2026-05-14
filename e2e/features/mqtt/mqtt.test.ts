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

    // Test 5: multiple subscribers receive same message
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
