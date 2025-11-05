---
sidebar_position: 10
slug: /quick-start
---

# Quick Start

> Linux and macOS are supported. Windows WSL is experimental.

> This is a preview of the Effectstream V2 documentation. We welcome any feedback you have on errors, missing information, or parts that aren't clear.

First, clone the repository and use the `templates/evm-midnight/` folder as a working template:

```sh
git clone git@github.com:PaimaStudios/paima-engine.git --branch v-next
cd effectstream-engine/templates/evm-midnight

# Check for external dependencies
../check.sh

# Install packages
deno install --allow-scripts && ./patch.sh

# Compile contracts
deno task build:evm
deno task build:midnight

# Launch Effectstream Node
deno task dev
```

Now you should see the dApp running in your browser!

### Terminal

<iframe src="https://drive.google.com/file/d/1vLHmm9HrPrKiIHJlnnX3aopeX0J-A9Oz/preview" width="640" height="480" allow="autoplay"></iframe>

### Browser

<iframe src="https://drive.google.com/file/d/1hDh5PkKQdDx8UXnBsS1clypvXF14Msvm/preview" width="640" height="480" allow="autoplay"></iframe>

Once you have the template up and running, there are different parts you can modify or extend.

- **State Machine**: Logic and rules for events.
- **Front End**: User side App.
- **Chain Config**: Connect different chains.
- **Process Orchestrator**: Decide what processes to start and run for development.
- **Contracts & Effectstream-L2**: Deploy and connect different contracts.
- **Grammar**: Define Effectstream-L2 Contract valid Inputs

More [Components](../100-components/100-components.md)

## Packages & Folder Structure

> We will be using `/templates/evm-midnight/` as example for the following definitions.

Default folder structure:

```
|-- deno.json                     # workspace definition
|-- packages
     |-- client                   # Effectstream node
     |     |-- database           # database queries and tables
     |     |-- node               # node startup, api, and state machine
     |
     |-- frontend                 # web app
     |
     |-- shared                   # shared components between client and frontend
     |     |-- contracts/evm      # hardhat & evm contracts
     |     |-- contracts/midnight # midnight contracts
     |     |-- data-types         # grammar and node sync/contract definitions
```

Workspace packages:

```

client/database              @example-evm-midnight/database
client/node                  @example-evm-midnight/node
frontend                     @example-evm-midnight/frontend
shared/contracts/evm         @example-evm-midnight/evm-contracts
shared/contracts/midnight    @example-evm-midnight/midnight-contracts
shared/contracts/data-types  @example-evm-midnight/data-types
```

## Startup Overview

The Effectstream Startup sequence:

```mermaid
---
config:
  flowchart:
    subGraphTitleMargin:
      top: 5
      bottom: 25
---
graph TD
    subgraph "User"
        A["fa:fa-keyboard $ deno task dev"]
    end

    subgraph "Phase 1: Orchestration"
        B(Process Orchestrator)
        subgraph "Launches & Monitors Dependencies"

            C[fa:fa-server Infrastructure:<br/>Database, Collector, ...]
            D[fa:fa-database Dev Tools:<br/>TUI, Explorer, ...]
            E[fa:fa-network-wired Chain Services:<br/>Nodes, Indexers, Proof Server, Deploy Contracts, ...]
            F[Frontends]
        end
        G{fa:fa-hourglass-half Wait for Dependencies to be Ready...}
    end

    subgraph "Phase 2: Effectstream Node Execution"
        H(Effectstream Node)
        subgraph "Node Initializes Internal Services"
            I[fa:fa-sync Chain & Primitives Sync Service]
            J[fa:fa-cogs State Machine & State]
            K[fa:fa-plug API Server]
            L[Other Subsystems]
        end
    end

    A --> B;
    B --> C;
    B --> D;
    B --> E;
    B --> F;

    C --> G;
    D --> G;
    E --> G;
    F --> G;

    G -- All services ready --> H;

    H --> L;
    H --> I;
    H --> J;
    H --> K;
```

The `start(...)` function launches the node. It's located in `/packages/node/src/main.ts`, and receives as inputs the node configuration.

```ts
main(function* () {
  yield* init();

  yield* withEffectstreamStaticConfig(localhostConfig, function* () {
    yield* start({
      appName: "My-dApp",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(localhostConfig),
      stateTransitions,
      migrations,
      apiRouter,
      grammar,
    });
  });

  yield* suspend();
});
```

Learn more about the [Node Startup](../100-components/117-node-startup.md)

## State Machine

A State Machine (SM) is the core of your Effectstream application, defining its logic and rules. Let's break down the concept:

1. It has a State, which is the complete record of the Effectstream Node at any given moment (e.g., user assets, statuses, etc.), stored in a database.
2. The SM is defined by a series of State Transition Functions (STFs). These are the functions that change the State in response to an Input.
3. The Inputs are blockchain events that your application is configured to monitor. The STFs process these on-chain events and transform them into updates for your application's state.
4. The SM is deterministic, meaning multiple instances of a Effectstream Node processing the same inputs in the same order will always generate the exact same final State.
5. The entire process runs within the Effectstream Node.

```
                     State Machine
Block Chain -> STF-1 (e.g., handle mint)    -> Application Data
Events         STF-2 (e.g., handle transfer)   (database)
               STF-N (...)
```

Let's start with a practical example where calls to a `Effectstream L2` contract are converted into actions.

For example, this STF:

```ts
stm.addStateTransition("create", function* (data) {
  const { game_id } = data.parsedInput.payload;
  yield* World.resolve(create_game, {
    game_id: game_id,
    block_height: data.blockHeight,
  });
  return;
});
```

If the contract [Effectstream L2 Event](../100-components/104-effectstream-l2-contract.md) function `submitGameInput` is called with payload `["create", "0x1234"]`, this creates a row in your `games` table, with id = `0x1234`

Now your application can read the database and use the created "game" from the table.

More about the [State Machine](../100-components/102-state-machine.md)

## Frontend (dApp)

The frontend is your user-facing application, such as a web game or a dashboard.
The `/templates/evm-midnight/` comes with a folder called `/packages/frontend/` with an example Web App. It interacts with Effectstream in two primary ways:

### Writes (Sending Actions)

> Effectstream web application, games or other frontend require to write to the Blockchain to interact with Effectstream.

- **Direct Contract Interaction**. E.g., Call `transfer` on a `ERC20` contract. Wallets can be integrated to make these calls.
- **Direct Effectstream L2 Contract Interaction**: `Submit Input` method. This allows to pass a custom message to the engine. Wallets can be integrated to make these calls.
- **Batcher Interaction**: Interact with your contracts, but through a HTTP calls. This custom built service can convert and validate the calls and writes to the Contract.

### Reads

- **Reads from Blockchain** Some blockchains expose APIs you can read to get the state or other information. We do not recommend doing this unless strictly necessary.
- **Reads from Effectstream API** Effectstream Provides son Endpoints you can consume.
- **Reads from Custom API** You can create your own custom endpoints.

More about the [Frontend](../100-components/115-frontend.md)
More about the [API](../100-components/103-api.md)

## Chain Config & Sync Service

The Sync Service is the bridge between the blockchain world and your application's logic. You configure this service using the `ConfigBuilder` to define **Primitives**. A primitive is a specific listener for on-chain events, such as a token transfer or an interaction with your [Effectstream L2 contract](../100-components/104-effectstream-l2-contract.md).

When a primitive detects an event, it uses a `scheduledPrefix` to trigger the corresponding State Transition Function (STF) in your [state machine](../100-components/102-state-machine.md). This setup allows your application to react to events from multiple chains in a deterministic way.

A example minimal configuration looks like this:

```ts
export const localhostConfig = new ConfigBuilder()
  // Define which chains to connect to
  .buildNetworks(builder =>
    .addNetwork({
          name: "ntp",
          type: ConfigNetworkType.NTP
          startTime: launchStartTime ?? new Date().getTime(),
          blockTimeMS: 1000,
    })
    .addViemNetwork({ name: "evmchain", ...hardhat })
    .addNetwork({
        name: "midnight",
        type: ConfigNetworkType.MIDNIGHT,
        /* other fields */
     })
  // Define how to sync from those chains
  .buildSyncProtocols(builder =>
    builder.addMain(/*...main protocol config...*/)
    builder.addParallel(/* evm */)
    builder.addParallel(/* midnightr */)
  )
  // Define what specific events to listen for
  .buildPrimitives(builder =>
    builder.addPrimitive(
        (syncProtocols) => syncProtocols.evmchain,
        (network, deployments, syncProtocol) => ({
          name: "Track-ERC721",
          type: ConfigPrimitiveType.EvmRpcERC721,
          contractAddress: "0x...",
          abi: getEvmEvent(erc722.abi, "Transfer(...)"),
          // This prefix triggers the 'transfer-assets' STF
          scheduledPrefix: "transfer-assets",
        })
    )
  )
  .build();
```

This configuration tells the engine to watch an ERC721 contract for `Transfer` events and trigger the `transfer-assets` function in your state machine whenever one occurs.

Learn more about the [Sync Service & Chain Config](../100-components/101-sync-service.md).

## Contracts

Effectstream can monitor any smart contract on a supported chain by listening to the **events** it emits. For example, you can deploy a standard ERC20 contract, and the engine can track its `Transfer` events to update balances in your application's state.

```solidity
// A standard ERC20 contract Effectstream can listen to
contract Erc20Dev is ERC20 {
    constructor() ERC20("Mock ERC20", "MERC") {}
    function mint(address _to, uint256 _amount) external {
        _mint(_to, _amount); // This emits the Transfer event
    }
}
```

While any contract works, Effectstream provides the specialized **`Effectstream L2Contract`**, which acts as a highly efficient "mailbox" for your game. Instead of deploying complex on-chain logic, you send simple, formatted strings (e.g., `["attack","p1", "m7"]`) to its `submitInput` function. This saves gas, increases flexibility, and enables the **Batcher** for a cross-chain, gasless user experience.

You connect a contract event to your State Machine by defining a **Primitive** in your chain configuration, which links the event to a `scheduledPrefix` that triggers your game logic.

Learn more about [Contracts](../100-components/105-contracts.md)
More about [Effectstream L2](../100-components/104-effectstream-l2-contract.md)

## Process Orchestrator

Developing a multi-chain dApp requires running many services at once. The **Process Orchestrator** is a powerful tool that automates your entire local development setup.

When you run `deno task dev`, the orchestrator defined in the `start.ts` file at the `/template/evm-midnight/` example, and launches your complete environment in the correct order.

This includes:

- Starting local blockchains (EVM, Midnight, etc.).
- Deploying your smart contracts.
- Running essential services like a development database and the Batcher.

By handling all this infrastructure automatically, the orchestrator makes local development a simple, one-command process. Once the environment is ready, it starts the main **Effectstream Sync Service**, which begins syncing data and running your state machine.

```ts
const config = Value.Parse(OrchestratorConfig, {
  processes: {
    // Launch Dev DB & Collector
    [ComponentNames.EFFECTSTREAM_PGLITE]: true,
    [ComponentNames.COLLECTOR]: true,
  },

  processesToLaunch: [startEvm, startMidnight],
});
await start(config);
```

More about [Processes Orchestrator](../100-components/106-processes.md)

## Grammar

The Grammar is the language of your dApp, connecting on-chain inputs to your State Machine. Effectstream v2 uses a structured **JSON array format** for all inputs, like `["attack", 1, 42]`.

The first element (`"attack"`) is the **prefix**. It acts as a command that the engine uses to route the input to the correct State Transition Function (STF). You define these rules in a `grammar.ts` file, specifying the name and data type for each argument. This provides automatic validation and type-safety for all user actions.

Example grammar definition:

```ts
export const grammar = {
  attack: [
    ["playerId", Type.Integer()],
    ["moveId", Type.Integer()],
  ],

  // Auto-generate other primitives
  ...Object.fromEntries(
    Object.entries(mapPrimitivesToGrammar(localhostConfig.primitives))
  ),
} as const satisfies GrammarDefinition;
```

More about [Grammar](../100-components/111-grammar.md)

## Next Steps: Dive Deeper into Effectstream

Congratulations! You've successfully set up a Effectstream project and have a foundational understanding of its core components. You've seen how the **Orchestrator** sets up your environment, how the **Sync Service** and **Grammar** process on-chain data, and how the **State Machine** executes your application's logic.

Now you're ready to explore the full power and flexibility of the engine. Use the following sections as a guide to dive deeper into the topics that interest you most.

### Core Components Deep Dive

You've touched on the basics, now master the details of the components you've already used:

- [State Machine](../100-components/102-state-machine.md): Learn advanced techniques for managing your dApp's logic.
- [Sync Service & Chain Config](../100-components/101-sync-service.md): Uncover the full potential of multi-chain data aggregation.
- [Contracts & The Effectstream L2 Contract](../100-components/105-contracts.md): Explore the specifics of the `Effectstream L2Contract` and other provided contracts.
- [Grammar](../100-components/111-grammar.md): Master the language of your dApp for complex interactions.
- [Frontend (dApp)](../100-components/115-frontend.md): Discover best practices for building user interfaces.

### Advanced Features & Services

Level up your application with Effectstream's powerful, built-in services:

- [**Batcher**](../100-components/108-batcher/1200-overview.md): Offer a gasless, cross-chain experience to your users.
- [**Accounts**](../100-components/116-accounts.md): Implement a flexible L2 account system that goes beyond simple wallets.
- [**Randomness**](../100-components/113-randomness.md): Learn how to use Effectstream's deterministic randomness for fair and replayable game mechanics.
- [**Database**](../100-components/109-database.md): Take full control of your application's data with custom tables and queries.
- [**Achievements**](../100-components/114-achievements.md): Integrate a standardized achievement system into your dApp.

### Multi-Chain Development

Effectstream is a multi-chain engine at its core. Learn how to connect to and leverage the unique capabilities of different blockchains:

- [EVM Chains (Ethereum, Arbitrum, etc.)](../200-chains/201-evm.md)
- [Midnight (Zero-Knowledge)](../200-chains/202-midnight.md)
- [Cardano](../200-chains/203-cardano.md)
- [Avail (Data Availability)](../200-chains/204-avail.md)

### Deployment and Lifecycle

Ready to go live? These guides cover the final steps in your development journey:

- [Deploying Your Game to Production](../300-deployment/301-deploy-game.md)
- [Versioning and Upgrading Your dApp](../300-deployment/302-versioning.md)

### Standards and Interoperability (PRCs)

Paima Request for Comments (PRCs) are open standards that enable interoperability between dApps in the Effectstream ecosystem. Implementing these standards can enhance composability and user engagement.

- **PRC-1**: A standard for in-game achievements.
- **PRC-2**: The "Hololocker" for projecting L1 NFTs into your dApp without bridging.
- **PRC-3 & PRC-5**: "Inverse Projection" standards for representing in-game assets as tradable NFTs and tokens on major L1s.

### See it all in Action: The Tarochi Example

To see how all these components come together to build a complete, complex, and successful on-chain game, dive into our comprehensive tutorial based on a real-world example.

- [**Building Tarochi with Effectstream**](../1100-example-tarochi/1100-example-tarochi.md)

### Contributing to Effectstream

For advanced developers interested in the engine's internals or looking to contribute:

- [Effectstream Packages (NPM & JSR)](../1000-effectstream-engine/1000-effectstream-engine.md)
- [How to Contribute](../1000-effectstream-engine/1100-contributions.md)
