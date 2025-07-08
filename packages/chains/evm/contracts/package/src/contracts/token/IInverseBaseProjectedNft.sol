// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {IInverseProjectedNft} from "./IInverseProjectedNft.sol";

/// @dev A Paima Inverse Projection NFT where initialization is handled by the base-layer.
/// A standard ERC721 that accepts calldata in the mint function for any initialization data needed in a Paima dApp.
/// See PRC3 for more.
interface IInverseBaseProjectedNft is IInverseProjectedNft {
    /// @dev Emitted when the globally-enforced tokenId is minted, with `initialData` provided in the `mint` function parameters.
    event Minted(uint256 indexed tokenId, string initialData);

    /// @dev Mints a new token to address `_to`, passing `initialData` to be emitted in the event.
    /// Increases the `totalSupply` and `currentTokenId`.
    /// Reverts if `_to` is a zero address or if it refers to smart contract but does not implement IERC721Receiver-onERC721Received.
    /// Emits the `Minted` event.
    /// @param _to where to send the NFT to
    /// @param initialData data that is emitted in the `Minted` event
    /// @param data any additional data to pass to the receiver contract
    /// @return id of the minted token
    function mint(
        address _to,
        string calldata initialData,
        bytes memory data
    ) external returns (uint256);

    /// @dev Shorthand function that calls the `mint` function with empty `data`.
    function mint(address _to, string calldata initialData) external returns (uint256);
}
