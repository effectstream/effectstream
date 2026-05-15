# @effectstream/config

Type-safe configuration builders for EffectStream nodes — networks, deployed
contract addresses, sync protocols, primitives, and security namespaces. A
fluent API with strict TypeScript inference: each builder step refines the
type of what comes next, so misuse fails at compile time.

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

## Inside EffectStream

`config` is what every node component reads to find out which chains to
sync from, where contracts live, and what primitives to emit. The
templates under [`templates/*`](https://github.com/PaimaStudios/paima-engine/tree/main/templates)
all define their config with `ConfigBuilder` in `packages/node/config.dev.ts`.

## Key exports

- `ConfigBuilder` — fluent top-level builder. Calls: `.setNamespace()`, `.buildNetworks()`, `.buildDeployments()`, `.buildSyncProtocols()`, `.buildPrimitives()`, `.build()`.
- `NetworkBuilder`, `DeployedAddressBuilder`, `SyncProtocolBuilder`, `PrimitiveBuilder`, `SecurityNamespaceBuilder` — the per-section builders the top-level wraps.
- `ConfigNetworkType`, `ConfigSyncProtocolType` — enums (EVM, Cardano, Midnight, Bitcoin, Avail, NEAR, Algorand, Mina, Polkadot variants).
- `PaimaStaticConfigContext` — Effection context that exposes the built config to runtime code.
- `withEffectstreamStaticConfig(config)` / `usePaimaStaticConfig()` — generator helpers to inject and retrieve config inside the runtime.
- `getViemNetwork(networkName)` — generator to fetch a viem `Chain` from the active config.
- `toSyncProtocolWithNetwork(...)` — utility joining a sync protocol with its source network config.

## Examples

Runnable: [`test/examples.test.ts`](./test/examples.test.ts).

Real-world usage in templates:
- [`templates/preorder/packages/node/config.dev.ts`](https://github.com/PaimaStudios/paima-engine/blob/main/templates/preorder/packages/node/config.dev.ts)
- [`templates/evm-cardano/packages/node/config.dev.ts`](https://github.com/PaimaStudios/paima-engine/blob/main/templates/evm-cardano/packages/node/config.dev.ts)

## Links

- Docs: https://effectstream.github.io/docs/packages/sdk/config
- Source: https://github.com/PaimaStudios/paima-engine/tree/main/packages/effectstream-sdk/config
