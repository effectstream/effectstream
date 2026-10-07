// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// The five character "types" a player can mint.
/// Mirrors the `characters` enum used by the sync node grammar
/// (air, earth, fire, water, ether).
enum CharacterType {
    AIR,
    EARTH,
    FIRE,
    WATER,
    ETHER
}

/// Provides an easy-to-use mapping between the enum values and their string
/// representation. The string is what gets baked into the NFT's `initialData`
/// annotation when a character is bought through the sale contracts.
contract CharacterTypeMapper {
    mapping(CharacterType => string) internal characterTypeToString;

    constructor() {
        characterTypeToString[CharacterType.AIR] = "air";
        characterTypeToString[CharacterType.EARTH] = "earth";
        characterTypeToString[CharacterType.FIRE] = "fire";
        characterTypeToString[CharacterType.WATER] = "water";
        characterTypeToString[CharacterType.ETHER] = "ether";
    }

    function getCharacterTypeString(CharacterType characterType) external view returns (string memory) {
        return characterTypeToString[characterType];
    }
}
