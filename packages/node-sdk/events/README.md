# @effectstream/event-server

A localhost-only MQTT broker built on opifex - the server side of
EffectStream's event system. The runtime publishes block, transaction,
primitive, and app events to this broker; frontends and workers
subscribe via `@effectstream/event-client`.

- Localhost-only MQTT broker (opifex) for Effectstream events.
- Publishes from non-loopback connections are rejected at the broker.
- Paired with `@effectstream/event-client` on the consuming side.
- Separate `"effectstream-engine"` and `"Batcher"` instances use their own
  configured TCP and WebSocket ports.

## Install

```bash
bun add @effectstream/event-server
# or
npm install @effectstream/event-server
```

## Standalone usage

`EventBroker` is a thin wrapper around opifex that enforces "only
localhost can publish". Drop it into any local-only pub/sub workflow
without depending on the rest of EffectStream.

```typescript
import { EventBroker } from "@effectstream/event-server";

// Ports are read from MQTT_ENGINE_BROKER_PORT / MQTT_ENGINE_BROKER_WS_PORT
// (or the _BATCHER_ equivalents when constructed with "Batcher").
const broker = new EventBroker("effectstream-engine");
await broker.start(); // resolves after the configured TCP + WS ports are ready
// ...publish and subscribe...
await broker.shutdown(); // resolves after this instance releases its resources
```

Once running, you can connect to it from `@effectstream/event-client`
(or any MQTT client at `mqtt://127.0.0.1:<configured-port>`) to publish
and subscribe to events.

> **Security:** Publishes from non-loopback connections are rejected at
> the broker level. Subscriptions are unrestricted; gate them at the
> network layer if you don't want public consumers.

## Lifecycle

Concurrent calls to `start()` share the same Promise. A successful start means
both transports are accepting connections. If either bind fails, any transport
already acquired by that start is closed before the Promise rejects.

`shutdown()` is awaitable and idempotent: concurrent and repeated calls share
one cached result, including the same rejection. It stops new connections
(late `CONNECT`s are refused with `serverUnavailable`), closes this broker's
authenticated MQTT contexts without publishing their Will messages, closes
active TCP and WebSocket connections, and waits for its listeners and
connection finalizers. Cleanup attempts continue after an error; multiple
failures reject with `AggregateError` in stable cleanup order.

While the broker is running, a broker-initiated disconnect (for example a
keepalive timeout) closes the client's transport immediately. Connection
cleanup failures during normal operation are logged when they happen and
retained (up to 128 records, then counted) so that `shutdown()` reports them;
an otherwise clean shutdown still rejects with those retained errors.

A stopped or failed instance cannot be started again. To restart after
shutdown, construct a fresh `EventBroker`; once shutdown resolves, the
replacement can use the same configured ports. This boundary covers resources
owned by that broker instance, not unrelated application or process handles.

`createServer()` and `stop()` remain `void` compatibility wrappers. They start
the same asynchronous work and log any rejection, but callers that need a
deterministic lifecycle boundary should await `start()` and `shutdown()`.

## Key exports

- `EventBroker` - broker class. Constructor takes
  `"effectstream-engine" | "Batcher"`; clients publish and subscribe through
  MQTT rather than direct class methods.

## Examples

Runnable: [`test/examples.test.ts`](./test/examples.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/node/event-server
- Source: https://github.com/effectstream/effectstream/tree/main/packages/node-sdk/events
