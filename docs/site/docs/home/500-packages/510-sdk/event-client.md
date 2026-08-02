---
title: "@effectstream/event-client"
description: "MQTT-based event client for EffectStream"
sidebar_label: "event-client"
---

<!-- Generated from packages/effectstream-sdk/events/README.md by docs/site/scripts/sync-package-readmes.ts. Do not edit directly. -->

> Package: **[`@effectstream/event-client`](https://www.npmjs.com/package/@effectstream/event-client)** · [Source](https://github.com/effectstream/effectstream/tree/main/packages/effectstream-sdk/events)

MQTT-based event subscriber for EffectStream. Subscribe to type-safe events
streamed by the engine and the batcher - blocks, transactions, primitive
events, and any app-defined event - without writing raw MQTT topic strings.

- MQTT subscriber for Effectstream events: blocks, transactions, primitives, app-defined.
- Type-safe topics; no raw topic strings.
- Connects to the broker run by `@effectstream/event-server` (or any MQTT broker).
- Bun caveat: the `mqtt` WebSocket transport isn't supported on Bun yet; use Node for programmatic consumption.

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

## Inside EffectStream

The client half of the engine/batcher event system. The engine
publishes block, transaction, and primitive events to its MQTT broker;
the batcher publishes its own lifecycle events. Frontends and tools
(like `@effectstream/wallets`, the explorer, and the batcher itself)
subscribe through this package; the runtime publishes via the matching
`@effectstream/event-server`.

The most-imported symbols from this package are `EventManager` and
`BuiltinEvents`. (`getEvmEvent`, often paired with these in
state-machine primitives, lives in `@effectstream/config` - not here.)

> **Bun caveat:** the `mqtt` package's WebSocket transport isn't supported
> on Bun yet. Use Node (or a TCP MQTT broker) when consuming events
> programmatically; the engine's exposed WebSocket transport is for
> browsers.

## Defining your own events

Beyond the built-in events, an app declares its own with `genEvent` and
registers them with `registerEvents`. Each field is a TypeBox schema, and
fields marked `indexed: true` become part of the MQTT topic so subscribers
can filter on them:

```typescript
import { Type } from "@sinclair/typebox";
import { genEvent, registerEvents } from "@effectstream/event-client";

export const AppEvents = registerEvents({
  PreorderPlaced: genEvent({
    name: "PreorderPlaced",
    fields: [
      // Indexed fields can be filtered on by subscribers.
      { name: "buyer", type: Type.String(), indexed: true },
      { name: "launchpad", type: Type.String(), indexed: true },
      // Everything else is delivered in the payload.
      { name: "quantities", type: Type.Array(Type.Number()) },
      { name: "paymentAmount", type: Type.String() },
    ],
  }),
});
```

`registerEvents` auto-prepends `blockHeight` as the first indexed field - do
not declare it yourself. Field names may not contain `$`, `/`, `+` or `#`,
since those are MQTT topic metacharacters; `genEvent` throws if they appear.

Emit from a state transition through the STF input's `emit`, and subscribe
from a frontend:

```typescript
// In a state transition
data.emit(AppEvents.PreorderPlaced, { buyer, launchpad, quantities, paymentAmount });

// In a frontend - `undefined` wildcards an indexed field
EventManager.Instance.subscribe(
  { topic: AppEvents.PreorderPlaced,
    filter: { buyer: myAddress, launchpad: undefined, blockHeight: undefined } },
  (e) => { /* update UI */ },
);
```

Delivery is post-commit: when a subscriber receives an event, a follow-up API
call is guaranteed to see the corresponding database rows, and events from a
rolled-back block are never delivered. A complete example lives in
[`templates/preorder/packages/shared/app-events.ts`](https://github.com/effectstream/effectstream/blob/main/templates/preorder/packages/shared/app-events.ts).

## Key exports

Heavily used across the repo:

- `EventManager` - singleton with `.subscribe`, `.subscribeExplicit`, `.unsubscribe`, `.sendMessage`, `.sendMessageExplicit`. Use `EventManager.Instance`.
- `BuiltinEvents` - pre-baked typed event definitions for `RollupBlock`, `SyncChains`, batcher `BatcherHash`, etc. Pass these into `EventManager.Instance.subscribe(...)`.
- `genEvent(definition)` - declare a typed app event; `registerEvents(map)` registers a map of them. See above.
- `toSignature(event)` - `"name(type1,type2,...)"` string for a typed event.

Types you'll see in callback signatures: `CallbackArgs<E>`,
`CallbackAndMetadata<E>`, `EventPathAndDef`, `LogEvent`,
`RegisteredEvent`.

Also exported: `EventConnect`, `EventBrokerNames`, `TopicPrefix`,
`registerEvents`, `groupEvents`, `encodeEventForStf`, `toSignatureHash`.

Batcher and interop helpers:

- `awaitBatcherHash(batchHash, maxTimeSec = 20)` - resolves to the block height once the batcher reports the given batch hash was processed; useful for waiting out a submission without polling an API.
- `BatcherStatus` - enum of the batcher lifecycle states carried by the built-in batcher events.
- `toEvmAbi(event)` - converts a typed event definition into an EVM ABI entry, so the same declaration can drive both MQTT subscriptions and on-chain log decoding.
- `toAsyncApi(hostInfo, events)` - renders a set of registered events as an AsyncAPI 3.0.0 schema document.

## Examples

Runnable: [`test/examples.test.ts`](https://github.com/effectstream/effectstream/blob/main/packages/effectstream-sdk/events/test/examples.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/sdk/event-client
- Source: https://github.com/effectstream/effectstream/tree/main/packages/effectstream-sdk/events
