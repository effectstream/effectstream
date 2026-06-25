// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {InverseAppProjectedNft} from "@effectstream/evm-contracts/src/contracts/token/InverseAppProjectedNft.sol";

/// @dev ERC-721 minted to buyers when the admin finalises a preorder campaign.
/// PRC-3 inverse projection: the canonical item/metadata lives in the Effectstream
/// app (L2) and is served via `tokenURI` (`baseURI` -> sync node). Minting is
/// performed post-sale by the batcher's account (the admin-triggered distribution),
/// not by buyers.
contract PreorderItemNft is InverseAppProjectedNft {
    constructor(
        string memory name,
        string memory symbol,
        address owner
    ) InverseAppProjectedNft(name, symbol, owner) {}
}
