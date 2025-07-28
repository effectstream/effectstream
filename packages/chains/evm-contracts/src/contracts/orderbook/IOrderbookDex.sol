// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";

/// @notice Facilitates base-chain trading of assets that are living on a different app-chain.
/// @dev Orders are identified by an asset-specific unique incremental `orderId`.
interface IOrderbookDex is IERC1155Receiver {
    struct FeeInfo {
        /// @dev The maker fee collected from the seller when a sell order is filled. Expressed in basis points.
        uint256 makerFee;
        /// @dev The taker fee collected from the buyer when a sell order is filled. Expressed in basis points.
        uint256 takerFee;
        /// @dev Flag indicating whether the fees are set.
        bool set;
    }

    struct Order {
        /// @dev The asset's unique token identifier.
        uint256 assetId;
        /// @dev The amount of the asset that is available to be sold.
        uint256 assetAmount;
        /// @dev The price per one unit of asset.
        uint256 pricePerAsset;
        /// @dev The seller's address.
        address payable seller;
        /// @dev The maker fee in basis points, set when order is created, defined by the asset's fee info.
        uint256 makerFee;
        /// @dev The taker fee in basis points, set when order is created, defined by the asset's fee info.
        uint256 takerFee;
        /// @dev The order creation fee paid by the seller when creating the order, refunded if sell order is cancelled.
        uint256 creationFeePaid;
    }

    /// @param user The address that claimed the balance.
    /// @param amount The amount that was claimed.
    event BalanceClaimed(address indexed user, uint256 amount);

    /// @param asset The asset's address (zero address if changing default fees).
    /// @param makerFee The new maker fee in basis points.
    /// @param takerFee The new taker fee in basis points.
    event FeeInfoChanged(address indexed asset, uint256 makerFee, uint256 takerFee);

    /// @param asset The asset's address.
    /// @param assetId The asset's unique token identifier.
    /// @param orderId The order's asset-specific unique identifier.
    /// @param seller The seller's address.
    /// @param assetAmount The amount of the asset that has been put for sale.
    /// @param pricePerAsset The requested price per one unit of asset.
    /// @param makerFee The maker fee in basis points.
    /// @param takerFee The taker fee in basis points.
    event OrderCreated(
        address indexed asset,
        uint256 indexed assetId,
        uint256 indexed orderId,
        address seller,
        uint256 assetAmount,
        uint256 pricePerAsset,
        uint256 makerFee,
        uint256 takerFee
    );

    /// @param asset The asset's address.
    /// @param assetId The asset's unique token identifier.
    /// @param orderId The order's asset-specific unique identifier.
    /// @param seller The seller's address.
    /// @param buyer The buyer's address.
    /// @param assetAmount The amount of the asset that was traded.
    /// @param pricePerAsset The price per one unit of asset that was paid.
    /// @param makerFeeCollected The maker fee in native tokens that was collected.
    /// @param takerFeeCollected The taker fee in native tokens that was collected.
    event OrderFilled(
        address indexed asset,
        uint256 indexed assetId,
        uint256 indexed orderId,
        address seller,
        address buyer,
        uint256 assetAmount,
        uint256 pricePerAsset,
        uint256 makerFeeCollected,
        uint256 takerFeeCollected
    );

    /// @param asset The asset's address.
    /// @param assetId The asset's unique token identifier.
    /// @param orderId The order's asset-specific unique identifier.
    event OrderCancelled(address indexed asset, uint256 indexed assetId, uint256 indexed orderId);

    /// @param oldFee The old fee value.
    /// @param newFee The new fee value.
    event OrderCreationFeeChanged(uint256 oldFee, uint256 newFee);

    /// @param receiver The address that received the fees.
    /// @param amount The amount of fees that were withdrawn.
    event FeesWithdrawn(address indexed receiver, uint256 amount);

    /// @notice The balance of `user` that's claimable by `claim` function.
    function balances(address user) external view returns (uint256);

    /// @notice Withdraw the claimable balance of the caller.
    function claim() external;

    /// @notice The `orderId` of the next sell order for specific `asset`.
    function currentOrderId(address asset) external view returns (uint256);

    /// @notice The total amount of fees collected by the contract.
    function collectedFees() external view returns (uint256);

    /// @notice The default maker fee, used if fee information for asset is not set.
    function defaultMakerFee() external view returns (uint256);

    /// @notice The default taker fee, used if fee information for asset is not set.
    function defaultTakerFee() external view returns (uint256);

    /// @notice The flat fee paid by the seller when creating a sell order, to prevent spam.
    function orderCreationFee() external view returns (uint256);

    /// @notice The maximum fee, maker/taker fees cannot be set to exceed this amount.
    function maxFee() external view returns (uint256);

    /// @notice The fee information of `asset`.
    function getAssetFeeInfo(address asset) external view returns (FeeInfo memory);

    /// @notice Returns the asset fees if set, otherwise returns the default fees.
    function getAssetAppliedFees(
        address asset
    ) external view returns (uint256 makerFee, uint256 takerFee);

    /// @notice Set the fee information of `asset`. Executable only by the owner.
    /// @dev MUST revert if `makerFee` or `takerFee` exceeds `maxFee`.
    /// MUST revert if called by unauthorized account.
    function setAssetFeeInfo(address asset, uint256 makerFee, uint256 takerFee) external;

    /// @notice Set the default fee information that is used if fee information for asset is not set. Executable only by the owner.
    /// @dev MUST revert if `makerFee` or `takerFee` exceeds `maxFee`.
    /// MUST revert if called by unauthorized account.
    function setDefaultFeeInfo(uint256 makerFee, uint256 takerFee) external;

    /// @notice Set the flat fee paid by the seller when creating a sell order, to prevent spam. Executable only by the owner.
    /// @dev MUST revert if called by unauthorized account.
    function setOrderCreationFee(uint256 fee) external;

    /// @notice Returns the Order struct information about an order identified by the `orderId` for specific `asset`.
    function getOrder(address asset, uint256 orderId) external view returns (Order memory);

    /// @notice Creates a sell order for the `assetAmount` of `asset` with ID `assetId` at `pricePerAsset`. Requires payment of `orderCreationFee`.
    /// @dev The order information is saved in a mapping `asset -> orderId -> Order`, with `orderId` being an asset-specific unique incremental identifier.
    /// MUST transfer the `assetAmount` of `asset` with ID `assetId` from the seller to the contract.
    /// MUST emit `OrderCreated` event.
    /// MUST revert if `msg.value` is less than `orderCreationFee`.
    /// @return The asset-specific unique identifier of the created order.
    function createSellOrder(
        address asset,
        uint256 assetId,
        uint256 assetAmount,
        uint256 pricePerAsset
    ) external payable returns (uint256);

    /// @notice Creates a batch of sell orders for the `assetAmount` of `asset` with ID `assetId` at `pricePerAsset`. Requires payment of `orderCreationFee` times the amount of orders.
    /// @dev This is a batched version of `createSellOrder` that simply iterates through the arrays to call said function.
    /// MUST revert if `msg.value` is less than `orderCreationFee * assetIds.length`.
    /// @return The asset-specific unique identifiers of the created orders.
    function createBatchSellOrder(
        address asset,
        uint256[] memory assetIds,
        uint256[] memory assetAmounts,
        uint256[] memory pricesPerAssets
    ) external payable returns (uint256[] memory);

    /// @notice Consecutively fills an array of orders of `asset` identified by the asset-specific `orderId` of each order,
    /// by providing an exact amount of ETH and requesting a specific minimum amount of asset to receive.
    /// @dev Transfers portions of msg.value to the orders' sellers according to the price.
    /// The sum of asset amounts of filled orders MUST be at least `minimumAsset`.
    /// If msg.value is more than the sum of orders' prices, it MUST refund the excess back to `msg.sender`.
    /// MUST decrease the `assetAmount` parameter for the specified order according to how much of it was filled,
    /// and transfer that amount of the order's `asset` with ID `assetId` to the buyer.
    /// MUST emit `OrderFilled` event for each order accordingly.
    function fillOrdersExactEth(
        address asset,
        uint256 minimumAsset,
        uint256[] memory orderIds
    ) external payable;

    /// @notice Consecutively fills an array of orders identified by the asset-specific `orderId` of each order,
    /// by providing a possibly surplus amount of ETH and requesting an exact amount of asset to receive.
    /// @dev Transfers portions of msg.value to the orders' sellers according to the price.
    /// The sum of asset amounts of filled orders MUST be exactly `assetAmount`. Excess ETH MUST be returned back to `msg.sender`.
    /// MUST decrease the `assetAmount` parameter for the specified order according to how much of it was filled,
    /// and transfer that amount of the order's `asset` with ID `assetId` to the buyer.
    /// MUST emit `OrderFilled` event for each order accordingly.
    /// If msg.value is more than the sum of orders' prices, it MUST refund the difference back to `msg.sender`.
    function fillOrdersExactAsset(
        address asset,
        uint256 assetAmount,
        uint256[] memory orderIds
    ) external payable;

    /// @notice Cancels the sell order of `asset` with asset-specific `orderId`, transferring the order's assets back to the seller.
    /// @dev MUST revert if the order's seller is not `msg.sender`.
    /// MUST change the `assetAmount` parameter for the specified order to `0`.
    /// MUST emit `OrderCancelled` event.
    /// MUST transfer the order's `assetAmount` of `asset` with `assetId` back to the seller.
    function cancelSellOrder(address asset, uint256 orderId) external;

    /// @notice Cancels a batch of sell orders of `asset` with asset-specific `orderIds`, transferring the orders' assets back to the seller.
    /// @dev This is a batched version of `cancelSellOrder` that simply iterates through the array to call said function.
    function cancelBatchSellOrder(address asset, uint256[] memory orderIds) external;

    /// @notice Withdraws the contract balance (containing collected fees) to the owner. Executable only by the owner.
    /// @dev MUST transfer the entire contract balance to the owner.
    /// MUST revert if called by unauthorized account.
    /// MUST emit `FeesWithdrawn` event.
    function withdrawFees() external;
}
