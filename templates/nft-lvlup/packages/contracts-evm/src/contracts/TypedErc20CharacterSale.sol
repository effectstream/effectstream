// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Erc20NftSale} from "@effectstream/evm-contracts/src/contracts/Erc20NftSale.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {CharacterType, CharacterTypeMapper} from "./CharacterTypeMapper.sol";

/// Extends the base ERC20 NFT sale contract to provide a type-safe
/// `buyCharacter` function. Pays the configured price in a whitelisted ERC20
/// and mints a CharacterNft whose `initialData` annotation is the type string.
contract TypedErc20CharacterSale is Erc20NftSale {
    CharacterTypeMapper public typeMapper;

    function initialize(
        ERC20[] memory currencies,
        address owner,
        address nft,
        uint256 price
    ) public override {
        require(!initialized, "Contract already initialized");
        // initialize state here first since parent constructor emits event
        typeMapper = new CharacterTypeMapper();
        super.initialize(currencies, owner, nft, price);
    }

    function buyCharacter(ERC20 tokenAddress, address receiverAddress, CharacterType characterType)
        public
        payable
        returns (uint256)
    {
        return super.buyWithToken(tokenAddress, receiverAddress, typeMapper.getCharacterTypeString(characterType));
    }
}
