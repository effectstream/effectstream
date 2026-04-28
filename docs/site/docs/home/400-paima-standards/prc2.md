# PRC-2: Paima Hololocker Interface

*   **Core Idea**: A standard smart contract interface for non-custodially "projecting" L1 ERC721 NFTs into an L2 Paima dApp without traditional bridging.
*   **Problem Solved**: Bridging NFTs from a secure L1 to a game-specific L2 is often slow, expensive, and exposes users to significant security risks from bridge exploits. The Hololocker allows users to retain full ownership of their L1 assets while still being able to use them in-game.
*   **How it Works (High Level)**: A user locks their ERC721 token in the `Hololocker` smart contract on the L1. The EffectStream detects this `Lock` event and makes the asset available to the user within the L2 game state. To withdraw, the user must first `requestUnlock`, which initiates a time-delay. After the delay (based on the L1's finality time), they can call `withdraw` to get their NFT back.
*   **Key Components**:
    *   **`HololockerInterface` (Solidity)**: The standard interface that the contract must implement.
    *   **`lock()` function**: The function a user calls to deposit their NFT into the contract.
    *   **`requestUnlock()` function**: Initiates the time-locked withdrawal process.
    *   **`withdraw()` function**: The final function to retrieve the NFT from the contract after the time-lock has passed.
