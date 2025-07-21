// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Erc20Dev is ERC20 {
    constructor() ERC20("Mock ERC20", "MERC") {}

    function mint(address _to, uint256 _amount) external {
        _mint(_to, _amount);
    }
}
