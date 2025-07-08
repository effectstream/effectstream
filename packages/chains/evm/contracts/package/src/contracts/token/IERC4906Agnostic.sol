// SPDX-License-Identifier: MIT
// Forked from OpenZeppelin Contracts (last updated v5.0.0) (interfaces/IERC4906.sol)

pragma solidity ^0.8.13;

/// @title Agnostic Metadata Update Extension
interface IERC4906Agnostic {
    /// @dev This event emits when the metadata of a token is changed.
    /// So that the third-party platforms such as NFT market could
    /// timely update the images and related attributes of the token.
    event MetadataUpdate(uint256 _tokenId);

    /// @dev This event emits when the metadata of a range of tokens is changed.
    /// So that the third-party platforms such as NFT market could
    /// timely update the images and related attributes of the tokens.
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);
}
