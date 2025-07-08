// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Arrays} from "@openzeppelin/contracts/utils/Arrays.sol";
import {ERC1155HolderUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import {IInverseProjected1155} from "../token/IInverseProjected1155.sol";
import {IOrderbookDex} from "./IOrderbookDex.sol";

/// @notice Facilitates base-chain trading of assets that are living on a different app-chain.
/// @dev Orders are identified by an asset-specific unique incremental `orderId`.
contract OrderbookDex is
    IOrderbookDex,
    ERC1155HolderUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable
{
    using Address for address payable;
    using Arrays for uint256[];
    using Arrays for address[];

    uint256 constant basisPoints = 10000;
    /// @notice Maximum fee is 10% (1000 bps).
    uint256 public constant maxFee = basisPoints / 10;
    /// @inheritdoc IOrderbookDex
    mapping(address user => uint256 value) public balances;
    /// @inheritdoc IOrderbookDex
    mapping(address asset => uint256 orderId) public currentOrderId;
    mapping(address asset => mapping(uint256 orderId => Order)) internal orders;
    mapping(address asset => FeeInfo) internal assetFeeInfo;
    /// @inheritdoc IOrderbookDex
    uint256 public collectedFees;
    /// @inheritdoc IOrderbookDex
    uint256 public defaultMakerFee;
    /// @inheritdoc IOrderbookDex
    uint256 public defaultTakerFee;
    /// @inheritdoc IOrderbookDex
    uint256 public orderCreationFee;

    error FeeTooHigh();
    error OrderDoesNotExist(uint256 orderId);
    error InsufficientEndAmount(uint256 expectedAmount, uint256 actualAmount);
    error InsufficientPayment();
    error InvalidArrayLength();
    error InvalidInput(uint256 input);
    error Unauthorized(address sender);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _owner,
        uint256 _defaultMakerFee,
        uint256 _defaultTakerFee,
        uint256 _orderCreationFee
    ) public initializer {
        __Ownable_init(_owner);
        __UUPSUpgradeable_init();
        __ERC1155Holder_init();
        __ReentrancyGuard_init();

        defaultMakerFee = _defaultMakerFee;
        defaultTakerFee = _defaultTakerFee;
        orderCreationFee = _orderCreationFee;
    }

    /// @inheritdoc IOrderbookDex
    function claim() external {
        uint256 amount = balances[msg.sender];
        delete balances[msg.sender];
        emit BalanceClaimed(msg.sender, amount);
        payable(msg.sender).sendValue(amount);
    }

    /// @inheritdoc IOrderbookDex
    function getAssetFeeInfo(address asset) public view virtual returns (FeeInfo memory) {
        return assetFeeInfo[asset];
    }

    /// @inheritdoc IOrderbookDex
    function getAssetAppliedFees(
        address asset
    ) public view virtual returns (uint256 makerFee, uint256 takerFee) {
        FeeInfo memory feeInfo = assetFeeInfo[asset];
        if (feeInfo.set) {
            return (feeInfo.makerFee, feeInfo.takerFee);
        }
        return (defaultMakerFee, defaultTakerFee);
    }

    /// @inheritdoc IOrderbookDex
    function setAssetFeeInfo(address asset, uint256 makerFee, uint256 takerFee) public onlyOwner {
        if (makerFee > maxFee || takerFee > maxFee) {
            revert FeeTooHigh();
        }
        assetFeeInfo[asset] = FeeInfo({makerFee: makerFee, takerFee: takerFee, set: true});
        emit FeeInfoChanged(asset, makerFee, takerFee);
    }

    /// @inheritdoc IOrderbookDex
    function setDefaultFeeInfo(uint256 makerFee, uint256 takerFee) public onlyOwner {
        if (makerFee > maxFee || takerFee > maxFee) {
            revert FeeTooHigh();
        }
        defaultMakerFee = makerFee;
        defaultTakerFee = takerFee;
        emit FeeInfoChanged(address(0), makerFee, takerFee);
    }

    /// @inheritdoc IOrderbookDex
    function setOrderCreationFee(uint256 fee) public onlyOwner {
        emit OrderCreationFeeChanged(orderCreationFee, fee);
        orderCreationFee = fee;
    }

    /// @inheritdoc IOrderbookDex
    function getOrder(address asset, uint256 orderId) public view virtual returns (Order memory) {
        return orders[asset][orderId];
    }

    /// @inheritdoc IOrderbookDex
    function createSellOrder(
        address asset,
        uint256 assetId,
        uint256 assetAmount,
        uint256 pricePerAsset
    ) external payable virtual nonReentrant returns (uint256) {
        if (msg.value < orderCreationFee) {
            revert InsufficientPayment();
        }
        collectedFees += msg.value;
        return _createSellOrder(asset, assetId, assetAmount, pricePerAsset);
    }

    /// @inheritdoc IOrderbookDex
    function createBatchSellOrder(
        address asset,
        uint256[] memory assetIds,
        uint256[] memory assetAmounts,
        uint256[] memory pricesPerAssets
    ) external payable virtual nonReentrant returns (uint256[] memory) {
        if (assetIds.length != assetAmounts.length || assetIds.length != pricesPerAssets.length) {
            revert InvalidArrayLength();
        }
        if (msg.value < orderCreationFee * assetIds.length) {
            revert InsufficientPayment();
        }
        collectedFees += msg.value;
        uint256[] memory orderIds = new uint256[](assetIds.length);
        for (uint256 i; i < assetIds.length; ) {
            orderIds[i] = _createSellOrder(
                asset,
                assetIds.unsafeMemoryAccess(i),
                assetAmounts.unsafeMemoryAccess(i),
                pricesPerAssets.unsafeMemoryAccess(i)
            );
            unchecked {
                ++i;
            }
        }
        return orderIds;
    }

    /// @inheritdoc IOrderbookDex
    function fillOrdersExactEth(
        address asset,
        uint256 minimumAsset,
        uint256[] memory orderIds
    ) external payable virtual nonReentrant {
        uint256 length = orderIds.length;
        uint256 remainingEth = msg.value;
        uint256 totalAssetReceived;
        for (uint256 i; i < length; ++i) {
            uint256 orderId = orderIds.unsafeMemoryAccess(i);
            Order storage order = orders[asset][orderId];
            if (order.assetAmount == 0) {
                continue;
            }

            uint256 purchaseCost = (remainingEth * basisPoints) / (order.takerFee + basisPoints);
            // After the integer division by fees, purchase cost needs to be rounded up (fees are rounded down)
            if (purchaseCost * (order.takerFee + basisPoints) != (remainingEth * basisPoints)) {
                ++purchaseCost;
            }
            uint256 assetsToBuy = purchaseCost / order.pricePerAsset;

            if (assetsToBuy == 0) {
                continue;
            }
            if (assetsToBuy > order.assetAmount) {
                assetsToBuy = order.assetAmount;
            }
            purchaseCost = assetsToBuy * order.pricePerAsset;

            // Can be unchecked because assetsToBuy is less than or equal to order.assetAmount.
            unchecked {
                order.assetAmount -= assetsToBuy;
            }

            uint256 makerFee = (purchaseCost * order.makerFee) / basisPoints;
            uint256 takerFee = (purchaseCost * order.takerFee) / basisPoints;

            if (remainingEth < purchaseCost + takerFee) {
                revert InsufficientPayment();
            }

            // Can be unchecked because (purchaseCost + takerFee) is less than or equal to remainingEth.
            unchecked {
                remainingEth -= (purchaseCost + takerFee);
            }

            collectedFees += makerFee + takerFee;

            totalAssetReceived += assetsToBuy;
            IInverseProjected1155(asset).safeTransferFrom(
                address(this),
                msg.sender,
                order.assetId,
                assetsToBuy,
                bytes("")
            );
            balances[order.seller] += purchaseCost - makerFee;
            emit OrderFilled(
                asset,
                order.assetId,
                orderId,
                order.seller,
                msg.sender,
                assetsToBuy,
                order.pricePerAsset,
                makerFee,
                takerFee
            );
            if (remainingEth == 0) {
                break;
            }
        }
        if (totalAssetReceived < minimumAsset) {
            revert InsufficientEndAmount(minimumAsset, totalAssetReceived);
        }
        if (remainingEth > 0) {
            payable(msg.sender).sendValue(remainingEth);
        }
    }

    /// @inheritdoc IOrderbookDex
    function fillOrdersExactAsset(
        address asset,
        uint256 assetAmount,
        uint256[] memory orderIds
    ) external payable virtual nonReentrant {
        uint256 length = orderIds.length;
        uint256 remainingAsset = assetAmount;
        uint256 remainingEth = msg.value;
        for (uint256 i; i < length; ++i) {
            uint256 orderId = orderIds.unsafeMemoryAccess(i);
            Order storage order = orders[asset][orderId];
            if (order.assetAmount == 0) {
                continue;
            }
            uint256 assetsToBuy = order.assetAmount;
            if (assetsToBuy > remainingAsset) {
                assetsToBuy = remainingAsset;
            }
            if (assetsToBuy == 0) {
                continue;
            }

            // Can be unchecked because assetsToBuy is less than or equal to order.assetAmount.
            unchecked {
                order.assetAmount -= assetsToBuy;
            }

            uint256 purchaseCost = assetsToBuy * order.pricePerAsset;
            uint256 makerFee = (purchaseCost * order.makerFee) / basisPoints;
            uint256 takerFee = (purchaseCost * order.takerFee) / basisPoints;

            if (remainingEth < purchaseCost + takerFee) {
                revert InsufficientPayment();
            }

            // Can be unchecked because (purchaseCost + takerFee) is less than or equal to remainingEth.
            unchecked {
                remainingEth -= (purchaseCost + takerFee);
            }
            // Can be unchecked because assetsToBuy is less than or equal to remainingAsset.
            unchecked {
                remainingAsset -= assetsToBuy;
            }

            collectedFees += makerFee + takerFee;

            IInverseProjected1155(asset).safeTransferFrom(
                address(this),
                msg.sender,
                order.assetId,
                assetsToBuy,
                bytes("")
            );
            balances[order.seller] += purchaseCost - makerFee;
            emit OrderFilled(
                asset,
                order.assetId,
                orderId,
                order.seller,
                msg.sender,
                assetsToBuy,
                order.pricePerAsset,
                makerFee,
                takerFee
            );
            if (remainingAsset == 0) {
                break;
            }
        }
        if (remainingAsset > 0) {
            revert InsufficientEndAmount(assetAmount, assetAmount - remainingAsset);
        }
        if (remainingEth > 0) {
            payable(msg.sender).sendValue(remainingEth);
        }
    }

    /// @inheritdoc IOrderbookDex
    function cancelSellOrder(address asset, uint256 orderId) external virtual nonReentrant {
        uint256 creationFeePaid = orders[asset][orderId].creationFeePaid;
        _cancelSellOrder(asset, orderId);
        collectedFees -= creationFeePaid;
        payable(msg.sender).sendValue(creationFeePaid);
    }

    /// @inheritdoc IOrderbookDex
    function cancelBatchSellOrder(
        address asset,
        uint256[] memory orderIds
    ) external virtual nonReentrant {
        uint256 totalCreationFeePaid;
        for (uint256 i; i < orderIds.length; ) {
            totalCreationFeePaid += orders[asset][orderIds.unsafeMemoryAccess(i)].creationFeePaid;
            _cancelSellOrder(asset, orderIds.unsafeMemoryAccess(i));
            unchecked {
                ++i;
            }
        }
        collectedFees -= totalCreationFeePaid;
        payable(msg.sender).sendValue(totalCreationFeePaid);
    }

    /// @inheritdoc IOrderbookDex
    function withdrawFees() external onlyOwner {
        uint256 amount = collectedFees;
        delete collectedFees;
        emit FeesWithdrawn(owner(), amount);
        payable(owner()).sendValue(amount);
    }

    /// @dev Returns true if this contract implements the interface defined by `interfaceId`. See EIP165.
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC1155HolderUpgradeable, IERC165) returns (bool) {
        return
            interfaceId == type(IOrderbookDex).interfaceId || super.supportsInterface(interfaceId);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function _createSellOrder(
        address asset,
        uint256 assetId,
        uint256 assetAmount,
        uint256 pricePerAsset
    ) internal virtual returns (uint256) {
        if (assetAmount == 0 || pricePerAsset == 0) {
            revert InvalidInput(0);
        }
        IInverseProjected1155(asset).safeTransferFrom(
            msg.sender,
            address(this),
            assetId,
            assetAmount,
            bytes("")
        );
        (uint256 makerFee, uint256 takerFee) = getAssetAppliedFees(asset);
        Order memory newOrder = Order({
            assetId: assetId,
            assetAmount: assetAmount,
            pricePerAsset: pricePerAsset,
            seller: payable(msg.sender),
            makerFee: makerFee,
            takerFee: takerFee,
            creationFeePaid: orderCreationFee
        });
        uint256 orderId = currentOrderId[asset];
        orders[asset][orderId] = newOrder;
        emit OrderCreated(
            asset,
            assetId,
            orderId,
            msg.sender,
            assetAmount,
            pricePerAsset,
            makerFee,
            takerFee
        );
        ++currentOrderId[asset];
        return orderId;
    }

    function _cancelSellOrder(address asset, uint256 orderId) internal virtual {
        Order storage order = orders[asset][orderId];
        if (msg.sender != order.seller) {
            revert Unauthorized(msg.sender);
        }
        uint256 assetAmount = order.assetAmount;
        delete order.assetAmount;
        delete order.creationFeePaid;
        IInverseProjected1155(asset).safeTransferFrom(
            address(this),
            msg.sender,
            order.assetId,
            assetAmount,
            bytes("")
        );
        emit OrderCancelled(asset, order.assetId, orderId);
    }
}
