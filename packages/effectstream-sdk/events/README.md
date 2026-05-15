# @effectstream/event-client

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

## Inside EffectStream

The client half of the engine/batcher event system. The engine
publishes block, transaction, and primitive events to its MQTT broker;
the batcher publishes its own lifecycle events. Frontends and tools
(like `@effectstream/wallets`, the explorer, and the batcher itself)
subscribe through this package; the runtime publishes via the matching
`@effectstream/event-server`.

The most-imported symbols across the repo are `getEvmEvent` (used by
state-machine primitives to decode EVM logs against an ABI),
`EventManager`, and `BuiltinEvents`.

> **Bun caveat:** the `mqtt` package's WebSocket transport isn't supported
> on Bun yet. Use Node (or a TCP MQTT broker) when consuming events
> programmatically; the engine's exposed WebSocket transport is for
> browsers.

## Key exports

Heavily used across the repo:

- `getEvmEvent(abi, signatureHash)` — pull an event definition out of an EVM ABI by signature hash. Used by EVM-side state-machine primitives.
- `EventManager` — singleton with `.subscribe`, `.subscribeExplicit`, `.unsubscribe`, `.sendMessage`, `.sendMessageExplicit`. Use `EventManager.Instance`.
- `BuiltinEvents` — pre-baked typed event definitions for `RollupBlock`, `SyncChains`, batcher `BatcherHash`, etc. Pass these into `EventManager.Instance.subscribe(...)`.
- `toSignature(event)` — `"name(type1,type2,...)"` string for a typed event.

Types you'll see in callback signatures: `CallbackArgs<E>`,
`CallbackAndMetadata<E>`, `EventPathAndDef`, `LogEvent`,
`RegisteredEvent`.

Lower-level / less-used (exported but no in-repo consumers): `EventConnect`,
`EventBrokerNames` (enum value, vs. the imported type), `TopicPrefix`,
`registerEvents`, `groupEvents`, `encodeEventForStf`, `toSignatureHash`.
Kept for downstream SDK use.

## Examples

Runnable: [`test/examples.test.ts`](./test/examples.test.ts).

## Links

- Docs: https://effectstream.github.io/docs/packages/sdk/event-client
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/effectstream-sdk/events
