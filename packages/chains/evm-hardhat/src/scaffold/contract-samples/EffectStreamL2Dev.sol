// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {PaimaL2Contract} from "@paimaexample/evm-contracts/src/contracts/PaimaL2Contract.sol";

// THIS IS A SAMPLE CONTRACT
// DO NOT USE THIS CONTRACT IN PRODUCTION
contract effectstreaml2 is PaimaL2Contract {
    constructor() PaimaL2Contract(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266, 0) {}
}
