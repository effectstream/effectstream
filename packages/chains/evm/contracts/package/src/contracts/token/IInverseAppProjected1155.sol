// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {IInverseProjected1155} from "./IInverseProjected1155.sol";

/// @dev A Paima Inverse Projection ERC1155 token where initialization is handled by the app-layer.
/// A standard ERC1155 that can be freely minted and stores an unique `<minter, userTokenId>` pair (used in `tokenURI`) when minted.
interface IInverseAppProjected1155 is IInverseProjected1155 {
    /// @dev Emitted when `value` amount of globally-enforced `tokenId` in combination with an unique `<minter, userTokenId>` pair is minted.
    event Minted(
        uint256 indexed tokenId,
        address indexed minter,
        uint256 indexed userTokenId,
        uint256 value
    );

    /// @notice Returns the last nonce used (or 0 if the user has never minted)
    /// @dev Useful if you need to either needs to
    ///      1. Check if the nonce matches the expected value, or if more NFTs need to be minted
    ///      2. Use a nonce algorithm where the next nonce depends on the current nonce
    function currentNonce(address user) external view returns (uint256);

    /// @dev Mints `value` of a new token to the transaction sender.
    /// Increases the `currentTokenId`.
    /// Reverts if transaction sender is a smart contract that does not implement IERC1155Receiver-onERC1155Received.
    /// Emits the `Minted` event.
    /// @param value the amount of tokens to mint.
    /// @param data additional data to pass to the receiver contract.
    /// @param verificationData any additional data to verify the validity of the mint
    /// @return id of the minted token.
    function mint(
        uint256 value,
        bytes memory data,
        bytes memory verificationData
    ) external returns (uint256);

    /// @dev This works identically to the other function with an extra data parameter,
    ///      except this function just sets data to "".
    function mint(uint256 value, bytes memory data) external returns (uint256);
}
