// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

/// @dev An interface exposing the `uri` function from IERC1155MetadataURI.
interface IUri {
    /**
     * @dev Returns the URI for token type `id`.
     *
     * If the `\{id\}` substring is present in the URI, it must be replaced by
     * clients with the actual token type ID.
     */
    function uri(uint256 id) external view returns (string memory);
}
