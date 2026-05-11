// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Arrays} from "@openzeppelin/contracts/utils/Arrays.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract PaimaLaunchpad is OwnableUpgradeable, UUPSUpgradeable {
    using Address for address payable;
    using Arrays for address[];

    /// @notice Array of addresses of tokens that are accepted as payment.
    address[] public acceptedPaymentTokens;
    /// @notice Returns whether the `token` is supported for payment.
    mapping(address token => bool) public acceptedPaymentToken;
    /// @notice The portion of payment that is rewarded to the referrer, expressed in basis points.
    uint256 public referrerRewardBps;

    /// @dev Emitted when a `buyer` pays `amount` of `paymentToken` for the sale of `itemsQuantities` of `itemsIds` that will be received by `receiver`.
    event BuyItems(
        address indexed receiver,
        address indexed buyer,
        address indexed paymentToken,
        uint256 amount,
        address referrer,
        uint256[] itemsIds,
        uint256[] itemsQuantities
    );
    /// @dev Emitted when a `referrer` receives `amount` of `paymentToken` in a sale initiated by `buyer`.
    event ReferrerReward(address indexed referrer, address indexed buyer, address indexed paymentToken, uint256 amount);
    /// @dev Emitted when the `acceptedPaymentTokens` array is changed to `tokens`.
    event AcceptedPaymentTokensChanged(address[] indexed tokens);

    error PaimaLaunchpad__InvalidBps();
    error PaimaLaunchpad__InvalidReceiver();
    error PaimaLaunchpad__InvalidReferral();
    error PaimaLaunchpad__UnsupportedPaymentToken();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @param _owner Owner of the contract
    /// @param _referrerRewardBps Referrer reward in basis points
    /// @param _acceptedPaymentTokens ERC20 tokens accepted for payment
    function initialize(address _owner, uint256 _referrerRewardBps, address[] memory _acceptedPaymentTokens)
        public
        initializer
    {
        __Ownable_init(_owner);

        _setAcceptedPaymentTokens(_acceptedPaymentTokens);
        referrerRewardBps = _referrerRewardBps;
    }

    /// @notice Purchases `itemsQuantities` of `itemsIds` for address `receiver`, paying required price in native token.
    function buyItemsNative(
        address receiver,
        address payable referrer,
        uint256[] calldata itemsIds,
        uint256[] calldata itemsQuantities
    ) external payable {
        if (msg.sender == referrer || receiver == referrer) {
            revert PaimaLaunchpad__InvalidReferral();
        }
        if (receiver == address(0)) {
            revert PaimaLaunchpad__InvalidReceiver();
        }

        uint256 referrerReward = getReferrerReward(msg.value, referrer);
        if (referrerReward > 0) {
            referrer.sendValue(referrerReward);
            emit ReferrerReward(referrer, msg.sender, address(0), referrerReward);
        }

        emit BuyItems(receiver, msg.sender, address(0), msg.value, referrer, itemsIds, itemsQuantities);
    }

    /// @notice Purchases `itemsQuantities` of `itemsIds` for address `receiver`, paying `paymentAmount` in `paymentToken`.
    function buyItemsErc20(
        address paymentToken,
        uint256 paymentAmount,
        address receiver,
        address referrer,
        uint256[] calldata itemsIds,
        uint256[] calldata itemsQuantities
    ) external {
        if (msg.sender == referrer || receiver == referrer) {
            revert PaimaLaunchpad__InvalidReferral();
        }
        if (receiver == address(0)) {
            revert PaimaLaunchpad__InvalidReceiver();
        }
        if (!acceptedPaymentToken[paymentToken]) {
            revert PaimaLaunchpad__UnsupportedPaymentToken();
        }

        uint256 referrerReward = getReferrerReward(paymentAmount, referrer);
        if (referrerReward > 0) {
            IERC20(paymentToken).transferFrom(msg.sender, referrer, referrerReward);
            emit ReferrerReward(referrer, msg.sender, paymentToken, referrerReward);
        }

        IERC20(paymentToken).transferFrom(msg.sender, address(this), paymentAmount - referrerReward);

        emit BuyItems(receiver, msg.sender, paymentToken, paymentAmount, referrer, itemsIds, itemsQuantities);
    }

    /// @notice Returns the referrer reward portion of price based on `referrerRewardBps`. Returns zero if referrer is address(0).
    function getReferrerReward(uint256 price, address referrer) public view returns (uint256) {
        return referrer == address(0) ? 0 : (price * referrerRewardBps) / 10000;
    }

    /// @notice Sets the referrer reward portion in basis points to `newReferrerRewardBps`.
    function setReferrerRewardBps(uint256 newReferrerRewardBps) external onlyOwner {
        if (newReferrerRewardBps > 10000) {
            revert PaimaLaunchpad__InvalidBps();
        }
        referrerRewardBps = newReferrerRewardBps;
    }

    /// @notice Sets `tokens` as the `acceptedPaymentTokens` array and updates `acceptedPaymentToken` mapping values.
    function setAcceptedPaymentTokens(address[] memory tokens) external onlyOwner {
        _setAcceptedPaymentTokens(tokens);
    }

    /// @notice Withdraws the contract ETH balance and balances of all `acceptedPaymentTokens` to `account`.
    function withdraw(address payable account) external onlyOwner {
        uint256 balance = address(this).balance;
        account.sendValue(balance);

        uint256 currenciesLength = acceptedPaymentTokens.length;
        for (uint256 i; i < currenciesLength;) {
            IERC20 currency = IERC20(acceptedPaymentTokens.unsafeMemoryAccess(i));
            uint256 tokenBalance = currency.balanceOf(address(this));
            if (tokenBalance > 0) {
                currency.transfer(account, tokenBalance);
            }
            unchecked {
                ++i;
            }
        }
    }

    function _setAcceptedPaymentTokens(address[] memory tokens) internal {
        uint256 acceptedPaymentTokensLength = acceptedPaymentTokens.length;
        for (uint256 i; i < acceptedPaymentTokensLength;) {
            acceptedPaymentToken[acceptedPaymentTokens.unsafeMemoryAccess(i)] = false;
            unchecked {
                ++i;
            }
        }

        uint256 tokensLength = tokens.length;
        for (uint256 i; i < tokensLength;) {
            acceptedPaymentToken[tokens.unsafeMemoryAccess(i)] = true;
            unchecked {
                ++i;
            }
        }
        acceptedPaymentTokens = tokens;
        emit AcceptedPaymentTokensChanged(tokens);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
