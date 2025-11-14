
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

contract emptycontract {

    /// @dev Example counter value.
    int private count = 0;

    /// @dev Emitted when the counter is incremented. This get's captured by Effectstream.
    event changedCount(address indexed userAddress, int count);

    /// @dev Increments the counter and emits the `changedCount` event.
    function incrementCounter() public {
        count += 1;
        emit changedCount(msg.sender, count);
    }

    function getCount() public view returns (int) {
        return count;
    }
}