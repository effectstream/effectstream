// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "../NativeNftSale.sol";

enum NftType {
    FIRE,
    WATER
}

contract NftTypeMapper {
    mapping(NftType => string) internal nftTypeToString;

    constructor() {
        nftTypeToString[NftType.FIRE] = "fire";
        nftTypeToString[NftType.WATER] = "water";
    }

    function getNftTypeString(NftType nftType) external view returns (string memory) {
        return nftTypeToString[nftType];
    }
}

contract TypedNativeNftSale is NativeNftSale {
    NftTypeMapper public typeMapper;

    function initialize(address owner, address _nft, uint256 _price) public override {
        require(!initialized, "Contract already initialized");
        // initialize state here first since parent constructor emits event
        typeMapper = new NftTypeMapper();
        super.initialize(owner, _nft, _price);
    }

    function buyNftType(address receiverAddress, NftType nftType) public payable returns (uint256) {
        return super.buyNft(receiverAddress, typeMapper.getNftTypeString(nftType));
    }
}
