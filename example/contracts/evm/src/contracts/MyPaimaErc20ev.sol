// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {Erc20Dev} from "@paima/evm/src/contracts/dev/Erc20Dev.sol";

contract PaimaErc20Dev is Erc20Dev {
    constructor() Erc20Dev() {}

}
