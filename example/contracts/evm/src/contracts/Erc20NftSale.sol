// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "./AnnotatedMintNft.sol";
import "./State.sol";
import "./ERC1967.sol";

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/// @dev Facilitates selling NFTs for specific ERC20s that accepts extra data when buying for any initialization data needed in a Paima dApp.
contract Erc20NftSale is State, ERC1967, OwnableUpgradeable {
    /// @dev Emitted when the contract is initialized.
    event Initialized(ERC20[] indexed currencies, address indexed owner, address indexed nft);

    /// @dev Emitted when the NFT price is updated from `oldPrice` to `newPrice`.
    event UpdatePrice(uint256 indexed oldPrice, uint256 indexed newPrice);

    /// @dev Emitted when the `token` is removed from the list of `supportedCurrencies`.
    event RemoveWhitelistedToken(address indexed token);

    /// @dev Emitted when the `tokens` are added as the `supportedCurrencies`.
    event WhitelistTokens(address[] indexed tokens);

    /// @dev Emitted when an NFT of `tokenId` is minted to `receiver` by `buyer` paying `PRICE` in tokens of `supportedCurrencies`.
    event BuyWithToken(
        uint256 indexed tokenId,
        uint256 indexed PRICE,
        address indexed receiver,
        address buyer
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @dev Initializes the contract with the requested price `_price` in tokens of `currencies` for specified NFT `_nft`,
    /// transferring ownership to the specified `owner`.
    /// Callable only once.
    /// Emits the `Initialized` event.
    function initialize(
        ERC20[] memory currencies,
        address owner,
        address _nft,
        uint256 _price
    ) public virtual initializer {
        require(!initialized, "Contract already initialized");
        initialized = true;

        for (uint8 i = 0; i < currencies.length; i++) {
            supportedCurrencies.push(currencies[i]);
        }

        nftPrice = _price;
        nftAddress = _nft;
        __Ownable_init(owner);

        emit Initialized(currencies, owner, _nft);
    }

    /// @dev Purchases NFT for address `receiverAddress`, paying required price in token of `_tokenAddress`,
    /// if it is one of the `supportedCurrencies`.
    /// This function calls the `mint` function on the `AnnotatedMintNft` contract, passing provided `initialData`.
    /// Emits the `BuyWithToken` event.
    function buyWithToken(
        ERC20 _tokenAddress,
        address receiverAddress,
        // not calldata to allow other contracts to wrap this and change what is bought with their own logic
        string memory initialData
    ) public virtual returns (uint256) {
        require(tokenIsWhitelisted(_tokenAddress), "Erc20NftSale: token not whitelisted");
        require(receiverAddress != address(0), "Erc20NftSale: zero receiver address");

        uint256 price = nftPrice;

        // transfer tokens from buyer to contract
        ERC20(_tokenAddress).transferFrom(msg.sender, address(this), price);

        uint256 tokenId = AnnotatedMintNft(nftAddress).mint(receiverAddress, initialData);

        if (!depositedCurrenciesMap[_tokenAddress]) {
            depositedCurrencies.push(_tokenAddress);
            depositedCurrenciesMap[_tokenAddress] = true;
        }

        emit BuyWithToken(tokenId, price, receiverAddress, msg.sender);

        return tokenId;
    }

    /// @dev Removes `_token` from the list of `supportedCurrencies`.
    /// Callable only by the contract owner.
    /// Emits the `RemoveWhitelistedToken` event.
    function removeWhitelistedToken(ERC20 _token) external onlyOwner {
        require(tokenIsWhitelisted(_token), "Erc20NftSale: token not whitelisted");

        ERC20[] memory supportedCurrenciesMem = supportedCurrencies;

        uint256 tokenIndex;
        for (uint256 i = 0; i < supportedCurrenciesMem.length; i++) {
            if (supportedCurrenciesMem[i] == _token) {
                tokenIndex = i;
                break;
            }
        }

        require(tokenIndex < supportedCurrenciesMem.length, "Erc20NftSale: out of bounds");

        supportedCurrencies[tokenIndex] = supportedCurrencies[supportedCurrencies.length - 1];
        supportedCurrencies.pop();

        emit RemoveWhitelistedToken(address(_token));
    }

    /// @dev Adds `_tokens` to the `supportedCurrencies` array.
    /// Callable only by the contract owner.
    /// Emits the `WhitelistTokens` event.
    function whitelistTokens(ERC20[] memory _tokens) external onlyOwner {
        address[] memory newWhiteList = new address[](_tokens.length);

        for (uint256 i = 0; i < _tokens.length; i++) {
            newWhiteList[i] = address(_tokens[i]);
            supportedCurrencies.push(_tokens[i]);
        }

        emit WhitelistTokens(newWhiteList);
    }

    /// @dev Changes the sale price to `_nftPrice`.
    /// Callable only by the contract owner.
    /// Emits the `UpdatePrice` event.
    function updatePrice(uint256 _nftPrice) external onlyOwner {
        uint256 oldPrice = nftPrice;
        nftPrice = _nftPrice;

        emit UpdatePrice(oldPrice, _nftPrice);
    }

    /// @dev Withdraws the contract balance of `depositedCurrencies` to `_account`.
    /// Callable only by the contract owner.
    function withdraw(address _account) external onlyOwner {
        ERC20[] memory currencies = depositedCurrencies;

        for (uint256 i = 0; i < currencies.length; ) {
            uint256 balance = currencies[i].balanceOf(address(this));
            if (balance > 0) {
                currencies[i].transfer(_account, balance);
            }

            depositedCurrenciesMap[currencies[i]] = false;

            unchecked {
                i++;
            }
        }

        delete depositedCurrencies;
    }

    /// @dev Upgrades the contract implementation to `_newContract`.
    /// Callable only by the contract owner.
    function upgradeContract(address _newContract) external onlyOwner {
        _setImplementation(_newContract);
    }

    /// @dev Returns true if `_token` is part of the `supportedCurrencies`.
    function tokenIsWhitelisted(ERC20 _token) public view returns (bool) {
        ERC20[] memory supportedCurrenciesMem = supportedCurrencies;
        for (uint256 i = 0; i < supportedCurrenciesMem.length; i++) {
            if (supportedCurrenciesMem[i] == _token) return true;
        }

        return false;
    }

    /// @dev Returns the token addresses that have been used as a payment in the NFT purchases.
    function getDepositedCurrencies() public view returns (ERC20[] memory) {
        return depositedCurrencies;
    }

    /// @dev Returns an array of token addresses that are accepted as payment in the NFT purchase.
    function getSupportedCurrencies() public view returns (ERC20[] memory) {
        return supportedCurrencies;
    }
}
