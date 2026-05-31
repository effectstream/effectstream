// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {NativeNftSaleProxy} from "@effectstream/evm-contracts/src/contracts/Proxy/NativeNftSaleProxy.sol";

/// Local re-export of the base NativeNftSaleProxy so Hardhat emits an artifact
/// that Hardhat Ignition can resolve at deploy time.
contract NativeCharacterSaleProxy is NativeNftSaleProxy {
    constructor(address implementation, address owner, address nftAddress, uint256 nftPrice)
        NativeNftSaleProxy(implementation, owner, nftAddress, nftPrice)
    {}
}
