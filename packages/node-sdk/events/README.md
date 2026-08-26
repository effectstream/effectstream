# @effectstream/event-server

A localhost-only MQTT broker built on opifex - the server side of
EffectStream's event system. The runtime publishes block, transaction,
primitive, and app events to this broker; frontends and workers
subscribe via `@effectstream/event-client`.

- Localhost-only MQTT broker (opifex) for Effectstream events.
- Publishes from non-loopback connections are rejected at the broker.
- Paired with `@effectstream/event-client` on the consuming side.
- The engine starts a single broker (`"effectstream-engine"`). A batcher that enables its own event system runs a separate `EventBroker` instance in its own process.

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
await broker.start(); // listens on the configured TCP + WS ports
// ...
await broker.shutdown(); // resolves after connections/listeners release ports
```

Once running, you can connect to it from `@effectstream/event-client`
(or any MQTT client at `mqtt://127.0.0.1:<configured-port>`) to publish
and subscribe to events.

> **Security:** Publishes from non-loopback connections are rejected at
> the broker level. Subscriptions are unrestricted; gate them at the
> network layer if you don't want public consumers.

## Inside EffectStream

The runtime instantiates two `EventBroker`s (engine and batcher) so
state-machine and batcher events flow on separate topic namespaces. Apps
publish through `EventManager.Instance.sendMessage(...)` in
`@effectstream/event-client`, which writes against the local broker
exposed here.

## Key exports

- `EventBroker` - broker class. Constructor takes `"effectstream-engine" | "Batcher"`.
  `start()` is idempotent while starting/started and resolves after both TCP and
  WebSocket readiness. `shutdown()` is async, idempotent, coalesced, destroys
  accepted TCP connections, and resolves only after both listeners release
  their ports. Partial-start failures clean up before rejecting. `createServer()`
  and `stop()` remain compatibility wrappers; they observe and log asynchronous
  rejection but cannot be awaited. Start after shutdown or failed start is not
  supported. Clients publish and subscribe via MQTT rather than direct methods.

## Examples

Runnable: [`test/examples.test.ts`](./test/examples.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/node/event-server
- Source: https://github.com/effectstream/effectstream/tree/main/packages/node-sdk/events
