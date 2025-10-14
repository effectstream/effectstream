// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract MCT_ERC1155 is ERC1155, Ownable {

   uint256 private constant MAX_MINT_AMOUNT = 1000;
   uint256 private constant TOKEN_ID = 1;

    event TransferToMidnight(address indexed from, address indexed midnight_address, uint256 amount);

    constructor() 
        ERC1155("http://localhost:10599/metadata/{id}.json") 
        Ownable(msg.sender) // Pass the initial owner to the Ownable constructor
   {
       // The constructor body can be empty if all setup is done above.
   }

    function mint(address _to, uint256 _amount) external {
        _mint(_to, TOKEN_ID, _amount, "");
    }

    function transferToMidnight(uint256 _amount, address _target_account) external {
        address from = msg.sender;
        _burn(from, TOKEN_ID, _amount);
        emit TransferToMidnight(from, _target_account, _amount);
    }
}
