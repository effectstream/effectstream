// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.18;

import {CheatCodes} from "../lib/cheatcodes.sol";
import {CTest} from "../lib/ctest.sol";
import "../lib/console.sol";

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {IInverseAppProjected1155} from "../../src/contracts/token/IInverseAppProjected1155.sol";
import {InverseAppProjected1155} from "../../src/contracts/token/InverseAppProjected1155.sol";
import {IOrderbookDex} from "../../src/contracts/orderbook/IOrderbookDex.sol";
import {OrderbookDex} from "../../src/contracts/orderbook/OrderbookDex.sol";
import {OrderbookDexProxy} from "../../src/contracts/Proxy/OrderbookDexProxy.sol";

contract OrderbookDexTest is CTest, ERC1155Holder {
    using Address for address payable;

    CheatCodes vm = CheatCodes(HEVM_ADDRESS);
    OrderbookDex public dex;
    IInverseAppProjected1155 asset;
    uint256 makerFee = 40;
    uint256 takerFee = 60;
    uint256 orderCreationFee = 10000 gwei;
    address alice = vm.addr(uint256(keccak256(abi.encodePacked("alice"))));
    address boris = vm.addr(uint256(keccak256(abi.encodePacked("boris"))));

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
        asset.setApprovalForAll(address(dex), true);
        vm.deal(alice, 1_000 ether);
        vm.deal(boris, 1_000 ether);
    }

    function testFuzz_createSellOrder_satisfiesRequirements(
        uint256 assetAmount,
        uint256 pricePerAsset
    ) public {
        vm.assume(assetAmount > 0 && pricePerAsset > 0);

        uint256 orderId = dex.currentOrderId(address(asset));
        uint256 assetId = asset.mint(assetAmount, "");

        vm.expectEmit(true, true, true, true);
        emit IOrderbookDex.OrderCreated(
            address(asset),
            assetId,
            orderId,
            address(this),
            assetAmount,
            pricePerAsset,
            makerFee,
            takerFee
        );
        dex.createSellOrder{value: orderCreationFee}(
            address(asset),
            assetId,
            assetAmount,
            pricePerAsset
        );

        IOrderbookDex.Order memory order = dex.getOrder(address(asset), orderId);
        assertEq(order.assetId, assetId);
        assertEq(order.assetAmount, assetAmount);
        assertEq(order.pricePerAsset, pricePerAsset);
        assertEq(asset.balanceOf(address(dex), assetId), assetAmount);
    }

    function testFuzz_createBatchSellOrder_satisfiesRequirements(uint256 orderCount) public {
        orderCount = bound(orderCount, 0, 100);
        uint256[] memory assetIds = new uint256[](orderCount);
        uint256[] memory assetAmounts = new uint256[](orderCount);
        uint256[] memory pricesPerAssets = new uint256[](orderCount);

        for (uint256 i = 0; i < orderCount; ++i) {
            assetAmounts[i] = i == 0 ? 1 : i;
            pricesPerAssets[i] = i == 0 ? 1 : i;
            assetIds[i] = asset.mint(assetAmounts[i], "");
        }

        uint256 orderId = dex.currentOrderId(address(asset));
        for (uint256 i = 0; i < orderCount; ++i) {
            vm.expectEmit(true, true, true, true);
            emit IOrderbookDex.OrderCreated(
                address(asset),
                assetIds[i],
                orderId + i,
                address(this),
                assetAmounts[i],
                pricesPerAssets[i],
                makerFee,
                takerFee
            );
        }

        uint256[] memory orderIds = dex.createBatchSellOrder{
            value: orderCreationFee * assetIds.length
        }(address(asset), assetIds, assetAmounts, pricesPerAssets);

        for (uint256 i = 0; i < orderCount; ++i) {
            IOrderbookDex.Order memory order = dex.getOrder(address(asset), orderIds[i]);
            assertEq(order.assetId, assetIds[i]);
            assertEq(order.assetAmount, assetAmounts[i]);
            assertEq(order.pricePerAsset, pricesPerAssets[i]);
            assertEq(asset.balanceOf(address(dex), assetIds[i]), assetAmounts[i]);
        }
    }

    function testFuzz_createBatchSellOrder_reverts_ifInvalidArrayLength(
        uint256 length1,
        uint256 length2,
        uint256 length3
    ) public {
        length1 = bound(length1, 0, 1000);
        length2 = bound(length2, 0, 1000);
        length3 = bound(length3, 0, 1000);
        vm.assume(length1 != length2 || length2 != length3);
        uint256[] memory assetIds = new uint256[](length1);
        uint256[] memory assetAmounts = new uint256[](length2);
        uint256[] memory pricesPerAssets = new uint256[](length3);

        vm.expectRevert(OrderbookDex.InvalidArrayLength.selector);
        dex.createBatchSellOrder{value: orderCreationFee * assetIds.length}(
            address(asset),
            assetIds,
            assetAmounts,
            pricesPerAssets
        );
    }

    function testFuzz_createSellOrder_reverts_ifAssetAmountIsZero(uint256 pricePerAsset) public {
        uint256 assetId = asset.mint(0, "");

        vm.expectRevert(abi.encodeWithSelector(OrderbookDex.InvalidInput.selector, 0));
        dex.createSellOrder{value: orderCreationFee}(address(asset), assetId, 0, pricePerAsset);
    }

    function testFuzz_fillOrdersExactEth_transfersCorrectly(uint256 price) public {
        uint256 ordersCount = 5;
        vm.assume(price / ordersCount > 0);
        vm.assume(price < type(uint256).max / ordersCount / orderCreationFee);
        uint256[] memory orderIds = new uint256[](ordersCount);
        address payable[] memory sellers = new address payable[](ordersCount);
        uint256[] memory assetIds = new uint256[](ordersCount);
        uint256 totalAssetAmount;
        address buyer = address(this);
        for (uint256 i = 0; i < ordersCount; i++) {
            address payable seller = payable(vm.addr(uint256(keccak256(abi.encodePacked(i)))));
            vm.deal(seller, orderCreationFee);
            uint256 assetAmount = price / (ordersCount - i);
            uint256 pricePerAsset = price / assetAmount;
            orderIds[i] = dex.currentOrderId(address(asset));
            sellers[i] = seller;
            vm.startPrank(seller);
            assetIds[i] = asset.mint(assetAmount, "");
            asset.setApprovalForAll(address(dex), true);
            dex.createSellOrder{value: orderCreationFee}(
                address(asset),
                assetIds[i],
                assetAmount,
                pricePerAsset
            );
            totalAssetAmount += assetAmount;
        }

        {
            vm.deal(buyer, type(uint256).max);
            uint256 buyerBalanceBefore = buyer.balance;
            uint256[] memory sellersBalancesBefore = new uint256[](ordersCount);
            uint256[] memory expectedPayouts = new uint256[](ordersCount);
            uint256[] memory ordersAssetAmounts = new uint256[](ordersCount);
            uint256 totalExpectedPayout;
            for (uint256 i = 0; i < ordersCount; i++) {
                IOrderbookDex.Order memory order = dex.getOrder(address(asset), orderIds[i]);
                expectedPayouts[i] = order.pricePerAsset * order.assetAmount;
                ordersAssetAmounts[i] = order.assetAmount;
                totalExpectedPayout += expectedPayouts[i];
                sellersBalancesBefore[i] = dex.balances(sellers[i]);
                vm.expectEmit(true, true, true, true);
                emit IOrderbookDex.OrderFilled(
                    address(asset),
                    assetIds[i],
                    orderIds[i],
                    sellers[i],
                    buyer,
                    order.assetAmount,
                    order.pricePerAsset,
                    (expectedPayouts[i] * makerFee) / 10000,
                    (expectedPayouts[i] * takerFee) / 10000
                );
            }
            vm.startPrank(buyer);
            dex.fillOrdersExactEth{
                value: totalExpectedPayout + (totalExpectedPayout * takerFee) / 10000 + 1000
            }(address(asset), totalAssetAmount, orderIds);

            {
                uint256 takerFeeTotal;
                for (uint256 i = 0; i < ordersCount; i++) {
                    takerFeeTotal += (expectedPayouts[i] * takerFee) / 10000;
                }
                assertEq(buyer.balance, buyerBalanceBefore - (totalExpectedPayout + takerFeeTotal));
            }
            for (uint256 i = 0; i < ordersCount; i++) {
                IOrderbookDex.Order memory order = dex.getOrder(address(asset), orderIds[i]);
                assertEq(
                    dex.balances(sellers[i]),
                    sellersBalancesBefore[i] +
                        expectedPayouts[i] -
                        ((expectedPayouts[i] * makerFee) / 10000)
                );
                assertEq(order.assetAmount, 0);
                assertEq(asset.balanceOf(address(dex), order.assetId), 0);
                assertEq(asset.balanceOf(buyer, order.assetId), ordersAssetAmounts[i]);
            }

            for (uint256 i = 0; i < ordersCount; i++) {
                uint256 sellerBalancesBefore = sellers[i].balance;
                uint256 sellerBalanceInDex = dex.balances(sellers[i]);
                vm.startPrank(sellers[i]);
                dex.claim();
                assertEq(sellers[i].balance, sellerBalancesBefore + sellerBalanceInDex);
            }
        }
    }

    function testFuzz_fillOrdersExactAsset_transfersCorrectly(uint256 price) public {
        uint256 ordersCount = 5;
        vm.assume(price / ordersCount > 0);
        vm.assume(price < type(uint256).max / ordersCount / orderCreationFee);
        uint256[] memory orderIds = new uint256[](ordersCount);
        address payable[] memory sellers = new address payable[](ordersCount);
        uint256[] memory assetIds = new uint256[](ordersCount);
        uint256 totalAssetAmount;
        address buyer = address(this);
        for (uint256 i = 0; i < ordersCount; i++) {
            address payable seller = payable(vm.addr(uint256(keccak256(abi.encodePacked(i)))));
            vm.deal(seller, orderCreationFee);
            uint256 assetAmount = price / (ordersCount - i);
            uint256 pricePerAsset = price / assetAmount;
            orderIds[i] = dex.currentOrderId(address(asset));
            sellers[i] = seller;
            vm.startPrank(seller);
            assetIds[i] = asset.mint(assetAmount, "");
            asset.setApprovalForAll(address(dex), true);
            dex.createSellOrder{value: orderCreationFee}(
                address(asset),
                assetIds[i],
                assetAmount,
                pricePerAsset
            );
            totalAssetAmount += assetAmount;
        }

        {
            vm.deal(buyer, type(uint256).max);
            uint256 buyerBalanceBefore = buyer.balance;
            uint256[] memory sellersBalancesBefore = new uint256[](ordersCount);
            uint256[] memory expectedPayouts = new uint256[](ordersCount);
            uint256[] memory ordersAssetAmounts = new uint256[](ordersCount);
            uint256 totalExpectedPayout;
            for (uint256 i = 0; i < ordersCount; i++) {
                IOrderbookDex.Order memory order = dex.getOrder(address(asset), orderIds[i]);
                expectedPayouts[i] = order.pricePerAsset * order.assetAmount;
                ordersAssetAmounts[i] = order.assetAmount;
                totalExpectedPayout += expectedPayouts[i];
                sellersBalancesBefore[i] = dex.balances(sellers[i]);
                vm.expectEmit(true, true, true, true);
                emit IOrderbookDex.OrderFilled(
                    address(asset),
                    assetIds[i],
                    orderIds[i],
                    sellers[i],
                    buyer,
                    order.assetAmount,
                    order.pricePerAsset,
                    (expectedPayouts[i] * makerFee) / 10000,
                    (expectedPayouts[i] * takerFee) / 10000
                );
            }
            vm.startPrank(buyer);
            dex.fillOrdersExactAsset{
                value: totalExpectedPayout + (totalExpectedPayout * takerFee) / 10000 + 1000
            }(address(asset), totalAssetAmount, orderIds);

            {
                uint256 takerFeeTotal;
                for (uint256 i = 0; i < ordersCount; i++) {
                    takerFeeTotal += (expectedPayouts[i] * takerFee) / 10000;
                }
                assertEq(buyer.balance, buyerBalanceBefore - (totalExpectedPayout + takerFeeTotal));
            }
            for (uint256 i = 0; i < ordersCount; i++) {
                IOrderbookDex.Order memory order = dex.getOrder(address(asset), orderIds[i]);
                assertEq(
                    dex.balances(sellers[i]),
                    sellersBalancesBefore[i] +
                        expectedPayouts[i] -
                        ((expectedPayouts[i] * makerFee) / 10000)
                );
                assertEq(order.assetAmount, 0);
                assertEq(asset.balanceOf(address(dex), order.assetId), 0);
                assertEq(asset.balanceOf(buyer, order.assetId), ordersAssetAmounts[i]);
            }

            for (uint256 i = 0; i < ordersCount; i++) {
                uint256 sellerBalancesBefore = sellers[i].balance;
                uint256 sellerBalanceInDex = dex.balances(sellers[i]);
                vm.startPrank(sellers[i]);
                dex.claim();
                assertEq(sellers[i].balance, sellerBalancesBefore + sellerBalanceInDex);
            }
        }
    }

    function testFuzz_fillOrdersExactEth_transfersCorrectlyWithPartialFill(
        uint256 assetAmount,
        uint256 pricePerAsset,
        uint256 assetAmountToBuy
    ) public {
        vm.assume(assetAmount > 0 && pricePerAsset > 1);
        vm.assume(assetAmount < type(uint256).max / pricePerAsset / orderCreationFee);
        vm.assume(pricePerAsset < type(uint256).max / assetAmount);
        vm.assume(assetAmountToBuy < assetAmount);

        address buyer = alice;
        address payable seller = payable(address(this));
        vm.deal(buyer, (assetAmount * pricePerAsset * (10000 + takerFee)) / 10000);
        uint256 orderId = dex.currentOrderId(address(asset));
        vm.startPrank(seller);
        uint256 assetId = asset.mint(assetAmount, "");
        asset.setApprovalForAll(address(dex), true);
        dex.createSellOrder{value: orderCreationFee}(
            address(asset),
            assetId,
            assetAmount,
            pricePerAsset
        );

        uint256 buyerBalanceBefore = buyer.balance;
        uint256 sellerBalanceBefore = dex.balances(seller);
        uint256[] memory orderIds = new uint256[](1);
        orderIds[0] = orderId;
        uint256 purchaseCost = assetAmountToBuy * pricePerAsset;
        vm.startPrank(buyer);
        dex.fillOrdersExactEth{value: (purchaseCost + (purchaseCost * takerFee) / 10000)}(
            address(asset),
            assetAmountToBuy,
            orderIds
        );

        IOrderbookDex.Order memory order = dex.getOrder(address(asset), orderId);
        assertEq(
            buyer.balance,
            buyerBalanceBefore - (purchaseCost + (purchaseCost * takerFee) / 10000)
        );
        assertEq(
            dex.balances(seller),
            sellerBalanceBefore + (purchaseCost - (purchaseCost * makerFee) / 10000)
        );
        assertEq(order.assetAmount, assetAmount - assetAmountToBuy);
        assertEq(asset.balanceOf(address(dex), assetId), assetAmount - assetAmountToBuy);
        assertEq(asset.balanceOf(buyer, assetId), assetAmountToBuy);
    }

    function testFuzz_fillOrdersExactAsset_transfersCorrectlyWithPartialFill(
        uint256 assetAmount,
        uint256 pricePerAsset,
        uint256 assetAmountToBuy
    ) public {
        vm.assume(assetAmount > 0 && pricePerAsset > 0);
        vm.assume(assetAmount < type(uint256).max / pricePerAsset / orderCreationFee);
        vm.assume(pricePerAsset < type(uint256).max / assetAmount);
        vm.assume(assetAmountToBuy < assetAmount);

        address buyer = alice;
        address payable seller = payable(address(this));
        vm.deal(buyer, (assetAmount * pricePerAsset * (10000 + takerFee)) / 10000);
        uint256 orderId = dex.currentOrderId(address(asset));
        vm.startPrank(seller);
        uint256 assetId = asset.mint(assetAmount, "");
        asset.setApprovalForAll(address(dex), true);
        dex.createSellOrder{value: orderCreationFee}(
            address(asset),
            assetId,
            assetAmount,
            pricePerAsset
        );

        uint256 buyerBalanceBefore = buyer.balance;
        uint256 sellerBalanceBefore = dex.balances(seller);
        uint256[] memory orderIds = new uint256[](1);
        orderIds[0] = orderId;
        uint256 purchaseCost = assetAmountToBuy * pricePerAsset;
        vm.startPrank(buyer);
        dex.fillOrdersExactAsset{value: buyerBalanceBefore}(
            address(asset),
            assetAmountToBuy,
            orderIds
        );

        IOrderbookDex.Order memory order = dex.getOrder(address(asset), orderId);
        assertEq(
            buyer.balance,
            buyerBalanceBefore - (purchaseCost + (purchaseCost * takerFee) / 10000)
        );
        assertEq(
            dex.balances(seller),
            sellerBalanceBefore + (purchaseCost - (purchaseCost * makerFee) / 10000)
        );
        assertEq(order.assetAmount, assetAmount - assetAmountToBuy);
        assertEq(asset.balanceOf(address(dex), assetId), assetAmount - assetAmountToBuy);
        assertEq(asset.balanceOf(buyer, assetId), assetAmountToBuy);
    }

    function testFuzz_fillOrdersExactEth_refundsExcessValue(
        uint256 assetAmount,
        uint256 pricePerAsset
    ) public {
        uint256 multiplier = 3;
        vm.assume(assetAmount > 0 && pricePerAsset > 0);
        vm.assume(assetAmount < type(uint256).max / pricePerAsset / multiplier / orderCreationFee);
        vm.assume(pricePerAsset < type(uint256).max / assetAmount / multiplier);

        vm.deal(alice, assetAmount * pricePerAsset * multiplier);
        uint256 orderId = dex.currentOrderId(address(asset));
        uint256 assetId = asset.mint(assetAmount, "");
        dex.createSellOrder{value: orderCreationFee}(
            address(asset),
            assetId,
            assetAmount,
            pricePerAsset
        );

        uint256 purchaseCost = assetAmount * pricePerAsset;
        uint256 paidTakerFee = (purchaseCost * takerFee) / 10000;
        uint256 aliceBalanceBefore = alice.balance;
        uint256[] memory orderIds = new uint256[](1);
        orderIds[0] = orderId;
        vm.startPrank(alice);
        dex.fillOrdersExactEth{value: alice.balance}(address(asset), assetAmount, orderIds);
        assertEq(alice.balance, aliceBalanceBefore - (purchaseCost + paidTakerFee));
    }

    function testFuzz_fillOrdersExactAsset_refundsExcessValue(
        uint256 assetAmount,
        uint256 pricePerAsset
    ) public {
        uint256 multiplier = 3;
        vm.assume(assetAmount > 0 && pricePerAsset > 0);
        vm.assume(assetAmount < type(uint256).max / pricePerAsset / multiplier / orderCreationFee);
        vm.assume(pricePerAsset < type(uint256).max / assetAmount / multiplier);

        vm.deal(alice, assetAmount * pricePerAsset * multiplier);
        uint256 orderId = dex.currentOrderId(address(asset));
        uint256 assetId = asset.mint(assetAmount, "");
        dex.createSellOrder{value: orderCreationFee}(
            address(asset),
            assetId,
            assetAmount,
            pricePerAsset
        );

        uint256 purchaseCost = assetAmount * pricePerAsset;
        uint256 paidTakerFee = (purchaseCost * takerFee) / 10000;
        uint256 aliceBalanceBefore = alice.balance;
        uint256[] memory orderIds = new uint256[](1);
        orderIds[0] = orderId;
        vm.startPrank(alice);
        dex.fillOrdersExactAsset{value: alice.balance}(address(asset), assetAmount, orderIds);
        assertEq(alice.balance, aliceBalanceBefore - (purchaseCost + paidTakerFee));
    }

    function test_fillOrdersExactEth_wontFillOrderIfOrderWasCancelled() public {
        uint256 assetAmount = 100;
        uint256 pricePerAsset = 200;
        uint256 orderId = dex.currentOrderId(address(asset));
        uint256 assetId = asset.mint(assetAmount, "");
        dex.createSellOrder{value: orderCreationFee}(
            address(asset),
            assetId,
            assetAmount,
            pricePerAsset
        );
        dex.cancelSellOrder(address(asset), orderId);

        uint256 aliceBalanceBefore = alice.balance;
        uint256[] memory orderIds = new uint256[](1);
        orderIds[0] = orderId;
        vm.startPrank(alice);

        dex.fillOrdersExactEth{value: assetAmount * pricePerAsset}(address(asset), 0, orderIds);
        assertEq(alice.balance, aliceBalanceBefore);
    }

    function test_fillOrdersExactAsset_wontFillOrderIfOrderWasCancelled() public {
        uint256 assetAmount = 100;
        uint256 pricePerAsset = 200;
        uint256 orderId = dex.currentOrderId(address(asset));
        uint256 assetId = asset.mint(assetAmount, "");
        dex.createSellOrder{value: orderCreationFee}(
            address(asset),
            assetId,
            assetAmount,
            pricePerAsset
        );
        dex.cancelSellOrder(address(asset), orderId);

        uint256 aliceBalanceBefore = alice.balance;
        uint256[] memory orderIds = new uint256[](1);
        orderIds[0] = orderId;
        vm.startPrank(alice);

        dex.fillOrdersExactAsset{value: assetAmount * pricePerAsset}(address(asset), 0, orderIds);
        assertEq(alice.balance, aliceBalanceBefore);
    }

    function test_fillOrdersExactEth_reverts_ifInsufficientEndAmount() public {
        uint256 assetAmount = 10;
        uint256 pricePerAsset = 100;
        uint256 orderId = dex.currentOrderId(address(asset));
        uint256 assetId = asset.mint(assetAmount, "");
        dex.createSellOrder{value: orderCreationFee}(
            address(asset),
            assetId,
            assetAmount,
            pricePerAsset
        );

        address payable[] memory sellers = new address payable[](1);
        sellers[0] = payable(address(this));
        uint256[] memory orderIds = new uint256[](1);
        orderIds[0] = orderId;
        uint256 purchaseCost = assetAmount * pricePerAsset;
        uint256 paidTakerFee = (purchaseCost * takerFee) / 10000;
        vm.startPrank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                OrderbookDex.InsufficientEndAmount.selector,
                assetAmount + 1,
                assetAmount
            )
        );
        dex.fillOrdersExactEth{value: purchaseCost + paidTakerFee}(
            address(asset),
            assetAmount + 1,
            orderIds
        );
    }

    function test_fillOrdersExactAsset_reverts_ifInsufficientEndAmount() public {
        uint256 assetAmount = 10;
        uint256 pricePerAsset = 100;
        uint256 orderId = dex.currentOrderId(address(asset));
        uint256 assetId = asset.mint(assetAmount, "");
        dex.createSellOrder{value: orderCreationFee}(
            address(asset),
            assetId,
            assetAmount,
            pricePerAsset
        );

        address payable[] memory sellers = new address payable[](1);
        sellers[0] = payable(address(this));
        uint256[] memory orderIds = new uint256[](1);
        orderIds[0] = orderId;
        uint256 purchaseCost = assetAmount * pricePerAsset;
        uint256 paidTakerFee = (purchaseCost * takerFee) / 10000;
        vm.startPrank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                OrderbookDex.InsufficientEndAmount.selector,
                assetAmount + 1,
                assetAmount
            )
        );
        dex.fillOrdersExactAsset{value: purchaseCost + paidTakerFee}(
            address(asset),
            assetAmount + 1,
            orderIds
        );
    }

    function test_supportsInterface_returnsTrueForImplementedInterfaces() public {
        assertTrue(dex.supportsInterface(type(IERC165).interfaceId));
        assertTrue(dex.supportsInterface(type(IERC165).interfaceId));
        assertTrue(dex.supportsInterface(type(IOrderbookDex).interfaceId));
    }

    function testFuzz_cancelSellOrder_satisfiesRequirements(uint256 assetAmount) public {
        vm.assume(assetAmount > 0);
        uint256 assetId = asset.mint(assetAmount, "");
        uint256 orderId = dex.currentOrderId(address(asset));
        dex.createSellOrder{value: orderCreationFee}(address(asset), assetId, assetAmount, 200);

        vm.expectEmit(true, true, true, true);
        emit IOrderbookDex.OrderCancelled(address(asset), assetId, orderId);
        dex.cancelSellOrder(address(asset), orderId);
        IOrderbookDex.Order memory order = dex.getOrder(address(asset), orderId);
        assertEq(order.assetAmount, 0);
        assertEq(asset.balanceOf(address(dex), assetId), 0);
        assertEq(asset.balanceOf(address(this), assetId), assetAmount);
    }

    function test_cancelSellOrder_reverts_ifUnauthorized() public {
        uint256 orderId = dex.currentOrderId(address(asset));
        uint256 assetId = asset.mint(100, "");
        dex.createSellOrder{value: orderCreationFee}(address(asset), assetId, 100, 200);

        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(OrderbookDex.Unauthorized.selector, alice));
        dex.cancelSellOrder(address(asset), orderId);
    }

    function testFuzz_cancelBatchSellOrder_satisfiesRequirements(uint256 orderCount) public {
        orderCount = bound(orderCount, 0, 100);
        uint256[] memory assetIds = new uint256[](orderCount);
        uint256[] memory assetAmounts = new uint256[](orderCount);
        uint256[] memory pricesPerAssets = new uint256[](orderCount);

        for (uint256 i = 0; i < orderCount; ++i) {
            assetAmounts[i] = i == 0 ? 1 : i;
            pricesPerAssets[i] = i == 0 ? 1 : i;
            assetIds[i] = asset.mint(assetAmounts[i], "");
        }

        uint256 orderId = dex.currentOrderId(address(asset));

        uint256[] memory orderIds = dex.createBatchSellOrder{
            value: orderCreationFee * assetIds.length
        }(address(asset), assetIds, assetAmounts, pricesPerAssets);

        for (uint256 i = 0; i < orderCount; ++i) {
            vm.expectEmit(true, true, true, true);
            emit IOrderbookDex.OrderCancelled(address(asset), assetIds[i], orderId + i);
        }

        dex.cancelBatchSellOrder(address(asset), orderIds);

        for (uint256 i = 0; i < orderCount; ++i) {
            IOrderbookDex.Order memory order = dex.getOrder(address(asset), orderIds[i]);
            assertEq(order.assetAmount, 0);
            assertEq(asset.balanceOf(address(dex), assetIds[i]), 0);
            assertEq(asset.balanceOf(address(this), assetIds[i]), assetAmounts[i]);
        }
    }

    function test_cancelBatchSellOrder_reverts_ifUnauthorized() public {
        uint256 orderId = dex.currentOrderId(address(asset));
        uint256 assetId = asset.mint(100, "");
        dex.createSellOrder{value: orderCreationFee}(address(asset), assetId, 100, 200);

        uint256[] memory orderIds = new uint256[](1);
        orderIds[0] = orderId;

        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(OrderbookDex.Unauthorized.selector, alice));
        dex.cancelBatchSellOrder(address(asset), orderIds);
    }

    // Not really a test, was used to measure gas usage
    function test_fillOrders_getGasUsage() public {
        uint256 orderCount = 500;
        uint256[] memory assetIds = new uint256[](orderCount);
        uint256[] memory assetAmounts = new uint256[](orderCount);
        uint256[] memory pricesPerAssets = new uint256[](orderCount);

        uint256 totalPurchaseCost;
        for (uint256 i = 0; i < orderCount; ++i) {
            assetAmounts[i] = i + 1;
            pricesPerAssets[i] = i + 1;
            assetIds[i] = asset.mint(assetAmounts[i], "");
            totalPurchaseCost += assetAmounts[i] * pricesPerAssets[i];
        }
        uint256[] memory orderIds = dex.createBatchSellOrder{
            value: orderCreationFee * assetIds.length
        }(address(asset), assetIds, assetAmounts, pricesPerAssets);
        uint256 paidTakerFee = (totalPurchaseCost * takerFee) / 10000;

        assertEq(orderIds.length, orderCount);

        uint256 minimumAsset = 1;
        uint256 value = type(uint256).max;
        vm.deal(address(this), value);

        uint256 startGas = gasleft();
        dex.fillOrdersExactEth{value: totalPurchaseCost + paidTakerFee}(
            address(asset),
            minimumAsset,
            orderIds
        );
        console.log("fill orders gas used", startGas - gasleft());
    }

    receive() external payable {}
}
