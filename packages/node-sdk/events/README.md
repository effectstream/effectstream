# @effectstream/event-server

A localhost-only MQTT broker built on Aedes — the server side of
EffectStream's event system. The runtime publishes block, transaction,
primitive, and app events to this broker; frontends and workers
subscribe via `@effectstream/event-client`.

- Localhost-only MQTT broker (Aedes) for Effectstream events.
- Publishes from non-loopback connections are rejected at the broker.
- Paired with `@effectstream/event-client` on the consuming side.
- Runs two brokers in production: one for engine events, one for batcher events.

## Install

```bash
bun add @effectstream/event-server
# or
npm install @effectstream/event-server
```

## Standalone usage

`EventBroker` is a thin wrapper around Aedes that enforces "only
localhost can publish". Drop it into any local-only pub/sub workflow
without depending on the rest of EffectStream.

```typescript
import { EventBroker } from "@effectstream/event-server";

const broker = new EventBroker("effectstream-engine");
const server = broker.createServer();

server.listen(8883, "127.0.0.1", () => {
  console.log("MQTT broker listening on localhost:8883");
});
```

Once running, you can connect to it from `@effectstream/event-client` (or
any MQTT client at `mqtt://127.0.0.1:8883`) to publish and subscribe to
events.

> **Security:** Publishes from non-loopback connections are rejected at
> the Aedes level. Subscriptions are unrestricted; gate them at the
> network layer if you don't want public consumers.

## Inside EffectStream

The runtime instantiates two `EventBroker`s (engine and batcher) so
state-machine and batcher events flow on separate topic namespaces. Apps
publish through `EventManager.Instance.sendMessage(...)` in
`@effectstream/event-client`, which writes against the local broker
exposed here.

## Key exports

- `EventBroker` — broker class. Constructor takes `"effectstream-engine" | "Batcher"`. Methods: `createServer()`, `publish(topic, payload)`, `subscribe(topic, cb)`.

## Examples

Runnable: [`test/examples.test.ts`](./test/examples.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/node/event-server
- Source: https://github.com/effectstream/effectstream/tree/main/packages/node-sdk/events
