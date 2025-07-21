// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/// @dev A standard ERC721 that accepts calldata in the mint function for any initialization data needed in a Paima dApp.
/// Upon deployment only the contract owner (specified in constructor parameter) is able to mint tokens. Additional
/// minters (e.g. NativeNftSale contract) need to be added by using the `setMinter` function.
contract AnnotatedMintNft is ERC165, ERC721, Ownable {
    /// @dev The token ID that will be minted when calling the `mint` function.
    uint256 public currentTokenId;
    /// @dev Base URI that is used in the `tokenURI` function to form the start of the token URI.
    string public baseURI;
    /// @dev Total token supply, increased by minting and decreased by burning.
    uint256 public totalSupply;
    /// @dev Maximum amount of tokens that is allowed to exist.
    uint256 public maxSupply;
    /// @dev Base extension that is used in the `tokenURI` function to form the end of the token URI.
    string public baseExtension;

    /// @dev Returns true for addresses that are allowed to mint this token.
    mapping(address => bool) public minters;

    /// @dev Reverts if `msg.sender` is neither a minter nor the contract owner.
    modifier canMint() {
        require(
            isMinter(msg.sender) || owner() == msg.sender,
            "AnnotatedMintNft: not authorized to mint"
        );
        _;
    }

    /// @dev Reverts if `msg.sender` is not the specified token's owner.
    modifier onlyTokenOwner(uint256 tokenId) {
        require(msg.sender == ownerOf(tokenId), "AnnotatedMintNft: not owner");
        _;
    }

    /// @dev Emitted when max supply is updated from `oldMaxSupply` to `newMaxSupply`.
    event UpdateMaxSupply(uint256 indexed oldMaxSupply, uint256 indexed newMaxSupply);

    /// @dev Emitted when `newMinter` is added to the mapping of allowed `minters`.
    event SetMinter(address indexed newMinter);

    /// @dev Emitted when `oldMinter` is removed from the mapping of allowed `minters`
    event RemoveMinter(address indexed oldMinter);

    /// @dev Emitted when `baseUri` is updated from `oldUri` to `newUri`.
    event SetBaseURI(string oldUri, string newUri);

    /// @dev Emitted when a new token with ID `tokenId` is minted, with `initialData` provided in the `mint` function parameters.
    event Minted(uint256 indexed tokenId, string initialData);

    /// @dev Sets the NFT's `name`, `symbol`, `maxSupply` to `supply`, `currentTokenId` to 1 and `baseExtension` to `".json"`.
    /// @param name Collection name.
    /// @param symbol Collection symbol.
    /// @param owner The owner of the contract, who will be able to execute
    constructor(
        string memory name,
        string memory symbol,
        uint256 supply,
        address owner
    ) ERC721(name, symbol) Ownable(owner) {
        maxSupply = supply;
        currentTokenId = 1;
        baseExtension = ".json";
    }

    /// @dev Returns true if this contract implements the interface defined by `interfaceID`. See EIP165.
    function supportsInterface(
        bytes4 interfaceID
    ) public view override(ERC165, ERC721) returns (bool) {
        return super.supportsInterface(interfaceID) || interfaceID == this.mint.selector;
    }

    /// @dev Mints a new token to address `_to`, passing `initialData` to be emitted in the event.
    /// Increases the `totalSupply` and `currentTokenId`.
    /// Reverts if `totalSupply` is not less than `maxSupply` or if `_to` is a zero address.
    /// Emits the `Minted` event.
    function mint(address _to, string calldata initialData) external canMint returns (uint256) {
        require(maxSupply > totalSupply, "AnnotatedMintNft: max supply reached");
        require(_to != address(0), "AnnotatedMintNft: zero receiver address");

        uint256 tokenId = currentTokenId;
        _safeMint(_to, tokenId);

        totalSupply++;
        currentTokenId++;

        emit Minted(tokenId, initialData);
        return tokenId;
    }

    /// @dev Burns token of ID `_tokenId`. Callable only by the owner of the specified token.
    /// Reverts if `_tokenId` is not existing.
    function burn(uint256 _tokenId) external onlyTokenOwner(_tokenId) {
        totalSupply--;
        _burn(_tokenId);
    }

    /// @dev Adds `_minter` to the mapping of allowed `minters` of this NFT.
    /// Callable only by the contract owner.
    /// Emits the `SetMinter` event.
    function setMinter(address _minter) external onlyOwner {
        require(_minter != address(0), "AnnotatedMintNft: invalid minter");

        minters[_minter] = true;
        emit SetMinter(_minter);
    }

    /// @dev Removes `_minter` from the mapping of allowed `minters` of this NFT.
    /// Callable only by the contract owner.
    /// Emits the `RemoveMinter` event.
    function removeMinter(address _minter) external onlyOwner {
        require(_minter != address(0), "AnnotatedMintNft: invalid minter");

        minters[_minter] = false;
        emit RemoveMinter(_minter);
    }

    /// @dev Returns the `baseURI` of this NFT.
    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    /// @dev Returns the token URI of specified `tokenId`.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        string memory URI = super.tokenURI(tokenId);
        return string(abi.encodePacked(URI, baseExtension));
    }

    /// @dev Sets `_URI` as the `baseURI` of the NFT.
    /// Callable only by the contract owner.
    /// Emits the `SetBaseURI` event.
    function setBaseURI(string memory _URI) external onlyOwner {
        string memory oldURI = baseURI;
        baseURI = _URI;
        emit SetBaseURI(oldURI, _URI);
    }

    /// @dev Sets `_newBaseExtension` as the `baseExtension` of the NFT.
    /// Callable only by the contract owner.
    function setBaseExtension(string memory _newBaseExtension) public onlyOwner {
        baseExtension = _newBaseExtension;
    }

    /// @dev Sets `_maxSupply` as the `maxSupply` of the NFT.
    /// Callable only by the contract owner.
    /// Emits the `UpdateMaxSupply` event.
    function updateMaxSupply(uint256 _maxSupply) external onlyOwner {
        uint256 oldMaxSupply = maxSupply;
        require(_maxSupply > oldMaxSupply, "AnnotatedMintNft: old supply less than new supply");

        maxSupply = _maxSupply;
        emit UpdateMaxSupply(oldMaxSupply, _maxSupply);
    }

    /// @dev Returns true if specified `_tokenId` exists.
    function exists(uint256 _tokenId) external view returns (bool) {
        return _ownerOf(_tokenId) != address(0);
    }

    /// @dev Returns true if `_account` is in the mapping of allowed `minters`.
    function isMinter(address _account) public view returns (bool) {
        return minters[_account];
    }
}
