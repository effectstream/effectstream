// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../lib/cheatcodes.sol";
import "../lib/console.sol";
import "../lib/ctest.sol";

import "../../src/contracts/PaimaL2Contract.sol";

contract PaimaL2ContractTest is CTest {
    event PaimaGameInteraction(address indexed userAddress, bytes data, uint256 value);

    CheatCodes cheats = CheatCodes(HEVM_ADDRESS);
    PaimaL2Contract strg;

    address account1 = 0x766FCe3d50d795Fe6DcB1020AB58bccddd5C5c77;
    address account2 = 0x078D888E40faAe0f32594342c85940AF3949E666;

    uint256 constant MAX_INT = 2 ** 256 - 1;
    uint256 constant FEE = 1e16;

    function setUp() public {
        strg = new PaimaL2Contract(address(account1), FEE);
        cheats.deal(account1, 100 ether);
        cheats.deal(account2, 100 ether);
    }

    function testWithdraw() public {
        cheats.prank(account1);
        strg.withdrawFunds();
        assertEq(address(strg).balance, 0);
    }

    function testCannotWithdraw() public {
        cheats.prank(account2);
        cheats.expectRevert("Only owner can withdraw funds");
        strg.withdrawFunds();
    }

    function testCannotStoreWithoutFee() public {
        cheats.startPrank(account2);
        cheats.expectRevert("Sufficient funds required to submit game input");
        strg.paimaSubmitGameInput("0x123456");
        cheats.expectRevert("Sufficient funds required to submit game input");
        strg.paimaSubmitGameInput{value: FEE - 1}("0x123456");
        cheats.stopPrank();
    }

    function testStore() public {
        cheats.prank(account2);
        bytes memory data = "0x123456";
        cheats.expectEmit(true, true, true, true);
        emit PaimaGameInteraction(account2, data, FEE);
        strg.paimaSubmitGameInput{value: FEE}(data);
        assertEq(address(strg).balance, FEE);
    }

    function testStoreAndWithdraw() public {
        cheats.startPrank(account2);
        bytes memory data = "0x123456";
        strg.paimaSubmitGameInput{value: FEE}(data);
        strg.paimaSubmitGameInput{value: FEE}(data);
        strg.paimaSubmitGameInput{value: FEE}(data);
        cheats.stopPrank();
        assertEq(address(strg).balance, FEE * 3);
        cheats.prank(account1);
        strg.withdrawFunds();
        assertEq(address(strg).balance, 0);
    }

    function testChangeOwner() public {
        assertEq(strg.owner(), account1);
        cheats.prank(account1);
        strg.setOwner(account2);
        assertEq(strg.owner(), account2);
        cheats.prank(account2);
        strg.withdrawFunds();
    }

    function testCannotChangeOwner() public {
        assertEq(strg.owner(), account1);
        cheats.prank(account2);
        cheats.expectRevert("Only owner can change owner");
        strg.setOwner(account1);
        assertEq(strg.owner(), account1);
    }

    function testChangeFee() public {
        uint256 newFee = FEE * 2;
        assertEq(strg.owner(), account1);
        assertEq(strg.fee(), FEE);
        cheats.prank(account1);
        strg.setFee(newFee);
        assertEq(strg.fee(), newFee);

        bytes memory data = "0x123456";
        cheats.prank(account2);
        cheats.expectRevert("Sufficient funds required to submit game input");
        strg.paimaSubmitGameInput{value: newFee - 1}(data);

        cheats.prank(account2);
        cheats.expectEmit(true, true, true, true);
        emit PaimaGameInteraction(account2, data, newFee);
        strg.paimaSubmitGameInput{value: newFee}(data);
        assertEq(address(strg).balance, newFee);
    }

    function testCannotChangeFee() public {
        assertEq(strg.fee(), FEE);
        cheats.prank(account2);
        cheats.expectRevert("Only owner can change fee");
        strg.setFee(FEE * 2);
        assertEq(strg.fee(), FEE);
    }
}
