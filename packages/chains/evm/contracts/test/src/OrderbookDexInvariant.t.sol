// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.18;

import {CheatCodes} from "../lib/cheatcodes.sol";
import {CTest} from "../lib/ctest.sol";

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {IInverseAppProjected1155} from "../../src/contracts/token/IInverseAppProjected1155.sol";
import {InverseAppProjected1155} from "../../src/contracts/token/InverseAppProjected1155.sol";
import {IOrderbookDex} from "../../src/contracts/orderbook/IOrderbookDex.sol";
import {OrderbookDex} from "../../src/contracts/orderbook/OrderbookDex.sol";
import {OrderbookDexProxy} from "../../src/contracts/Proxy/OrderbookDexProxy.sol";

contract AssetHandler is CTest, ERC1155Holder {
    CheatCodes vm = CheatCodes(HEVM_ADDRESS);
    IOrderbookDex public dex;
    IInverseAppProjected1155 asset;

    constructor(IInverseAppProjected1155 _asset, IOrderbookDex _dex) {
        asset = _asset;
        dex = _dex;
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 value,
        bytes calldata data
    ) public {
        vm.assume(asset.balanceOf(from, id) >= value);
        address sender = msg.sender;
        vm.prank(from);
        asset.setApprovalForAll(sender, true);
        vm.prank(sender);
        asset.safeTransferFrom(from, to, id, value, data);
    }

    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] calldata ids,
        uint256[] calldata values,
        bytes calldata data
    ) public {
        vm.assume(ids.length == values.length);
        for (uint256 i; i < ids.length; ++i) {
            vm.assume(asset.balanceOf(from, ids[i]) >= values[i]);
        }
        address sender = msg.sender;
        vm.prank(from);
        asset.setApprovalForAll(sender, true);
        vm.prank(sender);
        asset.safeBatchTransferFrom(from, to, ids, values, data);
    }
}

contract OrderbookDexHandler is CTest, ERC1155Holder {
    CheatCodes vm = CheatCodes(HEVM_ADDRESS);
    IOrderbookDex public dex;
    IInverseAppProjected1155 asset;

    // Reasonable limits resulting in acceptable testing time
    uint256 constant MAX_ASSET_AMOUNT = 100 ether;
    uint256 constant MAX_PRICE = 1 ether;
    uint256 constant MAX_BATCH_CREATE_SELL_ORDER = 50;
    uint256 constant MAX_BATCH_CANCEL_SELL_ORDER = 10;
    uint256 constant MAX_ORDER_FILL_LENGTH = 5;

    // Helper variables
    mapping(uint256 tokenId => uint256) buyerTokenBalanceBefore;
    mapping(uint256 tokenId => uint256) expectedTokenBalanceGain;
    mapping(uint256 orderId => bool) orderIdUsed;
    uint256[] newOrderIds;
    uint256 public previousOrderId;

    address internal currentActor;

    modifier useActor(uint256 actorIndexSeed) {
        _useActor(actorIndexSeed);
        _;
        vm.stopPrank();
    }

    function _useActor(uint256 actorIndexSeed) internal {
        uint256 actorIndex = bound(actorIndexSeed, 1, 100);
        currentActor = address(uint160(uint256(keccak256(abi.encodePacked(actorIndex)))));
        vm.startPrank(currentActor);
    }

    constructor(IInverseAppProjected1155 _asset, IOrderbookDex _dex) {
        asset = _asset;
        dex = _dex;
    }

    function createSellOrder(
        uint256 assetId,
        uint256 assetAmount,
        uint256 price,
        uint256 actorIndexSeed
    ) public useActor(actorIndexSeed) returns (uint256) {
        // Bound amount and price to reasonable limits, mint the asset and set approval for the dex
        assetAmount = bound(assetAmount, 1, MAX_ASSET_AMOUNT);
        price = bound(price, 1, MAX_PRICE);
        assetId = asset.mint(assetAmount, "");
        asset.setApprovalForAll(address(dex), true);

        // Take note of the previous order id
        previousOrderId = dex.currentOrderId(address(asset));

        uint256 orderCreationFee = dex.orderCreationFee();
        vm.deal(currentActor, orderCreationFee);

        // Execute the sell order creation
        return
            dex.createSellOrder{value: orderCreationFee}(
                address(asset),
                assetId,
                assetAmount,
                price
            );
    }

    function createBatchSellOrder(
        uint256[] memory assetAmounts,
        uint256[] memory pricesPerAssets,
        uint256 actorIndexSeed
    ) public useActor(actorIndexSeed) returns (uint256[] memory) {
        // Use the smaller of the input arrays length and bound it to a reasonable limit
        uint256 smallestLength = assetAmounts.length;
        if (pricesPerAssets.length < smallestLength) {
            smallestLength = pricesPerAssets.length;
        }
        smallestLength = bound(smallestLength, 0, MAX_BATCH_CREATE_SELL_ORDER);

        // Bound amounts and prices to reasonable limits, mint the assets and set approval for the dex
        uint256[] memory newAssetIds = new uint256[](smallestLength);
        uint256[] memory newAssetAmounts = new uint256[](smallestLength);
        uint256[] memory newPricesPerAssets = new uint256[](smallestLength);
        for (uint256 i; i < smallestLength; ++i) {
            newAssetAmounts[i] = bound(assetAmounts[i], 1, MAX_ASSET_AMOUNT);
            newPricesPerAssets[i] = bound(pricesPerAssets[i], 1, MAX_PRICE);
            newAssetIds[i] = asset.mint(newAssetAmounts[i], "");
        }
        asset.setApprovalForAll(address(dex), true);

        uint256 orderCreationFee = dex.orderCreationFee();
        vm.deal(currentActor, orderCreationFee * newAssetIds.length);

        // Execute the batch sell order creation
        return
            dex.createBatchSellOrder{value: orderCreationFee * newAssetIds.length}(
                address(asset),
                newAssetIds,
                newAssetAmounts,
                newPricesPerAssets
            );
    }

    function fillOrdersExactEth(
        uint256 minimumAsset,
        uint256[] memory orderIds,
        uint256 actorIndexSeed
    ) public payable useActor(actorIndexSeed) {
        // Bound the input length to a reasonable limit
        uint256 inputLength = orderIds.length;
        inputLength = bound(inputLength, 0, MAX_ORDER_FILL_LENGTH);

        // Calculate the sum of the asset amounts and prices of the orders
        uint256 sumAssetAmount;
        uint256 sumPrice;
        for (uint256 i; i < inputLength; ++i) {
            IOrderbookDex.Order memory order = dex.getOrder(address(asset), orderIds[i]);

            if (!orderIdUsed[orderIds[i]]) {
                sumAssetAmount += order.assetAmount;
                sumPrice += order.pricePerAsset * order.assetAmount;
                orderIdUsed[orderIds[i]] = true;
                newOrderIds.push(orderIds[i]);
            }
        }
        inputLength = newOrderIds.length;

        // Cap the asset amount to the sum of the asset amounts of the orders
        if (minimumAsset > sumAssetAmount) {
            minimumAsset = sumAssetAmount;
        }

        // Set current actor's balance to expected total price to avoid revert
        uint256 value = sumPrice;
        (, uint256 takerFee) = dex.getAssetAppliedFees(address(asset));
        value += (value * takerFee) / 10000;
        vm.deal(currentActor, value);

        // Take note of buyer's tokens balances and orders' asset amounts before filling orders
        // for the assertions later
        uint256[] memory orderAssetAmountBefore = new uint256[](inputLength);
        for (uint256 i; i < inputLength; ++i) {
            IOrderbookDex.Order memory order = dex.getOrder(address(asset), newOrderIds[i]);
            buyerTokenBalanceBefore[order.assetId] = asset.balanceOf(currentActor, order.assetId);
            orderAssetAmountBefore[i] = order.assetAmount;
        }

        // Execute the fills
        dex.fillOrdersExactEth{value: value}(address(asset), minimumAsset, newOrderIds);

        // Calculate the expected token balance gain for each token
        for (uint256 i; i < inputLength; ++i) {
            IOrderbookDex.Order memory order = dex.getOrder(address(asset), newOrderIds[i]);
            expectedTokenBalanceGain[order.assetId] +=
                orderAssetAmountBefore[i] -
                order.assetAmount;
        }

        // Assert that the buyer's token balances have increased by the expected amount (that was credited from the orders' asset amounts)
        for (uint256 i; i < inputLength; ++i) {
            IOrderbookDex.Order memory order = dex.getOrder(address(asset), newOrderIds[i]);
            assertEq(
                asset.balanceOf(currentActor, order.assetId),
                buyerTokenBalanceBefore[order.assetId] + expectedTokenBalanceGain[order.assetId]
            );
        }

        // Clean-up
        for (uint256 i; i < inputLength; ++i) {
            IOrderbookDex.Order memory order = dex.getOrder(address(asset), newOrderIds[i]);
            delete expectedTokenBalanceGain[order.assetId];
            delete orderIdUsed[newOrderIds[i]];
        }
        delete newOrderIds;
    }

    function fillOrdersExactAsset(
        uint256 assetAmount,
        uint256[] memory orderIds,
        uint256 actorIndexSeed
    ) public payable useActor(actorIndexSeed) {
        // Bound the input length to a reasonable limit
        uint256 inputLength = orderIds.length;
        inputLength = bound(inputLength, 0, MAX_ORDER_FILL_LENGTH);

        // Calculate the sum of the asset amounts and prices of the orders
        uint256 sumAssetAmount;
        uint256 sumPrice;
        for (uint256 i; i < inputLength; ++i) {
            IOrderbookDex.Order memory order = dex.getOrder(address(asset), orderIds[i]);

            if (!orderIdUsed[orderIds[i]]) {
                sumAssetAmount += order.assetAmount;
                sumPrice += order.pricePerAsset * order.assetAmount;
                orderIdUsed[orderIds[i]] = true;
                newOrderIds.push(orderIds[i]);
            }
        }
        inputLength = newOrderIds.length;

        // Cap the asset amount to the sum of the asset amounts of the orders
        if (assetAmount > sumAssetAmount) {
            assetAmount = sumAssetAmount;
        }

        // Set current actor's balance to expected total price plus 100 to avoid revert and
        // to provide surplus which should be refunded
        uint256 value = sumPrice + 100;
        (, uint256 takerFee) = dex.getAssetAppliedFees(address(asset));
        value += (value * takerFee) / 10000;
        vm.deal(currentActor, value);

        // Take note of buyer's tokens balances and orders' asset amounts before filling orders
        // for the assertions later
        uint256[] memory orderAssetAmountBefore = new uint256[](inputLength);
        for (uint256 i; i < inputLength; ++i) {
            IOrderbookDex.Order memory order = dex.getOrder(address(asset), newOrderIds[i]);
            buyerTokenBalanceBefore[order.assetId] = asset.balanceOf(currentActor, order.assetId);
            orderAssetAmountBefore[i] = order.assetAmount;
        }

        // Execute the fills
        dex.fillOrdersExactAsset{value: value}(address(asset), assetAmount, newOrderIds);

        // Calculate the expected token balance gain for each token
        for (uint256 i; i < inputLength; ++i) {
            IOrderbookDex.Order memory order = dex.getOrder(address(asset), newOrderIds[i]);
            expectedTokenBalanceGain[order.assetId] +=
                orderAssetAmountBefore[i] -
                order.assetAmount;
        }

        // Assert that the buyer's token balances have increased by the expected amount (that was credited from the orders' asset amounts)
        for (uint256 i; i < inputLength; ++i) {
            IOrderbookDex.Order memory order = dex.getOrder(address(asset), newOrderIds[i]);
            assertEq(
                asset.balanceOf(currentActor, order.assetId),
                buyerTokenBalanceBefore[order.assetId] + expectedTokenBalanceGain[order.assetId]
            );
        }

        // Clean-up
        for (uint256 i; i < inputLength; ++i) {
            IOrderbookDex.Order memory order = dex.getOrder(address(asset), newOrderIds[i]);
            delete expectedTokenBalanceGain[order.assetId];
            delete orderIdUsed[newOrderIds[i]];
        }
        delete newOrderIds;
    }

    function cancelSellOrder(
        uint256 orderId,
        uint256 actorIndexSeed
    ) public useActor(actorIndexSeed) {
        // If the order does not exist, get the last order id
        if (dex.getOrder(address(asset), orderId).assetAmount == 0) {
            orderId = dex.currentOrderId(address(asset));
            // If there are no orders, return
            if (orderId == 0) {
                return;
            } else {
                orderId--;
            }
        }

        // Assert that you can't cancel an order if you're not the seller
        address seller = dex.getOrder(address(asset), orderId).seller;
        if (currentActor != seller) {
            vm.expectRevert(
                abi.encodeWithSelector(OrderbookDex.Unauthorized.selector, currentActor)
            );
            dex.cancelSellOrder(address(asset), orderId);
        }

        // Prank the order's seller
        vm.startPrank(seller);

        // Execute the cancel
        dex.cancelSellOrder(address(asset), orderId);
    }

    function cancelBatchSellOrder(
        uint256[] memory orderIds,
        uint256 actorIndexSeed
    ) public useActor(actorIndexSeed) {
        // Bound the input length to a reasonable limit
        uint256 len = bound(orderIds.length, 0, MAX_BATCH_CANCEL_SELL_ORDER);

        // Create new orders if the order does not exist or the seller is not the current actor
        uint256[] memory _newOrderIds = new uint256[](len);
        for (uint256 i; i < len; ++i) {
            IOrderbookDex.Order memory order = dex.getOrder(address(asset), orderIds[i]);
            if (order.assetAmount == 0 || order.seller != currentActor) {
                uint256 x = uint256(keccak256(abi.encodePacked(i)));
                _newOrderIds[i] = this.createSellOrder(x, x, x, actorIndexSeed);
            } else {
                _newOrderIds[i] = orderIds[i];
            }
        }

        // If this.createSellOrder was called, the prank was stopped, so we need to start it again
        if (len > 0) {
            vm.startPrank(currentActor);
        }

        // Execute the batch cancel
        dex.cancelBatchSellOrder(address(asset), _newOrderIds);
    }

    fallback() external payable {}
}

contract OrderbookDexInvariantTest is CTest, ERC1155Holder {
    using Address for address payable;

    CheatCodes vm = CheatCodes(HEVM_ADDRESS);
    OrderbookDex public dex;
    OrderbookDexHandler public dexHandler;
    IInverseAppProjected1155 asset;
    AssetHandler public assetHandler;
    uint256 makerFee = 40;
    uint256 takerFee = 60;
    uint256 orderCreationFee = 10000 gwei;

    function setUp() public {
        asset = new InverseAppProjected1155("Gold", "GOLD", address(this));
        dex = OrderbookDex(
            address(
                new OrderbookDexProxy(
                    address(new OrderbookDex()),
                    address(this),
                    makerFee,
                    takerFee,
                    orderCreationFee
                )
            )
        );
        dexHandler = new OrderbookDexHandler(asset, dex);
        assetHandler = new AssetHandler(asset, dex);
        targetContract(address(assetHandler));
        targetContract(address(dexHandler));
    }

    function invariant_ordersAssetAmountEqualsContractTokenBalance() public {
        for (uint256 i; i < dex.currentOrderId(address(asset)); ++i) {
            IOrderbookDex.Order memory order = dex.getOrder(address(asset), i);
            assertEq(order.assetAmount, asset.balanceOf(address(dex), order.assetId));
        }
    }

    function invariant_orderIdIsIncremental() public {
        uint256 currentId = dex.currentOrderId(address(asset));
        uint256 previousId = dexHandler.previousOrderId();
        if (currentId == previousId) {
            assertEq(currentId, 0);
            return;
        }
        assertGe(currentId, previousId);
    }

    function invariant_contractHasBalanceAtLeastOfCollectedFees() public {
        assertGe(address(dex).balance, dex.collectedFees());
    }

    receive() external payable {}
}
