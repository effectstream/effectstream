---
title: "@effectstream/event-client"
description: "MQTT-based event client for EffectStream"
sidebar_label: "event-client"
---

<!-- Generated from packages/effectstream-sdk/events/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. -->

> Package: **[`@effectstream/event-client`](https://www.npmjs.com/package/@effectstream/event-client)** · [Source](https://github.com/PaimaStudios/paima-engine/tree/main/packages/effectstream-sdk/events)

MQTT-based event subscriber for EffectStream. Subscribe to type-safe events
streamed by the engine and the batcher — blocks, transactions, primitive
events, and any app-defined event — without writing raw MQTT topic strings.

## Install

```bash
bun add @effectstream/event-client
# or
npm install @effectstream/event-client
```

## Standalone usage

You need a reachable MQTT broker. EffectStream's engine and batcher run
brokers (default ports `8883` and `8884` over WebSocket); point at one of
those, or your own.

```typescript
import {
  BuiltinEvents,
  EventManager,
} from "@effectstream/event-client";

const sub = await EventManager.Instance.subscribe(
  {
    topic: BuiltinEvents.RollupBlock,
    filter: {},        // no path variables on this topic
  },
  ({ rollup, msTimestamp }) => {
    console.log("new rollup block", rollup, "at", msTimestamp);
  },
);

// Later: EventManager.Instance.unsubscribe(sub);
```

`subscribe` returns a symbol you can pass to `unsubscribe`. For events that
encode variables in the topic path (e.g. `block/${blockHeight}`), pass
`filter: { blockHeight }` to subscribe only to a specific value, or
`filter: { blockHeight: "*" }` to subscribe to all.

### Defining your own events

```typescript
import { registerEvents } from "@effectstream/event-client";
import { Type } from "@sinclair/typebox";

const events = registerEvents({
  GameStarted: {
    path: ["app", "game-started", { gameId: "string" }],
    type: Type.Object({ players: Type.Array(Type.String()) }),
    broker: "engine",
  },
});

// events.GameStarted is now a typed `EventPathAndDef` you can pass to
// EventManager.Instance.subscribe(...).
```

## Inside EffectStream

This is the client half of the engine/batcher event system. The engine
publishes block, transaction, and primitive events to its MQTT broker; the
batcher publishes its own lifecycle events. Frontend code subscribes
through this package; the runtime publishes via the matching
`@effectstream/event-server`.

> **Bun caveat:** the `mqtt` package's WebSocket transport isn't supported
> on Bun yet. Use Node (or a TCP MQTT broker) when consuming events
> programmatically; the engine's exposed WebSocket transport is for
> browsers.

## Key exports

- `EventManager` — singleton with `.subscribe`, `.subscribeExplicit`, `.unsubscribe`, `.sendMessage`, `.sendMessageExplicit`. Use `EventManager.Instance`.
- `EventConnect` — lower-level connection manager. Lazily opens a single MQTT client per `EventBrokerNames`.
- `EventBrokerNames` enum — `Engine`, `Batcher`.
- `TopicPrefix` enum — `Batcher`, `Node`, `App`.
- `registerEvents(map)` — turn a record of `{ path, type, broker }` definitions into typed `EventPathAndDef`s.
- `groupEvents(events)` — group registered events by name (for overload handling).
- `encodeEventForStf(...)` / `toSignature(...)` / `toSignatureHash(...)` — encode an app event into the runtime format and derive its keccak signature.
- `getEvmEvent(abi, signatureHash)` — pull an event definition out of an EVM ABI by signature hash.
- `CallbackArgs<E>`, `CallbackAndMetadata<E>`, `EventPathAndDef`, `LogEvent`, `RegisteredEvent` — types you'll see in callback signatures.

## Examples

Runnable: [`test/examples.test.ts`](https://github.com/PaimaStudios/paima-engine/blob/main/packages/effectstream-sdk/events/test/examples.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/sdk/event-client
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/effectstream-sdk/events
