
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

contract Counter {
    int private count = 0;
    event changedCount(address indexed userAddress, int count);

    function incrementCounter() public {
        count += 1;
        emit changedCount(msg.sender, count);
    }

    // Emits `n` changedCount events in a single tx. Used by the perf suite to
    // generate high event volume per block without one tx per entry.
    function bulkIncrement(uint256 n) public {
        for (uint256 i = 0; i < n; i++) {
            count += 1;
            emit changedCount(msg.sender, count);
        }
    }

    function getCount() public view returns (int) {
        return count;
    }
}
