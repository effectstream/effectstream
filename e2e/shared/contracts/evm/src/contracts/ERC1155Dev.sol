// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract ERC1155Dev is ERC1155, Ownable {

    constructor() 
        ERC1155("http://localhost:9999/metadata/erc1155dev/{id}.json") 
        Ownable(msg.sender) // Pass the initial owner to the Ownable constructor
   {
   }

   function mint(address _to, uint256 _amount, uint256 _tokenId, bytes memory _data) external {
        _mint(_to, _tokenId, _amount, _data);
   }
}
