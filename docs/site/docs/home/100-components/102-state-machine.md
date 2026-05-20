# State Machine

## Overview 

A State Machine (SM) is the core of your EffectStream application, defining its logic and rules. Let's break down the concept:

1. It has a State, which is the complete record of the EffectStream Node at any given moment (e.g., user assets, statuses, etc.), stored in a database.
2. The SM is defined by a series of State Transition Functions (STFs). These are the functions that change the State in response to an Input.
3. The Inputs are blockchain events that your application is configured to monitor. The STFs process these on-chain events and transform them into updates for your application's state.
4. The SM is deterministic, meaning multiple instances of a EffectStream Node processing the same inputs in the same order will always generate the exact same final State.
5. The entire process runs within the EffectStream Node.

```
                     State Machine
Block Chain -> STF-1 (e.g., handle mint)    -> Application Data
Events         STF-2 (e.g., handle transfer)   (database)
               STF-N (...)
```

Let's start with a practical example where calls to a `EffectStream L2` contract are converted into actions.

For example, this STF:
```ts
stm.addStateTransition(
  "create",
  function* (data) {
    const { game_id } = data.parsedInput.payload;
    yield* World.resolve(create_game, {
      game_id: game_id,
      block_height: data.blockHeight,
    });
    return;
  },
);
```
If the contract [EffectStream L2 Event](../100-components/104-l2-contract.md) function `submitGameInput` is called with payload `["create", "0x1234"]`, this creates a row in your `games` table, with id = `0x1234`

Now your application can read the database and use the created "game" from the table.

## Example

> We will be using `/templates/evm-midnight-v2/` as example for the following definitions.


In the example template the state-machine file is named `./packages/client/node/src/state-machine.ts` and contains `state-transition functions` or "STF" that are executed each time the corresponding [event prefix](../100-components/101-sync-service.md) defined in the [grammar](../100-components/111-grammar.md) is called. 

For example: each time a `ERC721 Token es Minted`, or a [EffectStream L2 Event](../100-components/104-l2-contract.md) is sent a `STF` is executed, if defined.

In this example, the prefix `transfer_erc721` we execute a write into the [database](../100-components/109-database.md) calling `insertStateMachineInput`.
This function is called when an ERC721 token is either minted or transferred.

```ts
stm.addStateTransition(
  "transfer_erc721",
  function* (data) {
    const { to, from, tokenId } = data.parsedInput.payload;
    yield* World.resolve(insertStateMachineInput, {
      message: `transfer token=${tokenId} from wallet=${from} to wallet=${to}`,
      block_height: data.blockHeight,
    });
    return;
  },
);
```

## Determinism

**IMPORTANT** 
These STF functions MUST be deterministic. 

EffectStream applications are designed to be Replicated State Machines, which means that anyone running a EffectStream node can independently process all the inputs in the exact same order and arrive at the identical, correct game state. This deterministic nature is what makes decentralized apps possible without a central server.

> Therefore STF MUST NOT use `Math.random()`, `new Date()`, do external API calls, or any function that might give different results on different times or machines.   

## Adding a new STF

The STF will be executed each time a contract event is executed. So we need to define/capture:
* Contract
* Monitor/Sync
* Grammar
* STF

To do so, we can follow these steps:

1. Add your [contract](../100-components/105-contracts.md)
    
    Let's create and add a ERC20 Fungible Solidity contract for [EVM](../200-chains/201-evm.md)
    ```ts
    // SPDX-License-Identifier: MIT

    pragma solidity ^0.8.20;

    import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

    contract Erc20Dev is ERC20 {
        constructor() ERC20("Mock ERC20", "MERC") {}

        function mint(address _to, uint256 _amount) external {
            _mint(_to, _amount);
        }
    }
    ```
    More instructions about [contracts options](../100-components/105-contracts.md).

2. Add the [scheduled prefix](../100-components/101-sync-service.md) that will be called.

    ```ts
    builder.addPrimitive(
          (syncProtocols) => syncProtocols.parallelEvmRPC_fast,
          (network, deployments, syncProtocol) => ({
            name: "My_ERC20_Token",
            type: ConfigPrimitiveType.EvmRpcERC20,
            startBlockHeight: 0,
            contractAddress: contractAddressesEvmMain()
              .chain31337["EffectStreamErc20DevModule#EffectStreamErc20Dev"],
            abi: getEvmEvent(erc20dev.abi, "Transfer(address,address,uint256)"),
            scheduledPrefix: 'transfer_merc', // <- SCHEDULED PREFIX 
          }),
        )
    ```
    This will allow to track the event.  
    More instruction about [scheduled prefixes and sync-service options](../100-components/101-sync-service.md)


3. Add the corresponding [grammar](./111-grammar.md)

    In the `grammar.ts` file you can add custom grammar parsers
    ```ts
    export const grammar = {
    ...
    transfer_merc: [
        [
          "payload",
          Type.Object({
            to: Type.String(),
            from: Type.String(),
            value: Type.String(),
          }),
        ],
      ],
    ...
    ```
    This will parse the information provided in the `My_ERC20_Token` primitive, and try to parse the function provided in the event `Transfer(address,address,uint256)`.
    If successful, the STF named `transfer_merc` will be executed.

4. STF Implementation

    The last phase is setting up the STF itself.
    We will implement a function to keep the historic record of transfers and mints.
    ```ts
    stm.addStateTransition(
      "transfer_merc",
      function* (data) {
        const { to, from, value } = data.parsedInput.payload;
        yield* World.resolve(insertIntoHistory, {
          to_wallet: to, 
          from_wallet: from,
          amount: value
          block_height: data.blockHeight,
        });
        return;
      },
    );
    ```

    This function will run each time there is a `mint` or `transfer` in the ERC20 contract.

    More about the  `yield* World.resolve(...)` and `function*` in the **STF Coroutines** section below.

5. Database Methods (Optional)

    For data management you can setup your custom tables and function. To do so, first update the migration file `first.sql` and add a table for the historic records:

    ```sql
    CREATE TABLE erc20_history (
      id SERIAL PRIMARY KEY,
      block_height INTEGER NOT NULL,
      to_wallet TEXT NOT NULL,
      from_wallet TEXT NOT NULL,
      amount INTEGER NOT NULL
    );
    ```

    edit `sm_example.sql` and add a query to insert
    ```sql
    /* @name insertIntoHistory */
    INSERT INTO erc20_history
    (id, block_height, to_wallet, from_wallet, amount)
    VALUES
    (:id!, :block_height!, :to_wallet!, :from_wallet!, :amount!)
    ;
    ```

    and compile your queries with 
    ```sh
    bun run --cwd packages/database pgtyped:update
    ```
    This will create a safe typescript function to insert into the database.
    More information about [databases](../100-components/109-database.md)  



**Now your STF is ready to be used!**

Now just call the deployed MERC contract.  
Each change will be stored in the database.

For example, if the contract was called 4 times: 

| id | block_height | to_wallet | from_wallet | amount | 
| --- | --- | --- | --- | --- | 
| 1   | 100 | 0x1234 | 0x0 | 10 |
| 2   | 330 | 0xabcd | 0x5999 | 99 |
| 3   | 499 | 0xcccc | 0x0 | 30 | 
| 4   | 609 | 0x1234 | 0xcccc | 40 |


## STF Coroutines and the `World` Effect System

A State Transition Function (STF) has a unique challenge: it must be a pure, deterministic function, but it also needs to interact with the "outside world" by reading from and writing to the database.

To solve this, EffectStream STFs are written as Coroutines (specifically, JavaScript Generator Functions) instead of standard async functions. This allows the STF to pause its execution and request that the EffectStream perform a side effect (like a database query) on its behalf. This pattern ensures that all interactions with the outside world are controlled, deterministic, and replayable.

Instead of await, you will use the yield* keyword to perform these controlled, asynchronous operations.

### STF Function Definition
Every STF is defined as a generator function, which is denoted by the asterisk (*) after the function keyword. It receives a single data object as its argument.

```ts
// Note the `*` which defines this as a generator function
stm.addStateTransition(
  "my_action",
  function* (data) {
    // STF logic goes here...
  }
);
```

The `data` object contains all the context for the current input being processed:

| Field | Type | Description |
| :--- | :--- | :--- |
| `blockHeight` | `EffectStreamBlockNumber` | The EffectStream L2 block number for this input. |
| `blockTimestamp` | `TimestampMs` | The EffectStream L2 block timestamp. |
| `conciseInput` | `string` | The raw, unparsed input string. Useful for debugging. |
| `accountId` | `number \| undefined` | The EffectStream Account ID the signer's wallet belongs to, if any. |
| `signerAddress` | `WalletAddress \| undefined`| The on-chain wallet address that signed/initiated the transaction. |
| `randomGenerator` | `Prando` | A deterministic, seeded pseudo-random number generator. |
| `parsedInput` | `GrammarType` | The parsed and type-safe input, according to your defined grammar. |

### The `World` Object: Performing Side Effects

To perform any side effect, you must use the `World` object. It is the only safe and permitted way for your STF to interact with the database or run other asynchronous logic.

#### `World.resolve(query, input)`
This is the primary way to interact with the database. It executes a type-safe database query that you have defined.

*   **`query`**: The pgtyped-generated query function you want to run.
*   **`input`**: The parameters for the query.

```ts
// From our previous example, creating a new game row in the database.
yield* World.resolve(create_game, {
  game_id: game_id,
  block_height: data.blockHeight,
});
```

#### `World.promise(promise)`
This function allows you to execute a custom `Promise`. However, this comes with a critical rule.

> **WARNING: `World.promise` MUST BE DETERMINISTIC**
> Any promise passed to `World.promise` **must** be 100% deterministic. It must always return the exact same result given the same input, no matter when or where it is run.
>
> **DO NOT USE:**
> *   `fetch` or any network requests.
> *   `new Date()` or any access to the system clock.
> *   Reading from the file system.
> *   `Math.random()`.
>
> Using a non-deterministic promise here will break your state machine and cause nodes to fall out of sync. This function is intended for complex, pure computations that are CPU-intensive and benefit from being run asynchronously without blocking.

**Safe Example:** A complex, pure calculation.
```ts
async function complexDeterministicCalculation(a: number, b: number): Promise<number> {
  // A long, CPU-intensive but pure calculation
  await new Promise((resolve) => setTimeout(resolve, 100)); // Simulates heavy work
  return (a + b) * (a - b); // Always the same result for the same a and b
}

// Inside an STF:
const result = yield* World.promise(complexDeterministicCalculation(10, 5));
// result will always be 75
```