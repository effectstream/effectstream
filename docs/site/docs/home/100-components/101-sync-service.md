# Sync Protocols & Chain Config

The Sync Service is the core data-ingestion layer of a `EffectStream` node. It acts as the engine's monitor connecting to different blockchains, checking for specific on-chain events, and feeding them in a deterministic, ordered stream to the [State Machine](./102-state-machine.md).

This entire service is configured using the `ConfigBuilder`, a powerful tool that allows you to define exactly which chains to connect to and what data to capture.

## The `ConfigBuilder`

The configuration is built using a fluent, step-by-step interface called the `ConfigBuilder`. This pattern guides you through the process of defining the components of your data pipeline, ensuring a valid and coherent setup.

The main steps are:
1.  **Define Networks**: Specify which blockchains you want to connect to.
2.  **Define Deployments (Optional)**: Create aliases for your deployed contract addresses for cleaner configuration.
3.  **Define Sync Protocols**: Specify *how* the engine should sync data from each network.
4.  **Define Primitives**: Specify *what specific events* the engine should listen for on those networks.

Let's break down each step using a real-world multi-chain example.

```ts
// The entry point is always creating a new ConfigBuilder instance
export const localhostConfig = new ConfigBuilder()
    // ... chain the build steps
    .build();
```

> This file is normally located at `/shared/data-types/src/config.{env}.ts` in the template project.

### Step 1: Defining Networks (`buildNetworks`)

This is where you list all the blockchains your application will interact with. Each network is given a unique name for reference in later steps. EffectStream supports various network types.

In this example, we define an EVM network (`evmParallel_fast`), a private Midnight network, and a special `NTP` network that acts as a deterministic clock.

```ts
.buildNetworks(builder =>
    builder
      // A special network that isn't a blockchain, but a deterministic clock.
      // It produces a new "block" every `blockTimeMS`.
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        startTime: new Date().getTime(),
        blockTimeMS: 1000, // A new block every 1 second
      })
      // An EVM network using viem's chain definitions
      .addViemNetwork({
        ...hardhat, // Base configuration from viem
        name: "evmParallel_fast",
      })
      // A Zero-Knowledge network
      .addNetwork({
        name: "midnight",
        type: ConfigNetworkType.MIDNIGHT,
        // ... midnight specific configuration
      })
  )
```

### Step 2: Defining Deployments (`buildDeployments`)

This optional but highly recommended step allows you to register the addresses of your deployed smart contracts. This keeps your configuration clean, as you can refer to contracts by name instead of repeatedly pasting addresses.

```ts
.buildDeployments((builder) =>
    builder
      .addDeployment(
        (networks) => networks.evmParallel_fast, // Target the network
        (_network) => ({
          name: "EffectStreamErc20DevModule#EffectStreamErc20Dev", // A unique name for this contract
          address: "0x...", // The contract's address. Generated and available in the @example-evm-midnight/contract-evm package
        }),
      )
  )
```

### Step 3: Defining Sync Protocols (`buildSyncProtocols`)

This is the most critical step. Here, you define *how* EffectStream will fetch data from the networks you defined. There are two types of protocols: **Main** and **Parallel**.

### Available Sync Protocols

When you define a sync protocol using `.addMain()` or `.addParallel()`, you must specify its `type`. This tells the EffectStream what kind of data source it's connecting to and how to interpret the data.

#### The Main Protocol: A Deterministic Clock
In EffectStream, your application's "heartbeat" is driven by a single **Main** protocol. This protocol's block progression defines the official timeline for your entire state machine. All events from all other connected chains are deterministically mapped onto this timeline.

For maximum consistency and to decouple your application's tick-rate from the variable block times of real-world blockchains, the main protocol is always a Network Time Protocol (NTP) clock.

*   **`ConfigSyncProtocolType.NTP_MAIN`**: This protocol is not a blockchain. It is a high-precision, deterministic clock that produces a new "block" at a fixed interval (e.g., every 1000 milliseconds). This creates a perfectly stable tick-rate for your game or dApp, ensuring that time-based logic is predictable and consistent across all nodes.

```ts
.addMain(
    (networks) => networks.ntp, // Target the NTP network
    (network, deployments) => ({
        name: "mainNtp",
        type: ConfigSyncProtocolType.NTP_MAIN, // The only valid type for `addMain`
        // ...
    })
)
```

#### Parallel Protocols: Real-World Data Sources
**Parallel** protocols run alongside the main clock and are responsible for fetching data from actual blockchains. You can add as many parallel protocols as you need to create a rich, multi-chain application.

| Protocol Type | Target Blockchain | Description |
| :--- | :--- | :--- |
| **`EVM_RPC_PARALLEL`** | EVM | The most common type. Connects to any EVM-compatible chain (like Ethereum, Arbitrum, Polygon) via a standard JSON-RPC endpoint to fetch block data and logs. |
| **`CARDANO_CARP_PARALLEL`** | Cardano | Connects to the Cardano network using a [Carp](https://dcspark.github.io/carp/docs/intro) indexer. |
| **`CARDANO_UTXORPC_PARALLEL`**| Cardano | An alternative way to connect to Cardano using a [UTXO-RPC](https://www.utxorpc.org/) compatible service like Dolos. |
| **`MINA_PARALLEL`** | Mina | Connects to the Mina Protocol to sync data from zkApps. |
| **`AVAIL_PARALLEL`** | Avail | Connects to the Avail Data Availability (DA) layer to fetch application-specific data blobs. |
| **`MIDNIGHT_PARALLEL`** | Midnight | Connects to the Midnight network to sync state from its ZK-powered smart contracts. |
| **`BITCOIN_RPC_PARALLEL`** | Bitcoin | Connects to Bitcoin Core via JSON-RPC to track UTXO-based transactions. |
| **`CELESTIA_PARALLEL`** | Celestia | Connects to a Celestia light node to fetch data blobs from specific namespaces. |
| **`NEAR_RPC_PARALLEL`** | NEAR | Connects to NEAR Protocol via JSON-RPC to sync blocks, extract NEP-297 events, and track NEAR Intents settlements. |

### Configuration Example

Here is how you would combine these protocols in a `ConfigBuilder` to create a multi-chain application that has a 1-second tick rate and pulls in data from an EVM chain and a Midnight network simultaneously.

```ts
.buildSyncProtocols((builder) =>
    builder
      // 1. Define the main clock for the entire application.
      .addMain(
        (networks) => networks.ntp,
        (network, deployments) => ({
          name: "mainNtp",
          type: ConfigSyncProtocolType.NTP_MAIN,
          startBlockHeight: 1,
          pollingInterval: 1000,
        }),
      )
      // 2. Add a parallel protocol to sync data from an EVM chain.
      .addParallel(
        (networks) => networks.evmParallel_fast,
        (network, deployments) => ({
          name: "parallelEvmRPC_fast",
          type: ConfigSyncProtocolType.EVM_RPC_PARALLEL,
          chainUri: network.rpcUrls.default.http[0],
          startBlockHeight: 1,
          pollingInterval: 500,
        }),
      )
      // 3. Add another parallel protocol to sync data from Midnight.
      .addParallel(
        (networks) => networks.midnight,
        (network, deployments) => ({
          name: "parallelMidnight",
          type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
          startBlockHeight: 1,
          pollingInterval: 1000,
          indexer: "http://127.0.0.1:8088/api/v1/graphql",
        }),
      )
  )
```

### Step 4: Defining Primitives (`buildPrimitives`)

Primitives are the specific event listeners. This is where you tell the engine, "On this protocol, watch this contract for this specific event."

Each primitive is linked to a **`scheduledPrefix`**. This prefix is the crucial link between the Sync Service and the State Machine. When a primitive detects an event, it creates an input with this prefix, which in turn triggers the corresponding State Transition Function (STF).

In this example, we are tracking the `Transfer` event from an ERC20 contract. We use the built-in `PrimitiveTypeEVMERC20` to automatically handle parsing and database updates for token balances.

```ts
import { PrimitiveTypeEVMERC20 } from "@effectstream/sm/builtin";

// ...

.buildPrimitives(builder =>
    builder.addPrimitive(
        // 1. Select the protocol to listen on.
        (syncProtocols) => syncProtocols.parallelEvmRPC_fast,

        // 2. Define the primitive's properties.
        (network, deployments, syncProtocol) => ({
          name: "My_ERC20_Token",
          type: PrimitiveTypeEVMERC20, // Use the built-in ERC20 primitive type
          startBlockHeight: 0,
          contractAddress: deployments["EffectStreamErc20DevModule#EffectStreamErc20Dev"].address,
          // 3. The link to the State Machine.
          // This will trigger the STF registered with the name "transfer".
          scheduledPrefix: "transfer",
        })
    )
  )
```

By combining these steps, you create a powerful, multi-chain data pipeline that transforms raw on-chain events into a clean, ordered set of inputs for your application logic.