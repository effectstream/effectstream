// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract State {
    /// @dev Required payment for the NFT in sale.
    uint256 public nftPrice;

    /// @dev True if contract has been initialized via `initialize` function.
    bool public initialized;

    /// @dev Address of the NFT for sale.
    address public nftAddress;

    /// @dev Array of addresses of tokens that have been deposited to the contract via NFT sales.
    ERC20[] public depositedCurrencies;

    /// @dev Mapping that returns true for address of token that has been deposited to the contract via NFT sale.
    mapping(ERC20 => bool) public depositedCurrenciesMap;

    /// @dev Array of addresses of tokens that are accepted as payment for the NFT sale.
    ERC20[] public supportedCurrencies;
}
