---
title: "@effectstream/event-server"
description: "Event server for EffectStream"
sidebar_label: "event-server"
---

{/* Generated from packages/node-sdk/events/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. */}

> Package: **[`@effectstream/event-server`](https://www.npmjs.com/package/@effectstream/event-server)** · [Source](https://github.com/PaimaStudios/paima-engine/tree/main/packages/node-sdk/events)

A localhost-only MQTT broker built on Aedes — the server side of
EffectStream's event system. The runtime publishes block, transaction,
primitive, and app events to this broker; frontends and workers
subscribe via `@effectstream/event-client`.

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

Runnable: [`test/examples.test.ts`](https://github.com/PaimaStudios/paima-engine/blob/main/packages/node-sdk/events/test/examples.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/node/event-server
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/node-sdk/events
