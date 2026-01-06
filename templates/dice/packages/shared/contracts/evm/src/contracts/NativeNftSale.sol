// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {NativeNftSale as BaseNativeNftSale} from "@paimaexample/evm-contracts/src/contracts/NativeNftSale.sol";

/**
 * @title NativeNftSale
 * @dev Contract for selling NFTs with native currency
 * This is a re-export of the base Paima NativeNftSale contract
 */
contract NativeNftSale is BaseNativeNftSale {
    constructor() BaseNativeNftSale() {}
}
