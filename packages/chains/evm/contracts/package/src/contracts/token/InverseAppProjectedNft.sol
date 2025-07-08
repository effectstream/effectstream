// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC721Metadata} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IInverseProjectedNft} from "./IInverseProjectedNft.sol";
import {IInverseAppProjectedNft} from "./IInverseAppProjectedNft.sol";
import {ITokenUri} from "./ITokenUri.sol";

struct MintEntry {
    address minter;
    uint256 userTokenId;
}

/// @dev A standard ERC721 that accepts calldata in the mint function for any initialization data needed in a Paima dApp.
/// See PRC3 for more.
contract InverseAppProjectedNft is IInverseAppProjectedNft, ERC721, Ownable {
    using Strings for uint256;

    /// @dev tokenId => MintEntry.
    mapping(uint256 => MintEntry) public tokenToMint;
    mapping(address => uint256) public mintCount;

    /// @dev The token ID that will be minted when calling the `mint` function.
    uint256 public currentTokenId;
    /// @dev Base URI that is used in the `tokenURI` function to form the start of the token URI.
    string public baseURI;
    /// @dev Total token supply, increased by minting and decreased by burning.
    uint256 public totalSupply;
    /// @dev Base extension that is used in the `tokenURI` function to form the end of the token URI.
    string public baseExtension;

    /// @dev Reverts if `msg.sender` is not the specified token's owner.
    modifier onlyTokenOwner(uint256 tokenId) {
        require(msg.sender == ownerOf(tokenId), "InverseAppProjectedNft: not owner");
        _;
    }

    /// @dev Sets the NFT's `name`, `symbol`, and transfers ownership to `owner`.
    /// Also sets `currentTokenId` to 1 and `baseExtension` to `".json"`.
    constructor(
        string memory name,
        string memory symbol,
        address owner
    ) ERC721(name, symbol) Ownable(owner) {
        currentTokenId = 1;
        baseExtension = ".json";
    }

    /// @dev Returns true if this contract implements the interface defined by `interfaceId`. See EIP165.
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(IERC165, ERC721) returns (bool) {
        return
            interfaceId == type(IInverseProjectedNft).interfaceId ||
            interfaceId == type(IInverseAppProjectedNft).interfaceId ||
            interfaceId == bytes4(0x49064906) ||
            super.supportsInterface(interfaceId);
    }

    function currentNonce(address user) public view returns (uint256) {
        return mintCount[user];
    }

    function validateMint(address, bytes memory) internal virtual returns (bool) {
        // Base contract allows any mint
        // Replace this with any custom verification logic
        return true;
    }

    /// @dev Mints a new token to address `_to`
    /// Increases the `totalSupply` and `currentTokenId`.
    /// Reverts if `_to` is a zero address or if it refers to smart contract but does not implement IERC721Receiver-onERC721Received.
    /// Emits the `Minted` event.
    /// @param _to where to send the NFT to
    /// @param _verificationData any additional data to verify the validity of the mint
    /// @param _data any additional data to pass to the receiver contract
    /// @return id of the minted token
    function mint(
        address _to,
        bytes memory _verificationData,
        bytes memory _data
    ) public virtual returns (uint256) {
        require(_to != address(0), "InverseAppProjectedNft: zero receiver address");
        require(
            validateMint(_to, _verificationData),
            "InverseAppProjectedNft: invalid verification data"
        );

        uint256 tokenId = currentTokenId;
        _safeMint(_to, tokenId, _data);
        mintCount[_to] += 1;
        uint256 userTokenId = mintCount[_to];
        tokenToMint[tokenId] = MintEntry(_to, userTokenId);

        totalSupply++;
        currentTokenId++;

        emit Minted(tokenId, _to, userTokenId);
        return tokenId;
    }

    /// @dev Shorthand function that calls the `mint` function with empty `_data`.
    function mint(address _to, bytes memory _verificationData) public virtual returns (uint256) {
        return mint(_to, _verificationData, bytes(""));
    }

    /// @dev Shorthand function that calls the `mint` function with empty `_verificationData` and empty `_data`.
    function mint(address _to) public returns (uint256) {
        return mint(_to, bytes(""), bytes(""));
    }

    /// @dev Burns token of ID `_tokenId`. Callable only by the owner of the specified token.
    /// Reverts if `_tokenId` does not exist.
    function burn(uint256 _tokenId) public virtual onlyTokenOwner(_tokenId) {
        totalSupply--;
        _burn(_tokenId);
    }

    /// @dev Returns the `baseURI` of this NFT.
    function _baseURI() internal view virtual override returns (string memory) {
        return baseURI;
    }

    /// @dev Returns the token URI of specified `tokenId` using the default set base URI.
    function tokenURI(
        uint256 tokenId
    ) public view virtual override(ERC721, IERC721Metadata) returns (string memory) {
        return tokenURI(tokenId, _baseURI());
    }

    /// @dev Returns the token URI of specified `tokenId` using a custom base URI.
    function tokenURI(
        uint256 tokenId,
        string memory customBaseUri
    ) public view virtual returns (string memory) {
        _requireOwned(tokenId);
        MintEntry memory entry = tokenToMint[tokenId];
        string memory URI = bytes(customBaseUri).length > 0
            ? string.concat(
                customBaseUri,
                "eip155:",
                block.chainid.toString(),
                "/",
                Strings.toHexString(uint160(entry.minter), 20),
                "/",
                entry.userTokenId.toString()
            )
            : "";
        return string(abi.encodePacked(URI, baseExtension));
    }

    /// @dev Returns the token URI of specified `tokenId` using a call to contract implementing `ITokenUri`.
    function tokenURI(
        uint256 tokenId,
        ITokenUri customUriInterface
    ) public view returns (string memory) {
        return customUriInterface.tokenURI(tokenId);
    }

    /// @dev Sets `_URI` as the `baseURI` of the NFT.
    /// Callable only by the contract owner.
    /// Emits the `SetBaseURI` event.
    function setBaseURI(string memory _URI) public virtual onlyOwner {
        string memory oldURI = baseURI;
        baseURI = _URI;
        emit SetBaseURI(oldURI, _URI);
    }

    /// @dev Sets `_newBaseExtension` as the `baseExtension` of the NFT.
    /// Callable only by the contract owner.
    function setBaseExtension(string memory _newBaseExtension) public virtual onlyOwner {
        string memory oldBaseExtension = baseExtension;
        baseExtension = _newBaseExtension;
        emit SetBaseURI(oldBaseExtension, _newBaseExtension);
    }

    /// @dev Function that emits an event to notify third-parties (e.g. NFT marketplaces) about
    /// an update to consecutive range of tokens. Can be overridden in inheriting contract.
    function updateMetadataBatch(uint256 _fromTokenId, uint256 _toTokenId) public virtual {
        emit BatchMetadataUpdate(_fromTokenId, _toTokenId);
    }

    /// @dev Function that emits an event to notify third-parties (e.g. NFT marketplaces) about
    /// an update to a single token. Can be overridden in inheriting contract.
    function updateMetadata(uint256 _tokenId) public virtual {
        emit MetadataUpdate(_tokenId);
    }
}
