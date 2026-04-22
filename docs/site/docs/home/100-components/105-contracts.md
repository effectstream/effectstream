# Contracts

Effectstream is designed to be chain-agnostic and contract-agnostic. It can work with virtually any smart contract deployed on its supported chains by monitoring the **events** they emit or the **public state** they expose.

The engine's Sync Service listens for these on-chain occurrences and transforms them into inputs for your [State Machine](./102-state-machine.md).

## Working with Your Own Smart Contracts

You can write and deploy custom contracts to handle specific on-chain logic, such as minting NFTs, transferring tokens, or managing registries. Effectstream will then observe these contracts as a data source.

### EVM Contracts (Solidity)

You can deploy any standard EVM smart contract. The key is that your contract must emit events for any state change you want Effectstream to react to.

For example, here is a simple ERC20 token contract. Effectstream doesn't interact with the `mint` function directly; instead, it listens for the `Transfer` event that the standard `_mint` function emits.

```solidity
// File: /contracts/evm/src/Erc20Dev.sol
// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// A standard ERC20 contract with a public mint function.
contract Erc20Dev is ERC20 {
    constructor() ERC20("Mock ERC20", "MERC") {}

    function mint(address _to, uint256 _amount) external {
        // This internal function emits the standard `Transfer` event.
        // Effectstream will listen for this event.
        _mint(_to, _amount);
    }
}
```

### ZK Contracts (Midnight)

Effectstream can also monitor Zero-Knowledge contracts. On Midnight, instead of events, contracts expose a public **`ledger` state**. Effectstream primitives are configured to watch for changes to this public state.

This example shows a simple counter contract. The `increment` circuit is a private state transition, but its effect is made visible by updating the public `round` ledger.

```rust
// File: /contracts/midnight/src/main.rs
pragma language_version 0.16;

import CompactStandardLibrary;

// This is the public state that Effectstream will monitor.
export ledger round: Counter;

// This is a state transition function (a "circuit").
// When executed, it modifies the public `round` state.
export circuit increment(): [] {
  round.increment(1);
}
```

## Compiling and Deploying Contracts

The Effectstream templates come with pre-configured scripts to compile your smart contracts and generate the necessary artifacts (like ABIs).

You can compile all contracts in your project with the following commands:
```sh
# Compile EVM contracts (Solidity)
deno task build:evm

# Compile Midnight contracts
deno task build:midnight
```
The templates also include scripts for deploying these contracts to local development chains or public testnets/mainnets.

## The `EffectstreamL2Contract`

While Effectstream can listen to any contract, it also provides a specialized contract called `EffectstreamL2Contract`. This contract serves as a highly efficient, generic "mailbox" for submitting game-specific inputs directly to the state machine.

Instead of defining dozens of specific functions on-chain (e.g., `attack(uint monsterId)`, `useItem(uint itemId)`), you send a single transaction to the `EffectstreamL2Contract`'s `submitInput` function with a concise, string-based payload.

**Example:**
*   **Without L2 Contract:** `myGameContract.attack(123)`
*   **With L2 Contract:** `effectstreamL2Contract.submitInput("attack|123")`

This approach has significant advantages:
*   **Gas Efficiency**: It reduces on-chain logic to a minimum, saving gas.
*   **Flexibility**: You can add new game actions without needing to deploy a new contract.
*   **Chain Abstraction**: It is the entry point for the **Batcher**, which allows users to submit inputs from any chain, often without paying gas fees themselves.

More in the [Effectstream L2 Contract Section](./104-l2-contract.md)

### Effectstream-Provided Contracts
The `@effectstream/evm-contracts` package includes a variety of useful contracts, including implementations of common standards and the core `EffectstreamL2Contract`.

| Contract | Description |
| :--- | :--- |
| **`EffectstreamL2Contract`** | The core contract for submitting game inputs. |
| `erc20`, `erc721` | Standard OpenZeppelin implementations. |
| `Erc20Dev`, `Erc721Dev`| Simple mintable versions for development and testing. |
| *Interfaces* | `IERC20`, `IERC721`, etc., for interacting with other contracts. |

### Connecting Contracts to the State Machine

Once your contract is compiled and deployed, the final step is to tell the **Sync Service** to monitor it. This is done by adding a **Primitive** to your chain configuration. The primitive specifies the contract's address, the event to listen for (via its ABI), and the `scheduledPrefix` that will trigger your STF.

```ts
// In your chain config file...
.buildPrimitives(builder =>
    builder.addPrimitive(
        (syncProtocols) => syncProtocols.mainEvmRPC,
        (network, deployments, syncProtocol) => ({
          name: "My_ERC20_Token",
          type: ConfigPrimitiveType.EvmRpcERC20,
          contractAddress: "0x...", // The address of your deployed Erc20Dev contract
          abi: getEvmEvent(
            erc20dev.abi, // The ABI from your compiled contract
            "Transfer(address,address,uint256)" // The specific event signature
          ),
          scheduledPrefix: 'transfer_merc', // Triggers the 'transfer_merc' STF
        })
    )
)
```

## Effectstream-Provided EVM Contracts

The `@effectstream/evm-contracts` package ships with a suite of pre-built, audited smart contracts and libraries to accelerate your development. These can be used directly in your project.

#### Core Effectstream Contracts
This is the most important contract for interacting with the Effectstream's state machine.

| Contract | Description |
| :--- | :--- |
| **`EffectstreamL2Contract`** | The central "mailbox" for your application. This contract provides the `submitInput` function, which is the most gas-efficient and flexible way to send game moves and actions from the on-chain world to your state machine. It serves as the primary entry point for user interactions and the Batcher service. |

#### Standard Token Contracts
These are standard implementations of the most common token types, based on the battle-tested OpenZeppelin library.

| Contract | Description |
| :--- | :--- |
| **`ERC20`** | A standard implementation of the ERC20 fungible token standard. |
| **`ERC721`** | A standard implementation of the ERC721 non-fungible token (NFT) standard. |

#### Development & Testing Contracts
These are simplified, mintable versions of the standard contracts, designed to make local development, prototyping, and testing quick and easy.

| Contract | Description |
| :--- | :--- |
| **`Erc20Dev`** | A simple ERC20 contract that includes a public `mint(address, amount)` function, allowing you to easily create tokens for testing purposes. |
| **`Erc721Dev`** | A simple ERC721 contract with a public `mint(address)` function, allowing you to create NFTs on demand during development. |

### Standard Interfaces
Interfaces are crucial for interacting with any contract on the EVM, whether it's one you deployed or one belonging to another protocol. These allow your contracts to call functions on other contracts in a type-safe way.

| Interface | Description |
| :--- | :--- |
| **`IERC20`** | The interface for the ERC20 standard. Use this to interact with any fungible token. |
| **`IERC721`** | The interface for the ERC721 standard. Use this to interact with any NFT. |
| **`IERC20Metadata`** | An extension of `IERC20` that includes functions like `name()`, `symbol()`, and `decimals()`. |
| **`IERC721Metadata`** | An extension of `IERC721` that includes functions like `name()`, `symbol()`, and `tokenURI()`. |
| **`IERC165`** | The interface for EIP-165, which allows you to check if a contract supports a specific interface. |

### Utility Libraries
For more advanced Solidity development, the package also includes several of OpenZeppelin's low-level utility libraries.

| Library | Description |
| :--- | :--- |
| `Address` | A library with helper functions for the `address` type, like checking if an address is a contract. |
| `Strings` | A library for converting numbers to strings on-chain. |
| `Math` | A library providing safe math operations that prevent overflow and underflow. |
| `Context` | A base contract providing information about the context of a transaction, such as `msg.sender`. |