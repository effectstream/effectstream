// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// A simple ownable, mintable ERC20 used as the payment currency for the
/// ERC20-based character sale. Created with https://wizard.openzeppelin.com/.
/// Renamed from the v1 `ERC20PresetMinterPauser`; updated to OpenZeppelin v5
/// (`Ownable(initialOwner)`).
contract CharacterPaymentToken is ERC20, Ownable, ERC20Permit {
    constructor(address initialOwner)
        ERC20("Character Payment Token", "CPT")
        Ownable(initialOwner)
        ERC20Permit("Character Payment Token")
    {}

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}
