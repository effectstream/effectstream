// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {PaimaL2Contract} from "@paimaexample/evm-contracts/src/contracts/PaimaL2Contract.sol";

contract MyPaimaL2Contract is PaimaL2Contract {
    constructor(address _owner, uint256 _fee) PaimaL2Contract(_owner, _fee) {}
}
