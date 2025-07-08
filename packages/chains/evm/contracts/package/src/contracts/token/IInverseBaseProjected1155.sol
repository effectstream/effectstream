// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {IInverseProjected1155} from "./IInverseProjected1155.sol";

/// @dev A Paima Inverse Projection ERC1155 token where initialization is handled by the base-layer.
/// A standard ERC1155 that accepts calldata in the mint function for any initialization data needed in a Paima dApp.
interface IInverseBaseProjected1155 is IInverseProjected1155 {
    /// @dev Emitted when `value` amount of globally-enforced `tokenId` is minted, with `initialData` provided in the `mint` function parameters.
    event Minted(uint256 indexed tokenId, uint256 value, string initialData);

    /// @dev Mints `value` of a new token to transaction sender, passing `initialData` to be emitted in the event.
    /// Increases the `currentTokenId`.
    /// Reverts if transaction sender is a smart contract that does not implement IERC1155Receiver-onERC1155Received.
    /// Emits the `Minted` event.
    /// @param value the amount of tokens to mint.
    /// @param data additional data to pass to the receiver contract.
    /// @param initialData data that is emitted in the `Minted` event.
    /// @return id of the minted token.
    function mint(
        uint256 value,
        bytes memory data,
        string calldata initialData
    ) external returns (uint256);
}
