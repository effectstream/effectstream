// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "./ERC1967.sol";

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/// @dev Facilitates accepting payment that accepts extra data to know what the payment was for inside a Paima dApp.
contract GenericPayment is ERC1967, OwnableUpgradeable {
    /// @dev True if contract has been initialized via the `initialize` function.
    bool public initialized;

    using Address for address payable;

    /// @dev Emitted when the contract is initialized.
    event Initialized(address indexed owner);

    /// @dev Emitted when payment of `amount` if made by `payer` with `message`.
    event Pay(uint256 amount, address payer, string message);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @dev Initializes the contracts, transferring ownership to the specified `owner`.
    /// Callable only once.
    /// Emits the `Initialized` event.
    function initialize(address owner) public initializer {
        require(!initialized, "Contract already initialized");
        initialized = true;

        __Ownable_init(owner);

        emit Initialized(owner);
    }

    /// @dev Transfers native tokens to the contract, providing `message`.
    /// Emits the `Pay` event.
    function pay(string calldata message) external payable {
        emit Pay(msg.value, msg.sender, message);
    }

    /// @dev Withdraws the contract balance to `_account`.
    /// Callable only by the contract owner.
    function withdraw(address payable _account) external onlyOwner {
        uint256 balance = address(this).balance;

        require(balance > 0, "GenericPayment: 0 balance");
        _account.sendValue(balance);
    }

    /// @dev Upgrades the contract implementation to `_newContract`.
    /// Callable only by the contract owner.
    function upgradeContract(address _newContract) external onlyOwner {
        _setImplementation(_newContract);
    }
}
