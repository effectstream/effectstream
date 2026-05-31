// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AnnotatedMintNft as BaseAnnotatedMintNft} from "@effectstream/evm-contracts/src/contracts/AnnotatedMintNft.sol";

/**
 * @title AnnotatedMintNft
 * @dev NFT contract with annotated minting functionality.
 * This is a re-export of the base Effectstream AnnotatedMintNft contract.
 * Used for both the Trading Cards "account" NFTs and the "trade" NFTs (two
 * separate deployments of the same contract — see ignition/modules/).
 */
contract AnnotatedMintNft is BaseAnnotatedMintNft {
    constructor(
        string memory name,
        string memory symbol,
        uint256 _maxSupply,
        address initialOwner
    ) BaseAnnotatedMintNft(name, symbol, _maxSupply, initialOwner) {}
}
