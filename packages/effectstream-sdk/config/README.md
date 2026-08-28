# @effectstream/config

Type-safe configuration builders for EffectStream nodes - networks, deployed
contract addresses, sync protocols, primitives, and security namespaces. A
fluent API with strict TypeScript inference: each builder step refines the
type of what comes next, so misuse fails at compile time.

- Fluent, type-safe configuration builders for Effectstream nodes.
- Strict inference: each step refines the type of what comes next, so misuse is a compile error.
- Used by every template's `packages/node/config.dev.ts`.
- Covers networks, deployed contract addresses, sync protocols, primitives, security namespaces.

## Install

```bash
bun add @effectstream/config
# or
npm install @effectstream/config
```

## Standalone usage

The builders are pure data assembly. You can construct a config object
outside an EffectStream node and inspect it, snapshot it, or feed it to
your own tooling.

```typescript
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";

export const config = new ConfigBuilder()
  .buildNetworks((b) =>
    b
      .addNetwork({ type: ConfigNetworkType.NTP })
      .addNetwork({
        type: ConfigNetworkType.MIDNIGHT,
        networkId: "stagenet",
      })
  )
  .buildSyncProtocols((b) => b
    .addMain(
      (networks) => networks.ntp,
      () => ({
        name: "ntp",
        type: ConfigSyncProtocolType.NTP_MAIN,
        startBlockHeight: "latest",
      }),
    )
    .addParallel(
      (networks) => networks.midnight,
      () => ({
        name: "midnight",
        type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
        startBlockHeight: "latest",
      }),
    ))
  .buildPrimitives((b) => b)
  .build();
```

`setNamespace(...)` remains available for an explicit string or historical
namespace object, but it is optional during config construction. A built config
without it keeps `securityNamespace: undefined`; the canonical process runner,
not this builder, may supply an application-owned fallback.

## Getting-started defaults

Defaults are owned by the integration that knows their meaning, and every one
can be overridden:

- `{ type: ConfigNetworkType.NTP }` becomes `name: "ntp"`,
  `startTime: Date.now()` sampled once by `addNetwork`, and
  `blockTimeMS: 1_000`.
- An unnamed Midnight network becomes `name: "midnight"`; `networkId` remains
  required and is never inferred.
- The no-op deployment stage may be omitted. Calling `buildSyncProtocols`
  directly after networks materializes the same empty deployment map;
  `buildDeployments` remains available for real address mappings.
- Omitted NTP polling is `1_000` ms. Omitted Midnight polling is `6_000` ms.
  Other integrations retain their existing polling requirements.
- A Midnight sync protocol may omit `indexer`; it is resolved from the selected
  network's `networkId`. An explicit indexer always wins.
- A primitive may omit `startBlockHeight`; runtime normalization supplies its
  owning protocol's resolved numeric start. A Midnight primitive may likewise
  omit `networkId`; the owning Midnight network supplies it. Explicit primitive
  values always win.

The implicit NTP `startTime` is a convenience for getting started. A persistent
deployment that needs stable time-to-height mapping should supply and persist
an explicit value so a restart cannot establish a different genesis.

`resolveMidnightNetworkProfile(networkId)` exposes pure node, indexer HTTP/WS,
and informational faucet metadata. It performs no environment lookup, wallet
initialization, funding request, or network I/O. The exact node-2.x Stagenet
profile is:

| Field | Value |
| --- | --- |
| Node | `wss://rpc.stagenet.shielded.tools` |
| Indexer HTTP | `https://indexer.stagenet.shielded.tools/api/v4/graphql` |
| Indexer WebSocket | `wss://indexer.stagenet.shielded.tools/api/v4/graphql/ws` |
| Informational faucet | `https://faucet.stagenet.shielded.tools/api/drips` |

The faucet value is metadata only. `undeployed` retains loopback endpoints;
other non-empty IDs retain the hosted Midnight convention. Preview and Preprod
remain recognizable IDs, but their node-1.x wallet/deployment stacks are not
targets for the node-2.x line.

The runtime side (`PaimaStaticConfigContext`, `withEffectstreamStaticConfig`,
`usePaimaStaticConfig`) plugs that same config into an Effection context so
node packages can read it. You don't need those entry points unless you're
running a full node.

## Inside EffectStream

`config` is what every node component reads to find out which chains to
sync from, where contracts live, and what primitives to emit. The
templates under [`templates/*`](https://github.com/effectstream/effectstream/tree/main/templates)
all define their config with `ConfigBuilder` in `packages/node/config.dev.ts`.

## Key exports

What app code typically imports:

- `ConfigBuilder` - fluent top-level builder. Optionally call `.setNamespace()`,
  then chain `.buildNetworks()`, an optional `.buildDeployments()`,
  `.buildSyncProtocols()`, `.buildPrimitives()`, and `.build()`.
- `resolveMidnightNetworkProfile(networkId)` - pure Midnight service metadata
  resolver shared by configuration, wallet, and deployment integrations.
- `ConfigNetworkType`, `ConfigSyncProtocolType` - enums for the network and sync-protocol kinds (EVM, Cardano, Midnight, Bitcoin, Avail, NEAR, Algorand, Mina, Polkadot, NTP variants). The most-imported symbols from this package by far.
- `withEffectstreamStaticConfig(config)` - Effection generator that publishes the built config to the runtime context.
- `toSyncProtocolWithNetwork(...)` - joins a sync protocol with its source network config; used by app code when wiring custom primitives.
- `getViemNetwork(network)` - generator that returns a viem `Chain`. Takes the EVM **network config object** (a `ConfigNetworkEvm`), not a network name.
- `getPrimitivesForSyncProtocol(...)` - the primitives registered against a given sync protocol.
- `onlyOnce`, `onlyValue`, `onlyNotError` - small helpers for narrowing config lookups that may return zero, many, or error results.

Per-section builders (`NetworkBuilder`, `DeployedAddressBuilder`,
`SyncProtocolBuilder`, `PrimitiveBuilder`, `SecurityNamespaceBuilder`)
are exported, but you usually access them via the callback argument
inside `ConfigBuilder.setNamespace((b) => b.setSecurityNamespace(...))`
rather than importing them directly.

Runtime-side context types (`PaimaStaticConfigContext`,
`usePaimaStaticConfig`) are reserved for the runtime's own internals
and aren't typically imported by app code.

## The schema layer

Underneath the builders sits a large TypeBox schema surface — roughly 130
exports — that defines and validates the shape of a configuration. App code
rarely imports from it directly, because `ConfigBuilder` produces
already-validated config, but it is the authority on what fields each network
and sync protocol accepts:

- `ConfigSchema` - the wrapper class the per-section schemas are built from, with `required` / `optional` halves and helpers like `allProperties()` and `cloneMerge()`.
- `ConfigNetworkSchema*` - one per network kind, e.g. `ConfigNetworkSchemaMidnight` (whose `networkId` is a string such as `"undeployed"`), `ConfigNetworkSchemaEvm`, `ConfigNetworkSchemaCardano`. Each pairs with a `ConfigNetwork*` static type.
- `ConfigSyncProtocolSchema*` - one per protocol, carrying that protocol's polling, block-range and endpoint fields.
- `CommonResponse*` - the payload shapes primitives deliver to the state machine.
- `LedgerSchema` / `LedgerPrimitiveType` - the ledger-field types usable in primitive definitions.

If you are writing a custom primitive or network integration and need to know
exactly which fields are accepted, read the schema for that kind in
`src/schema/` — it is the source of truth the builders validate against.

## Examples

Runnable: [`test/examples.test.ts`](./test/examples.test.ts).

Real-world usage in templates:
- [`templates/preorder/packages/node/config.dev.ts`](https://github.com/effectstream/effectstream/blob/main/templates/preorder/packages/node/config.dev.ts)
- [`templates/evm-cardano/packages/node/config.dev.ts`](https://github.com/effectstream/effectstream/blob/main/templates/evm-cardano/packages/node/config.dev.ts)

## Links

- Docs: https://effectstream.github.io/docs/packages/sdk/config
- Source: https://github.com/effectstream/effectstream/tree/main/packages/effectstream-sdk/config
