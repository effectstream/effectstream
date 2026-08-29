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
import { hardhat } from "viem/chains";

export const config = new ConfigBuilder()
  .setNamespace((b) => b.setSecurityNamespace("my-app"))
  .buildNetworks((b) =>
    b.addNetwork({
      name: "local-evm",
      type: ConfigNetworkType.EVM,
      ...hardhat,
    })
  );
  // continue with .buildDeployments(), .buildSyncProtocols(),
  // .buildPrimitives(), and finally .build()
```

The runtime side (`PaimaStaticConfigContext`, `withEffectstreamStaticConfig`,
`usePaimaStaticConfig`) plugs that same config into an Effection context so
node packages can read it. You don't need those entry points unless you're
running a full node.

### NTP clock defaults

An NTP network may be added as concisely as
`addNetwork({ type: ConfigNetworkType.NTP })`. The builder supplies the `ntp`
name, a 1,000 ms block time, and a `startTime` sampled when `addNetwork` runs.
That dynamic clock is a convenience for ephemeral applications and tests. A
persistent application must provide an explicit, stable `startTime` so restarts
continue from the same genesis instead of creating a new timeline.

## Inside EffectStream

`config` is what every node component reads to find out which chains to
sync from, where contracts live, and what primitives to emit. The
templates under [`templates/*`](https://github.com/effectstream/effectstream/tree/main/templates)
all define their config with `ConfigBuilder` in `packages/node/config.dev.ts`.

## Key exports

What app code typically imports:

- `ConfigBuilder` - fluent top-level builder. Chain `.setNamespace()`, `.buildNetworks()`, `.buildDeployments()`, `.buildSyncProtocols()`, `.buildPrimitives()`, then `.build()`. Used by every template.
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
