// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

/// @dev For testing upgradeability.
contract UpgradeDev {
    function version() public pure returns (uint8) {
        return 2;
    }
}
