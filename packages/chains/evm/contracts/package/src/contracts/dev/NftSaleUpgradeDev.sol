// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "../Erc20NftSale.sol";

/// @dev For testing upgradeability.
contract NftSaleUpgradeDev is Erc20NftSale {
    function version() public pure returns (uint8) {
        return 2;
    }
}
