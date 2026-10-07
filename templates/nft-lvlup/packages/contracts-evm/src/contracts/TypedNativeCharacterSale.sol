// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {NativeNftSale} from "@effectstream/evm-contracts/src/contracts/NativeNftSale.sol";
import {CharacterType, CharacterTypeMapper} from "./CharacterTypeMapper.sol";

/// Extends the base native NFT sale contract to provide a type-safe
/// `buyCharacter` function. Pays the configured price in native currency and
/// mints a CharacterNft whose `initialData` annotation is the type string.
contract TypedNativeCharacterSale is NativeNftSale {
    CharacterTypeMapper public typeMapper;

    function initialize(address owner, address _nft, uint256 _price) public override {
        require(!initialized, "Contract already initialized");
        // initialize state here first since parent constructor emits event
        typeMapper = new CharacterTypeMapper();
        super.initialize(owner, _nft, _price);
    }

    function buyCharacter(address receiverAddress, CharacterType characterType)
        public
        payable
        returns (uint256)
    {
        return super.buyNft(receiverAddress, typeMapper.getCharacterTypeString(characterType));
    }
}
