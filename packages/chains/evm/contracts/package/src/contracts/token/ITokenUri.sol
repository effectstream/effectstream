// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

/// @dev An interface exposing the `tokenURI` function from IERC721Metadata.
interface ITokenUri {
    /**
     * @dev Returns the Uniform Resource Identifier (URI) for `tokenId` token.
     */
    function tokenURI(uint256 tokenId) external view returns (string memory);
}
