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

    // Test 1b: WebSocket bridge preserves binary MQTT bytes
    //
    // Bun delivers binary WS frames to `Bun.serve.websocket.message` as
    // `Buffer`/`Uint8Array`, NOT `ArrayBuffer` — `binaryType: 'arraybuffer'`
    // only applies to the client-side WebSocket API. A previous version of
    // event-broker.ts's WS handler checked `message instanceof ArrayBuffer`
    // first and fell through to a TextEncoder.encode(buffer-as-string) path
    // for binary frames, which silently replaced every non-UTF-8 byte with
    // U+FFFD (3-byte `EF BF BD`). MQTT control packets start with high bytes
    // (CONNECT 0x10 happens to be valid UTF-8, but SUBSCRIBE 0x82 is not),
    // so SUBSCRIBE was mangled and the broker silently dropped the connection.
    //
    // This test sends a hand-rolled MQTT CONNECT then a SUBSCRIBE starting
    // with the offending 0x82 byte via a raw WebSocket, and asserts both
    // packets are decoded correctly (CONNACK + SUBACK come back unmangled).
    await assert(
      "MQTT WS bridge: binary frame with high bytes round-trips",
      async () => {
        // Hand-rolled MQTT 3.1.1 packets — kept byte-exact so the test fails
        // immediately if anything in the path corrupts the bytes.
        const connect = new Uint8Array([
          0x10, 0x12, // CONNECT, remaining length 18
          0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, // protocol name "MQTT"
          0x04, // protocol level (3.1.1)
          0x02, // connect flags (cleanSession=1)
          0x00, 0x3c, // keepalive 60s
          0x00, 0x06, 0x77, 0x73, 0x74, 0x65, 0x73, 0x74, // client id "wstest"
        ]);
        // SUBSCRIBE to "a/+/b" at QoS 0. First byte 0x82 is invalid UTF-8 —
        // the smoking gun for the fix.
        const subscribe = new Uint8Array([
          0x82, 0x0a, // SUBSCRIBE, remaining length 10
          0x00, 0x01, // packet ID 1
          0x00, 0x05, 0x61, 0x2f, 0x2b, 0x2f, 0x62, // "a/+/b"
          0x00, // QoS 0
        ]);

        const ws = new WebSocket(`ws://127.0.0.1:${MQTT_WS_PORT}`, "mqtt");
        ws.binaryType = "arraybuffer";
        const received: Uint8Array[] = [];
        const opened = new Promise<void>((resolve, reject) => {
          ws.onopen = () => resolve();
          ws.onerror = (e) => reject(e);
        });
        ws.onmessage = (e) => {
          received.push(new Uint8Array(e.data as ArrayBuffer));
        };

        await opened;
        ws.send(connect);

        // Wait for CONNACK
        const tStart = Date.now();
        while (received.length < 1 && Date.now() - tStart < 2000) {
          await delay(20);
        }
        if (received.length < 1) {
          console.error("No CONNACK received");
          ws.close();
          return false;
        }
        const connack = received[0];
        if (
          connack[0] !== 0x20 || connack[1] !== 0x02 ||
          connack[2] !== 0x00 || connack[3] !== 0x00
        ) {
          console.error(
            "Bad CONNACK:",
            Array.from(connack).map((b) => b.toString(16).padStart(2, "0"))
              .join(" "),
          );
          ws.close();
          return false;
        }

        ws.send(subscribe);

        const tSub = Date.now();
        while (received.length < 2 && Date.now() - tSub < 2000) {
          await delay(20);
        }
        ws.close();

        if (received.length < 2) {
          // Pre-fix: the broker decodes the mangled SUBSCRIBE as garbage,
          // throws inside its decoder, and closes the connection without
          // sending SUBACK. We get nothing.
          console.error("No SUBACK received — broker likely dropped connection");
          return false;
        }
        const suback = received[1];
        if (
          suback[0] !== 0x90 || suback[1] !== 0x03 ||
          suback[2] !== 0x00 || suback[3] !== 0x01 ||
          suback[4] !== 0x00
        ) {
          console.error(
            "Bad SUBACK:",
            Array.from(suback).map((b) => b.toString(16).padStart(2, "0"))
              .join(" "),
          );
          return false;
        }
        return true;
      },
    );

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

    // Test 3b: regression — `+` wildcard in the MIDDLE of a filter (with literal
    // segments AFTER it) must still match. This is exactly the topology that
    // `registerEvents` produces when ONE indexed field is wildcarded and other
    // indexed fields are pinned to literal values (e.g. PreorderPlaced's
    // `{ blockHeight: undefined, buyer: 0x..., launchpad: 0x... }` filter).
    //
    // mqtt-cli with the same filter receives NOTHING from this broker while a
    // `#` subscriber sees the publish — strong signal that the matcher misses
    // `+` when literal levels follow.
    await assert("MQTT `+` wildcard in middle of filter matches", async () => {
      const sub = new TcpClient();
      await sub.connect({
        url: new URL(`mqtt://127.0.0.1:${MQTT_PORT}`),
        numberOfRetries: 0,
      });
      // `+` in level 4, with literal levels 5..8 after it. QoS 2 mirrors the
      // real client/runtime configuration (event-manager.ts publishes at
      // QoS 2; frontend subscribes at QoS 2).
      await sub.subscribe({
        subscriptions: [{
          topicFilter: "app/h/blockHeight/+/buyer/0xb/launchpad/0xL",
          qos: 2,
        }],
      });

      const received: string[] = [];
      const msgPromise = (async () => {
        for await (const msg of sub.messages()) {
          received.push(msg.topic!);
          break;
        }
      })();

      await delay(100);

      const pub = new TcpClient();
      await pub.connect({
        url: new URL(`mqtt://127.0.0.1:${MQTT_PORT}`),
        numberOfRetries: 0,
      });
      await pub.publish({
        topic: "app/h/blockHeight/799/buyer/0xb/launchpad/0xL",
        payload: new TextEncoder().encode("{}"),
        qos: 2,
      });

      await Promise.race([msgPromise, delay(3000)]);

      await pub.disconnect();
      await sub.disconnect();

      if (received.length !== 1) {
        console.error(
          "`+` middle-of-filter match failed. received:",
          received,
        );
        return false;
      }
      return true;
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

    // Test 5b: regression — registerEvents with non-scalar non-indexed fields
    //
    // The original `registerEvents` ran fields through `addHashes`, which only
    // short-circuits on `field.indexed === false`. User-declared fields default
    // to `indexed: undefined`, so non-scalar types (Array, Boolean, Object...)
    // got a phantom `${name}Hash` indexed slot injected. That slot had no value
    // at publish time, so `fillPath` closed the topic with `/#` — an MQTT
    // multi-level wildcard that PUBLISH topics are forbidden to contain
    // (MQTT 3.1.1 §4.7.1.1). Opifex's encoder rejected those topics, the QoS-2
    // state machine stalled, and all subsequent subscribers went silent.
    //
    // This shape mirrors `PreorderPlaced` in the preorder template — the first
    // real event in the codebase to use `Type.Array(...)` non-indexed, and the
    // event that surfaced the bug in production.
    await assert(
      "registerEvents: non-scalar non-indexed fields produce valid topics",
      async () => {
        const { registerEvents, genEvent, fillPath } = await import(
          "@effectstream/event-client"
        );
        const { Type } = await import("@sinclair/typebox");

        const TestEvents = registerEvents({
          OrderPlaced: genEvent({
            name: "OrderPlaced",
            fields: [
              { name: "buyer", type: Type.String() as any, indexed: true },
              { name: "itemIds", type: Type.Array(Type.Integer()) as any },
              { name: "quantities", type: Type.Array(Type.Integer()) as any },
              { name: "valid", type: Type.Boolean() as any },
              { name: "amount", type: Type.String() as any },
            ],
          } as any),
        });

        const path = TestEvents.OrderPlaced.path;

        // Smoking-gun assertion: NO segment may be the literal '#'. A '#' here
        // means `fillPath` had a phantom indexed slot it couldn't fill from the
        // user-supplied filter — i.e. addHashes (or any future re-introduction
        // of it) silently injected a hash field for a non-scalar type.
        for (const seg of path) {
          if (seg === "#") {
            console.error(
              "Path contains forbidden '#' wildcard segment:",
              path,
            );
            return false;
          }
        }

        const concreteTopic = fillPath(path as any, {
          blockHeight: 42,
          buyer: "0xabc",
        } as any);

        // PUBLISH topics may not contain '#' or '+' (MQTT 3.1.1 §4.7.1.1).
        if (concreteTopic.includes("#") || concreteTopic.includes("+")) {
          console.error("Concrete publish topic contains wildcard:", concreteTopic);
          return false;
        }

        const wildcardTopic = fillPath(path as any, {
          blockHeight: undefined,
          buyer: undefined,
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

        const body = {
          itemIds: [1, 2, 3],
          quantities: [10, 20, 30],
          valid: true,
          amount: "1000",
        };

        const pub = new TcpClient();
        await pub.connect({
          url: new URL(`mqtt://127.0.0.1:${MQTT_PORT}`),
          numberOfRetries: 0,
        });
        await pub.publish({
          topic: concreteTopic,
          payload: new TextEncoder().encode(JSON.stringify(body)),
          qos: 2,
        });

        await Promise.race([msgPromise, delay(5000)]);

        await pub.disconnect();
        await sub.disconnect();

        if (received.length !== 1) {
          console.error("Did not receive 1 message, got:", received.length);
          return false;
        }
        if (!received[0].topic.includes("/42/")) {
          console.error("Topic missing blockHeight segment:", received[0].topic);
          return false;
        }
        if (!received[0].topic.endsWith("/0xabc")) {
          console.error("Topic missing buyer segment:", received[0].topic);
          return false;
        }
        const p = received[0].payload;
        if (
          !Array.isArray(p.itemIds) || p.itemIds.length !== 3 ||
          !Array.isArray(p.quantities) || p.quantities.length !== 3 ||
          p.valid !== true || p.amount !== "1000"
        ) {
          console.error("Payload roundtrip mismatch:", p);
          return false;
        }
        return true;
      },
    );

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
