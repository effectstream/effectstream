// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/Address.sol";

/// @dev The main L2 contract for a Paima L2.
contract PaimaL2Contract {
    using Address for address payable;

    /// @dev Emitted when `paimaSubmitGameInput` function is called with `data`.
    /// `userAddress` is the transaction sender and `value` is the transaction value.
    event PaimaGameInteraction(address indexed userAddress, bytes data, uint256 value);

    /// @dev Contract owner.
    address public owner;
    /// @dev Amount in wei that is required to be paid when calling `paimaSubmitGameInput`.
    uint256 public fee; // in wei

    /// @dev Sets the contract owner to `_owner` and payment fee to `_fee`.
    constructor(address _owner, uint256 _fee) {
        owner = _owner;
        fee = _fee;
    }

    /// @dev Emits the `PaimaGameInteraction` event, logging the `msg.sender`, `data`, and `msg.value`.
    /// Revert if `msg.value` is less than set `fee`.
    function paimaSubmitGameInput(bytes calldata data) public payable {
        require(msg.value >= fee, "Sufficient funds required to submit game input");
        emit PaimaGameInteraction(msg.sender, data, msg.value);
    }

    /// @dev Withdraws the contract balance to the `owner`.
    /// Callable only by the contract owner.
    function withdrawFunds() public {
        require(msg.sender == owner, "Only owner can withdraw funds");
        address payable to = payable(owner);
        uint256 balance = address(this).balance;
        to.sendValue(balance);
    }

    /// @dev Sets the `newOwner` as the contract owner.
    /// Callable only by the contract owner.
    function setOwner(address newOwner) public {
        require(msg.sender == owner, "Only owner can change owner");
        owner = newOwner;
    }

    /// @dev Sets the `newFee` as the required payment fee.
    /// Callable only by the contract owner.
    function setFee(uint256 newFee) public {
        require(msg.sender == owner, "Only owner can change fee");
        fee = newFee;
    }
}
