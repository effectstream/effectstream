// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {EffectstreamL2Contract} from "@effectstream/evm-contracts/src/contracts/EffectstreamL2Contract.sol";

contract MyEffectstreamL2 is EffectstreamL2Contract {
    constructor(address _owner, uint256 _fee) EffectstreamL2Contract(_owner, _fee) {}
}
