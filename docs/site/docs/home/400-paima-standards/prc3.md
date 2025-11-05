# PRC-3: Paima Inverse Projection Interface (NFTs)

*   **Core Idea**: A standard for representing in-game L2 assets as fully-tradable ERC721 NFTs on a more liquid L1 chain.
*   **Problem Solved**: Assets that only exist within a game's L2 state are illiquid and cannot be traded on major NFT marketplaces like OpenSea. PRC-3 allows these assets to be "projected" outwards, creating an L1 NFT that acts as a "claim" on the L2 asset, with its metadata being served directly and dynamically from the Effectstream node.
*   **How it Works (High Level)**: An `IInverseProjectedNft` contract is deployed on an L1. When a user wants to sell an L2 asset, an NFT is minted on the L1. The `tokenURI` of this NFT points to the Effectstream's API. When a marketplace queries this URI, the Paima node serves the current, up-to-date metadata for the in-game asset. When the NFT is burned on the L1, the in-game asset is released or transferred on the L2.
*   **Key Components**:
    *   **`IInverseProjectedNft` (Solidity)**: A modified ERC721 interface.
    *   **Dynamic `tokenURI`**: The metadata URI is not a static link to IPFS but an API call to a Paima node.
    *   **Public `mint()` function**: Allows for the creation of L1 NFTs that represent L2 state.
    *   **URI Overrides**: The `tokenURI` function has overloads, allowing users to specify their own trusted Paima node for metadata, ensuring decentralization.