// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/Address.sol";

/// @dev The main L2 contract for an Effectstream L2.
/// Used by the preorder template as the deterministic admin/config inbox: admins submit concise
/// commands (create-campaign / set-product / end-campaign) via `effectstreamSubmitGameInput`, which
/// the sync node's builtin `EVM:EffectstreamL2` primitive ingests and routes into the state machine.
contract EffectstreamL2Contract {
    using Address for address payable;

    /// @dev Emitted when `effectstreamSubmitGameInput` function is called with `data`.
    /// `userAddress` is the transaction sender and `value` is the transaction value.
    event EffectstreamGameInteraction(address indexed userAddress, bytes data, uint256 value);

    /// @dev Contract owner.
    address public owner;
    /// @dev Amount in wei that is required to be paid when calling `effectstreamSubmitGameInput`.
    uint256 public fee; // in wei

    /// @dev Sets the contract owner to `_owner` and payment fee to `_fee`.
    constructor(address _owner, uint256 _fee) {
        owner = _owner;
        fee = _fee;
    }

    /// @dev Emits the `EffectstreamGameInteraction` event, logging the `msg.sender`, `data`, and `msg.value`.
    /// Revert if `msg.value` is less than set `fee`.
    function effectstreamSubmitGameInput(bytes calldata data) public payable {
        require(msg.value >= fee, "Sufficient funds required to submit game input");
        emit EffectstreamGameInteraction(msg.sender, data, msg.value);
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
