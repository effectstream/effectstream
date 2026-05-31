// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Erc20NftSaleProxy} from "@effectstream/evm-contracts/src/contracts/Proxy/Erc20NftSaleProxy.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// Local re-export of the base Erc20NftSaleProxy so Hardhat emits an artifact
/// that Hardhat Ignition can resolve at deploy time.
contract Erc20CharacterSaleProxy is Erc20NftSaleProxy {
    constructor(
        address implementation,
        ERC20[] memory currencies,
        address owner,
        address nftAddress,
        uint256 nftPrice
    ) Erc20NftSaleProxy(implementation, currencies, owner, nftAddress, nftPrice) {}
}
