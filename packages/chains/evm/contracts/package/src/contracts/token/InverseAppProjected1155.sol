// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {IERC1155MetadataURI} from "@openzeppelin/contracts/token/ERC1155/extensions/IERC1155MetadataURI.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IInverseProjected1155} from "./IInverseProjected1155.sol";
import {IInverseAppProjected1155} from "./IInverseAppProjected1155.sol";
import {IUri} from "./IUri.sol";

struct MintEntry {
    address minter;
    uint256 userTokenId;
}

/// @dev A Paima Inverse Projection ERC1155 token where initialization is handled by the app-layer.
/// A standard ERC1155 that can be freely minted and stores an unique `<minter, userTokenId>` pair (used in `tokenURI`) when minted.
contract InverseAppProjected1155 is IInverseAppProjected1155, ERC1155, Ownable {
    using Strings for uint256;

    string public name;
    string public symbol;

    mapping(uint256 id => MintEntry) public tokenToMint;
    mapping(address minter => uint256) public mintCount;
    mapping(uint256 id => uint256) private _initialSupply;
    mapping(uint256 id => uint256) private _totalSupply;

    /// @dev The token ID that will be minted when calling the `mint` function.
    uint256 public currentTokenId;
    /// @dev Base URI that is used in the `uri` function to form the start of the token URI.
    string public baseURI;
    /// @dev Base extension that is used in the `uri` function to form the end of the token URI.
    string public baseExtension;

    /// @dev Sets the token's `_name`, `_symbol`, and transfers ownership to `_owner`.
    /// Also sets `currentTokenId` to 1.
    constructor(
        string memory _name,
        string memory _symbol,
        address _owner
    ) ERC1155("") Ownable(_owner) {
        name = _name;
        symbol = _symbol;
        currentTokenId = 1;
        baseExtension = ".json";
    }

    /// @dev Returns true if this contract implements the interface defined by `interfaceId`. See EIP165.
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(IERC165, ERC1155) returns (bool) {
        return
            interfaceId == type(IInverseProjected1155).interfaceId ||
            interfaceId == type(IInverseAppProjected1155).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function currentNonce(address user) public view virtual returns (uint256) {
        return mintCount[user];
    }

    function validateMint(address, bytes memory) internal virtual returns (bool) {
        // Base contract allows any mint
        // Replace this with any custom verification logic
        return true;
    }

    /// @dev Returns the amount of token with ID `id` that had been initially minted.
    function initialSupply(uint256 id) public view virtual returns (uint256) {
        return _initialSupply[id];
    }

    /// @dev Returns the total amount of tokens with ID `id` that currently exists.
    function totalSupply(uint256 id) public view virtual returns (uint256) {
        return _totalSupply[id];
    }

    /// @dev Mints `value` of a new token to the transaction sender.
    /// Increases the `currentTokenId`.
    /// Reverts if transaction sender is a smart contract that does not implement IERC1155Receiver-onERC1155Received.
    /// Emits the `Minted` event.
    /// @param value the amount of tokens to mint.
    /// @param data additional data to pass to the receiver contract.
    /// @param verificationData any additional data to verify the validity of the mint
    /// @return id of the minted token.
    function mint(
        uint256 value,
        bytes memory data,
        bytes memory verificationData
    ) public virtual returns (uint256) {
        require(
            validateMint(msg.sender, verificationData),
            "InverseAppProjected1155: invalid verification data"
        );
        uint256 tokenId = currentTokenId;
        _mint(msg.sender, tokenId, value, data);
        mintCount[msg.sender] += 1;
        uint256 userTokenId = mintCount[msg.sender];
        tokenToMint[tokenId] = MintEntry(msg.sender, userTokenId);
        _initialSupply[tokenId] = value;

        currentTokenId++;

        emit Minted(tokenId, msg.sender, userTokenId, value);
        return tokenId;
    }

    /// @dev This works identically to the other function with an extra data parameter,
    ///      except this function just sets data to "".
    function mint(uint256 value, bytes memory data) public returns (uint256) {
        return mint(value, data, bytes(""));
    }

    /// @dev Burns `value` amount of token of ID `id` from transaction sender.
    /// Reverts if transaction sender's balance of `id` is less than `value`.
    function burn(uint256 id, uint256 value) public virtual {
        _burn(msg.sender, id, value);
    }

    /// @dev Burns batch of `values` amounts of tokens of IDs `ids` from transaction sender.
    /// Reverts if transaction sender's balance of any `id` is less than `value`.
    function burnBatch(uint256[] memory ids, uint256[] memory values) public virtual {
        _burnBatch(msg.sender, ids, values);
    }

    /// @dev Returns the token URI of specified `id` using the default set base URI.
    function uri(
        uint256 id
    ) public view virtual override(ERC1155, IERC1155MetadataURI) returns (string memory) {
        return uri(id, baseURI);
    }

    /// @dev Returns the token URI of specified `id` using a custom base URI.
    function uri(
        uint256 id,
        string memory customBaseUri
    ) public view virtual returns (string memory) {
        require(_totalSupply[id] > 0, "InverseAppProjected1155: URI query for nonexistent token");
        MintEntry memory entry = tokenToMint[id];
        string memory URI = bytes(customBaseUri).length > 0
            ? string.concat(
                customBaseUri,
                "eip155:",
                block.chainid.toString(),
                "/",
                Strings.toHexString(uint160(entry.minter), 20),
                "/",
                entry.userTokenId.toString(),
                "/",
                _initialSupply[id].toString()
            )
            : "";
        return string(abi.encodePacked(URI, baseExtension));
    }

    /// @dev Returns the token URI of specified `id` using a call to contract implementing `IUri`.
    function uri(uint256 id, IUri customUriInterface) public view virtual returns (string memory) {
        return customUriInterface.uri(id);
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

    /// @dev See {ERC1155-_update}.
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal virtual override {
        super._update(from, to, ids, values);

        if (from == address(0)) {
            for (uint256 i = 0; i < ids.length; ++i) {
                // Overflow check required: The rest of the code assumes that totalSupply never overflows
                _totalSupply[ids[i]] += values[i];
            }
        }

        if (to == address(0)) {
            for (uint256 i = 0; i < ids.length; ++i) {
                unchecked {
                    // Overflow not possible: values[i] <= balanceOf(from, ids[i]) <= totalSupply(ids[i])
                    _totalSupply[ids[i]] -= values[i];
                }
            }
        }
    }
}
