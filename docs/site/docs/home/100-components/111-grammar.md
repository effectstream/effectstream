# Grammar

The **Grammar** is the formal "language" of your EffectStream application. It acts as a crucial bridge, defining a strict, type-safe structure for all on-chain inputs and connecting them directly to your [State Machine](./102-state-machine.md).

Its primary responsibilities are:
*   **Defining Structure**: It specifies the exact format for every valid command your application can receive.
*   **Validation**: It ensures that incoming data is well-formed before it ever reaches your application logic.
*   **Parsing**: It transforms raw on-chain data into type-safe, structured JavaScript objects for your State Transition Functions (STFs).

EffectStream uses a structured **JSON array format** for all inputs.

## Defining Your Grammar 

See `templates/minimal/packages/node/grammar.ts` for a minimal example, or `templates/evm-midnight-v2/packages/node/grammar.ts` for a multi-chain one.

You define your application's grammar in a single `grammar.ts` file. This is a TypeScript object where each key represents a command's **prefix**, and the value defines the structure of its expected arguments.

The prefix is always the first element in an input's JSON array and is used by the engine to route the input to the correct grammar rule and, subsequently, the correct STF.

### Anatomy of a Grammar Rule

Let's look at a simple rule for an `attack` command.

```ts
import { Type } from "@sinclair/typebox";
import { type GrammarDefinition } from "@effectstream/concise";

export const grammar = {
  // The command's prefix is "attack"
  attack: [
    // This defines the expected arguments that follow the prefix.
    ["playerId", Type.Integer()],
    ["moveId", Type.Integer()],
  ],
  // ... other rules
} as const satisfies GrammarDefinition;
```

This rule defines that a valid `attack` input must be a JSON array structured like this: `["attack", <number>, <number>]`.

Each argument is defined as a tuple `[name, type]`:

| Element | Description |
| :--- | :--- |
| `name` (string) | The name of the argument. This becomes the key in the parsed object available in your STF. |
| `type` (TypeBox Schema) | A schema from **TypeBox** that defines the data type and constraints for the argument. The engine uses this to validate the input and provide type safety. |

## How Grammar Connects to the State Machine

The grammar is the central piece that links an on-chain event to your application logic. Here’s the flow:

1.  **On-Chain Input**: A transaction is sent to the `EffectstreamL2Contract` with a payload that is a JSON-stringified array, e.g., `"[\"attack\",1,42]"`.
2.  **Prefix Matching**: The EffectStream parses the JSON and inspects the first element (`"attack"`) to find the matching rule in your `grammar.ts` file.
3.  **Parsing & Validation**: It then uses the TypeBox schemas defined in that rule (`Type.Integer()`, `Type.Integer()`) to validate and parse the remaining elements (`1`, `42`).
4.  **STF Execution**: Finally, the engine calls the STF registered with the prefix `"attack"`, passing it a `data` object containing the fully typed and parsed input:
    ```ts
    // In your STF, data.parsedInput would look like this:
    {
        playerId: 1,
        moveId: 42
    }
    ```

## Built-in System Grammar (`&`)

EffectStream reserves the `&` prefix for a suite of powerful, built-in system commands. You do not need to define these in your grammar file; the engine handles them automatically.

#### Batched Inputs: `&B`
This command allows multiple user inputs to be bundled into a single on-chain transaction. This is the primary mechanism used by the **Batcher** service to provide a gas-efficient and cross-chain experience.

*   **Logical Structure**: `["&B", [input1, input2, ...]]`
*   **Parameters**: The second element is an array of other valid EffectStream inputs.
*   **Robustness**: If any individual input within the batch is malformed, the engine will skip it and continue processing the rest, preventing a single error from halting the entire batch.

### Account Management Commands
These commands provide a flexible L2 Account Abstraction system, allowing multiple wallets to control a single EffectStream account.

*   **`&createAccount`**: Creates a new EffectStream Account, with the sender becoming the primary wallet.
    *   **Structure**: `["&createAccount"]`
*   **`&linkAddress`**: Links a new wallet to an existing account, requiring signatures from both the primary and new wallets.
    *   **Structure**: `["&linkAddress", account_id, signature_from_primary, primary_address_type, new_address, signature_from_new_address, new_address_type, is_new_primary]`
*   **`&unlinkAddress`**: Removes a wallet from an account.
    *   **Structure**: `["&unlinkAddress", account_id, signature_from_primary, primary_address_type, target_address, target_address_type, new_primary_address, new_primary_address_type]`

## Creating Inputs on the Frontend

On the frontend, you simply construct a standard JavaScript array and then JSON-stringify it to create the payload for a transaction.

```ts
// 1. Create the move as a JavaScript array
const move = ["attack", 1, 42];

// 2. Stringify it to create the payload
const payload = JSON.stringify(move);

// 3. Submit the payload to the EffectstreamL2Contract
// (The frontend SDKs will handle this for you)
await effectstreamL2Contract.effectstreamSubmitGameInput(payload);
```