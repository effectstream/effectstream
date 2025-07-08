// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {IERC1155MetadataURI} from "@openzeppelin/contracts/token/ERC1155/extensions/IERC1155MetadataURI.sol";
import {IERC4906Agnostic} from "./IERC4906Agnostic.sol";
import {IUri} from "./IUri.sol";

/// @dev A standard ERC1155 that can be burned and has a special uri function accepting a custom base URI.
interface IInverseProjected1155 is IERC1155MetadataURI, IERC4906Agnostic {
    /// @dev Emitted when `baseExtension` is updated from `oldBaseExtension` to `newBaseExtension`.
    event SetBaseExtension(string oldBaseExtension, string newBaseExtension);

    /// @dev Emitted when `baseUri` is updated from `oldUri` to `newUri`.
    event SetBaseURI(string oldUri, string newUri);

    /// @dev Burns `value` amount of token of ID `id` from transaction sender.
    /// Reverts if transaction sender's balance of `id` is less than `value`.
    function burn(uint256 id, uint256 value) external;

    /// @dev Burns batch of `values` amounts of tokens of IDs `ids` from transaction sender.
    /// Reverts if transaction sender's balance of any `id` is less than `value`.
    function burnBatch(uint256[] memory ids, uint256[] memory values) external;

    /// @dev Sets `_URI` as the `baseURI`.
    /// Callable only by the contract owner.
    /// Emits the `SetBaseURI` event.
    function setBaseURI(string memory _URI) external;

    /// @dev Sets `_newBaseExtension` as the `baseExtension`.
    /// Callable only by the contract owner.
    function setBaseExtension(string memory _newBaseExtension) external;

    /// @dev Returns the token URI of specified `id` using a custom base URI.
    function uri(uint256 id, string memory customBaseUri) external view returns (string memory);

    /// @dev Returns the token URI of specified `id` using a call to contract implementing `IUri`.
    function uri(uint256 id, IUri customUriInterface) external view returns (string memory);
}
