// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {PaimaL2Contract as BasePaimaL2Contract} from "@paimaexample/evm-contracts/src/contracts/PaimaL2Contract.sol";

/**
 * @title PaimaL2Contract
 * @dev Main L2 contract for submitting game inputs
 * This is a re-export of the base Paima L2 contract
 */
contract PaimaL2Contract is BasePaimaL2Contract {
    constructor(address _owner, uint256 _fee) BasePaimaL2Contract(_owner, _fee) {}
}
