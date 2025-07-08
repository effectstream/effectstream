// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {IInverseProjectedNft} from "./IInverseProjectedNft.sol";

/// @dev A Paima Inverse Projection NFT where initialization is handled by the app-layer.
/// A standard ERC721 that can be freely minted and stores an unique `<minter, userTokenId>` pair (used in tokenURI) when minted.
/// See PRC3 for more.
interface IInverseAppProjectedNft is IInverseProjectedNft {
    /// @dev Emitted when the globally-enforced tokenId in combination with an unique `<minter, userTokenId>` pair is minted.
    event Minted(uint256 indexed tokenId, address indexed minter, uint256 indexed userTokenId);

    /// @dev Mints a new token to address `_to`
    /// Increases the `totalSupply` and `currentTokenId`.
    /// Reverts if `_to` is a zero address or if it refers to smart contract but does not implement IERC721Receiver-onERC721Received.
    /// Emits the `Minted` event.
    /// @param _to where to send the NFT to
    /// @param _verificationData any additional data to verify the validity of the mint
    /// @param _data any additional data to pass to the receiver contract
    /// @return id of the minted token
    function mint(
        address _to,
        bytes memory _verificationData,
        bytes memory _data
    ) external returns (uint256);

    /// @dev Shorthand function that calls the `mint` function with empty `_data`.
    function mint(address _to, bytes memory _verificationData) external returns (uint256);

    /// @dev Shorthand function that calls the `mint` function with empty `_verificationData` and empty `_data`.
    function mint(address _to) external returns (uint256);

    /// @notice Returns the last nonce used (or 0 if the user has never minted)
    /// @dev Useful if you need to either needs to
    ///      1. Check if the nonce matches the expected value, or if more NFTs need to be minted
    ///      2. Use a nonce algorithm where the next nonce depends on the current nonce
    function currentNonce(address seller) external view returns (uint256);
}
