// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AnnotatedMintNft as BaseAnnotatedMintNft} from "@effectstream/evm-contracts/src/contracts/AnnotatedMintNft.sol";

/**
 * @title CharacterNft
 * @dev The character ERC721 for the NFT level-up game.
 *
 * Re-export of the base Effectstream `AnnotatedMintNft`. Each minted token
 * carries an `initialData` string (the character "type": air/earth/fire/water/
 * ether) emitted in the `Minted(tokenId, initialData)` event. The sync node
 * watches this contract's `Transfer` events through the built-in ERC721
 * primitive to track ownership; the character `type` is delivered to the node
 * out-of-band via the `nftMint` L2 action (see packages/node/grammar.ts).
 */
contract CharacterNft is BaseAnnotatedMintNft {
    constructor(
        string memory name,
        string memory symbol,
        uint256 _maxSupply,
        address initialOwner
    ) BaseAnnotatedMintNft(name, symbol, _maxSupply, initialOwner) {}
}
