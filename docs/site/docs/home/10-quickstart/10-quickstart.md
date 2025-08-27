---
sidebar_position: 10
slug: /quick-start
---

# Quick Start

> Linux and Macos are supported. Windows WSL is experimental.

First clone the repository and copy the `/example-project` folder.  
This will give us a working template.
```sh
git clone git@github.com:PaimaStudios/paima-engine.git
git checkout v-next
cd paima-engine/templates/evm-midnight
```

```sh
# Check for external dependencies
./check.sh

# Install packages
deno install --allow-scripts && ./patch.sh

# Compile contracts
deno task build:evm
deno task build:midnight

# Launch Paima Engine Node
deno task dev
```

Now you should see the dApp running in your browser!

### Terminal
<iframe src="https://drive.google.com/file/d/1vLHmm9HrPrKiIHJlnnX3aopeX0J-A9Oz/preview" width="640" height="480" allow="autoplay"></iframe>

### Browser
<iframe src="https://drive.google.com/file/d/1hDh5PkKQdDx8UXnBsS1clypvXF14Msvm/preview" width="640" height="480" allow="autoplay"></iframe>

Once you have the template up and running, there are different parts you can modify or extend.
* **State Machine**: Logic and rules for events.
* **Front End**: User side App.
* **Chain Config**: Connect different chains.
* **Process Orchestrator**: Decide what processes to start and run for development.
* **Contracts & Paima-L2**: Deploy and connect different contracts.
* **Grammar**: Define Paima-L2 Contract valid Inputs

More [Components](../100-components/100-components.md) 

## State Machine

This is the main component where logic and rules are processed.
This runs in the `Paima Engine Node`

In the examples the file is named `state-machine.ts` and contains `state-transition` functions that are executed each time the corresponding `event prefix` defined in the `grammar` is called. E.g., Each time a ERC721 Token es Minted, or a [PaimaL2 Event](../100-components/104-paima-l2-contract.md) is sent.

```ts
stm.addStateTransition(
  "transfer",
  function* (data) {
    const { to, from, value } = data.parsedInput.payload;
    yield* World.resolve(insertStateMachineInput, {
      inputs: `transfer ${value} from ${from} to ${to}`,
      block_height: data.blockHeight,
    });
    return;
  },
);
```

> IMPORTANT These functions MUST be deterministic. Therefore they should not use `Math.random()`, `new Date()`, do external API calls, or any function that might give different results on different times or machines.    

More about the [State Machine](../100-components/102-state-machine.md)

## Frontend (dApp)

The `example-project` comes with a folder called `frontend` that is Web Application.

### Frontend Writes
This web application, game or other technologies, to interact with Paima Engine, only write to the blockchain:

* **Direct Contract Interaction**. E.g., Call `transfer` on a `ERC20` contract. Wallets can be integrated to make these calls.
* **Direct Paima L2 Contract Interaction**: `Submit Input` method. This allows to pass a custom message to the engine. Wallets can be integrated to make these calls.  
* **Batcher Paima L2 Contract Interaction**: Interact with a Paima L2 Contract, but through a HTTP call. This service is who converts and validates the call and writes to the Paima L2 Contract.

### Frontend Reads
* **Reads from Blockchain** Some blockchains expose APIs you can read to get the state or other information.
* **Reads from Paima Engine API** Paima Engine Provides son Endpoints you can consume
* **Reads from Custom API** You can setup your own custom endpoints 

## Chain Config

Paima-Engine requires to setup the:
* Chains to monitor
* Chains to sync 
* Contracts events to listen

This is a minimal config to track a EVM Chain, and a ERC721 contract on this chain. Each time the `Transfer` event get called, Paima-Engine will execute the `transfer-assets` function and also automatically track the current ownership of Tokens. 

```ts
export const localhostConfig = new ConfigBuilder()
  .setNamespace(builder => builder.setSecurityNamespace("my-app-track-erc721"))
  .buildNetworks(builder => 
    builder.addViemNetwork({
        ...hardhat,
        name: "evmMain",
    })
  )
  .buildSyncProtocols(builder =>
   builder.addMain(
        (networks) => networks.evmMain, 
        (network, deployments) => ({
            name: "mainEvmRPC",
            type: ConfigSyncProtocolType.EVM_RPC_MAIN,
            chainUri: network.rpcUrls.default.http[0],
            startBlockHeight: 1,
            pollingInterval: 500,
        })
    )
  )
  .buildPrimitives(builder =>
    builder.addPrimitive(
        (syncProtocols) => syncProtocols.mainEvmRPC,
        (network, deployments, syncProtocol) => ({
          name: "Track-ERC721",
          type: ConfigPrimitiveType.EvmRpcERC721,
          startBlockHeight: 0,
          contractAddress:
            contractAddressesEvmMain().chain31337["Erc721DevModule#Erc721Dev"],
          abi: getEvmEvent(
            erc721dev.abi,
            "Transfer(address,address,uint256)",
          ),
          scheduledPrefix: "transfer-assets",
        })
    )
  )
  .build();
```
More about [Sync & Chain Config](../100-components/101-sync-service.md)

## Contracts & Paima-L2

Paima can work with any contract deployed on the different chains.
For each chain, it adapts how and what information it extracts.
Also, Paima-Engine provides some contracts ready to use, that can provide extra functionalities.

For example we can deploy this contract:
```ts
pragma solidity ^0.8.20;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Erc20Dev is ERC20 {
    constructor() ERC20("MY ERC Token", "MYERC") {}

    function mint(address _to, uint256 _amount) external {
        _mint(_to, _amount);
    }
}
```
And each time the mint or transfer is called the `event` defined in @openzeppelin's ERC20 defined event `Transfer(from, to, value)` will be called, and this can be captured and processed in the `state machine`.

More about [Contracts](../100-components/105-contracts.md)

## Process Orchestrator

Paima Engine, provides and allows manage common processes for the development of dApps.

Connecting everything yourself to testnets, contract deployment, getting continual funds for gas payments is possible, but it's slow and complex process - so Paima Engine provides with tools to do these common tasks and allow local development.

This is main entry point, once the internal and custom processes are launched, they main `sync` process is launched. 

```ts
const config = Value.Parse(OrchestratorConfig, {
    processes: {
        // Launch Dev DB & Collector
        [ComponentNames.PAIMA_PGLITE]: true,
        [ComponentNames.COLLECTOR]: true,
    },

    processesToLaunch: [
        startEvm,
        startMidnight,
    ],
});
await start(config);

```
More About [Processes and Startup](../100-components/106-processes.md)

## Grammar 

Grammar connects the `Paima-L2` contract and the `State-Machine`
Allowing to convert and parse Paima-L2 inputs, and call the correct `State-Machine` `Transfer-Function`

```ts
export const grammar = {
  attack: [
    ["playerId", Type.Integer()],
    ["moveId", Type.Integer()],
  ],
  
  // Auto-generate other primitives, but exclude midnight (we define it explicitly above)
  ...Object.fromEntries(
    Object.entries(mapPrimitivesToGrammar(localhostConfig.primitives))
  ),
} as const satisfies GrammarDefinition;
```

More About [Grammar](../100-components/111-grammar.md)