#  EVM-Midnight Template

* Location: `/templates/evm-midnight`
* Highlights: EVM & Midnight Interoperability. Web Application to create ERC721 Tokens and add metadata though a Midnight Contract.

The `evm-midnight` template is a powerful starting point that demonstrates one of Paima Engine's core strengths: **multi-chain interoperability**. It showcases a complete, end-to-end dApp that seamlessly combines a public, asset-focused EVM chain with a private, computation-focused ZK chain (Midnight).

## Core Concept: Extending NFTs with Private Metadata

The goal of this template is to create a dApp where users can own a standard **ERC721 NFT** on an EVM chain, but then use the privacy features of **Midnight** to add or update secret metadata associated with that NFT.

*   The ownership of the NFT is public and managed by the EVM contract.
*   The special properties or "enchantments" of the NFT are managed privately on Midnight. Only the owner can execute the ZK transaction to add a property, but the *result* (the new property) is made public on Midnight's ledger for the Paima Engine to see.

This pattern is a blueprint for many real-world applications, such as:
*   **Private Stats**: An NFT character's stats (e.g., strength, intelligence) could be private until a battle.
*   **Sealed-Bid Auctions**: Bids for an NFT could be kept private until the auction ends.
*   **Verifiable Randomness**: An NFT could be associated with a random attribute that is generated privately and then revealed.

## Quick Start

```sh
# Check for external dependencies
./../check.sh

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

## The Components in Action

When you run `deno task dev` for this template, the [Process Orchestrator](../100-components/106-processes.md) sets up a complete local environment:
*   **Hardhat EVM Node**: A local EVM blockchain.
*   **Midnight Stack**: The full local Midnight environment, including the node, indexer, and proof server.
*   **Paima Services**: The development database, log collector, TUI, and the Paima Explorer.
*   **Paima Engine**: Node to sync the chains.
*   **Frontend**: A simple web interface to interact with the contracts.

## On-Chain Logic

### 1. The EVM Contract (`Erc721Dev.sol`)
The EVM side is a standard, minimal ERC721 contract. Its only job is to manage the minting and transferring of NFTs. Paima Engine will monitor its `Transfer` event to track ownership.

```solidity
pragma solidity ^0.8.20;
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
contract Erc721Dev is ERC721 {
    constructor() ERC721("Mock ERC721", "MERC") {}
    function mint(address _to, uint256 _tokenId) external {
        _mint(_to, _tokenId);
    }
}
```

### 2. The Midnight Contract

The Midnight contract is where the private logic lives. Its `updateAsset` circuit accepts four private inputs: the EVM contract address, the NFT's token ID, and a key-value pair for the new property.

When a user executes this circuit, their private inputs are used to generate a ZK proof. The transaction updates the contract's public `ledger`, revealing the new property without disclosing who added it or what other private data was used in the computation.

```ts
pragma language_version 0.17;

import CompactStandardLibrary;

// These are the public state variables Paima will monitor.
export ledger contract_address: Bytes<64>;
export ledger token_id: Bytes<64>;
export ledger property_name: Bytes<32>;
export ledger value: Bytes<32>;

// This is the private state transition.
export circuit updateAsset(
  contract_address_: Bytes<64>,
  token_id_: Bytes<64>,
  property_name_: Bytes<32>,
  value_: Bytes<32>,
): [] {
  // The 'disclose' keyword makes the private input public
  // by writing it to the corresponding ledger variable.
  contract_address = disclose(contract_address_);
  token_id = disclose(token_id_);
  property_name = disclose(property_name_);
  value = disclose(value_);
}
```

## The State Machine (`state-machine.ts`)

The State Machine has two key State Transition Functions (STFs) that listen for events from these two chains.

### 1. `transfer-assets` STF (Listening to EVM)
This STF is triggered whenever an ERC721 `Transfer` event occurs on the EVM chain. Its job is simple: to keep track of the current owner of each NFT.

```ts
stm.addStateTransition(
  "transfer-assets",
  function* (data) {
    // Extract payload from the Transfer(from, to, tokenId) event
    const { to, tokenId } = data.parsedInput.payload;
    const contract_address = "0x1234"; // The address of the deployed ERC721 contract

    // Update the database to record the new owner of the NFT.
    yield* World.resolve(insertEvmMidnight, {
      contract_address,
      token_id: tokenId,
      owner: to,
      block_height: data.blockHeight,
    });
  },
);
```

### 2. `midnightContractState` STF (Listening to Midnight)
This STF is triggered whenever the public `ledger` of the Midnight contract changes. Its job is to take the new metadata revealed by the ZK transaction and link it to the corresponding NFT in the database.

```ts
stm.addStateTransition(
  "midnightContractState",
  function* (data) {
    // 1. Decode the public ledger state from the raw Midnight payload.
    const contract_address = decodeString(...);
    const token_id = decodeString(...);
    const property_name = decodeString(...);
    const value = decodeString(...);

    // 2. Check if we already know about this NFT from the EVM.
    //    If not, create a record for it.
    const [nftRecord] = yield* World.resolve(getEvmMidnightByTokenId, {
      contract_address,
      token_id,
    });
    if (!nftRecord) {
      yield* World.resolve(insertEvmMidnight, { /* ... */ });
    }

    // 3. Insert the new metadata property into the database,
    //    linking it to the NFT.
    yield* World.resolve(insertEvmMidnightProperty, {
      contract_address,
      token_id,
      property_name,
      value,
      block_height: data.blockHeight,
    });
  },
);
```

By combining these two STFs, the Paima Engine builds a unified view of the dApp's state, merging public ownership data from EVM with privately-added metadata from Midnight.
