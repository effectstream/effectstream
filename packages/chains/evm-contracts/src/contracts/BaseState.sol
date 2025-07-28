// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract BaseState {
    /// @dev Required payment for the NFT in sale.
    uint256 public nftPrice;

    /// @dev True if contract has been initialized via `initialize` function.
    bool public initialized;

    /// @dev Address of the NFT for sale.
    address public nftAddress;
}
