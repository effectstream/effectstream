
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

contract Counter {
    int private count = 0;
    event changedCount(address indexed userAddress, int count);

    function incrementCounter() public {
        count += 1;
        emit changedCount(msg.sender, count);
    }

    function getCount() public view returns (int) {
        return count;
    }
}