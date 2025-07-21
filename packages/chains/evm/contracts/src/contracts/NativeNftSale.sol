// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "./AnnotatedMintNft.sol";
import "./BaseState.sol";
import "./ERC1967.sol";

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/// @dev Facilitates selling NFTs that accepts extra data when buying for any initialization data needed in a Paima dApp.
contract NativeNftSale is BaseState, ERC1967, OwnableUpgradeable {
    using Address for address payable;

    /// @dev Emitted when the contract is initialized.
    event Initialized(address indexed owner, address indexed nft);

    /// @dev Emitted when the NFT price is updated from `oldPrice` to `newPrice`.
    event UpdatePrice(uint256 indexed oldPrice, uint256 indexed newPrice);

    /// @dev Emitted when an NFT of `tokenId` is minted to `receiver` by `buyer` paying `PRICE` in native tokens.
    event BuyNFT(
        uint256 indexed tokenId,
        uint256 indexed PRICE,
        address indexed receiver,
        address buyer
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @dev Initializes the contract with the requested price `_price` in native tokens for specified NFT `_nft`,
    /// transferring ownership to the specified `owner`.
    /// Callable only once.
    /// Emits the `Initialized` event.
    function initialize(address owner, address _nft, uint256 _price) public virtual initializer {
        require(!initialized, "Contract already initialized");
        initialized = true;

        nftPrice = _price;
        nftAddress = _nft;
        __Ownable_init(owner);

        emit Initialized(owner, _nft);
    }

    /// @dev Purchases NFT for address `receiverAddress`, paying required price in native token.
    /// This function calls the `mint` function on the `AnnotatedMintNft` contract, passing provided `initialData`.
    /// Emits the `BuyNFT` event.
    function buyNft(
        address receiverAddress,
        // not calldata to allow other contracts to wrap this and change what is bought with their own logic
        string memory initialData
    ) public payable returns (uint256) {
        require(msg.value == nftPrice, "NativeNftSale: incorrect value");
        require(receiverAddress != address(0), "NativeNftSale: zero receiver address");

        uint256 price = nftPrice;

        uint256 tokenId = AnnotatedMintNft(nftAddress).mint(receiverAddress, initialData);

        emit BuyNFT(tokenId, price, receiverAddress, msg.sender);

        return tokenId;
    }

    /// @dev Changes the sale price to `_nftPrice`.
    /// Callable only by the contract owner.
    /// Emits the `UpdatePrice` event.
    function updatePrice(uint256 _nftPrice) external onlyOwner {
        uint256 oldPrice = nftPrice;
        nftPrice = _nftPrice;

        emit UpdatePrice(oldPrice, _nftPrice);
    }

    /// @dev Withdraws the contract balance to `_account`.
    /// Callable only by the contract owner.
    function withdraw(address payable _account) external onlyOwner {
        uint256 balance = address(this).balance;

        require(balance > 0, "NativeNftSale: 0 balance");
        _account.sendValue(balance);
    }

    /// @dev Upgrades the contract implementation to `_newContract`.
    /// Callable only by the contract owner.
    function upgradeContract(address _newContract) external onlyOwner {
        _setImplementation(_newContract);
    }

    /// @dev Function allowing the contract to receive native tokens.
    receive() external payable {}
}
