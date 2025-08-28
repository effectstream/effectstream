# PRC-5: Paima Inverse Projection Interface for ERC1155

*   **Core Idea**: An adaptation of the PRC-3 Inverse Projection standard specifically for semi-fungible tokens, using the ERC1155 standard.
*   **Problem Solved**: PRC-3 is designed for unique, non-fungible assets. Many in-game items, like crafting materials, gold, or potions, are fungible or semi-fungible. PRC-5 provides a standard way to represent these L2 assets as tradable ERC1155 tokens on an L1.
*   **How it Works (High Level)**: The mechanism is nearly identical to PRC-3, but the L1 smart contract is an ERC1155-compliant contract. This means the minting process and metadata are designed to handle quantities. For example, a user can project 1000 units of in-game gold into a single ERC1155 token with a quantity of 1000 on the L1.
*   **Key Components**:
    *   **`IInverseProjected1155` (Solidity)**: A modified ERC1155 interface.
    *   **Amount Tracking**: The contract and metadata are designed to handle token quantities, a core feature of the ERC1155 standard.
    *   **Batch Operations**: Supports standard ERC1155 functions like `burnBatch`.
    *   **Partial Initialization Logic**: The specification accounts for scenarios where a user mints a different quantity on the L1 than what they locked on the L2.