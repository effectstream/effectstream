// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {NativeNftSaleProxy as BaseNativeNftSaleProxy} from "@paimaexample/evm-contracts/src/contracts/Proxy/NativeNftSaleProxy.sol";

/**
 * @title NativeNftSaleProxy
 * @dev Proxy contract for NativeNftSale to enable upgrades
 * This is a re-export of the base Paima NativeNftSaleProxy contract
 */
contract NativeNftSaleProxy is BaseNativeNftSaleProxy {
    constructor(
        address implementation,
        address owner,
        address nftAddress,
        uint256 nftPrice
    ) BaseNativeNftSaleProxy(implementation, owner, nftAddress, nftPrice) {}
}
