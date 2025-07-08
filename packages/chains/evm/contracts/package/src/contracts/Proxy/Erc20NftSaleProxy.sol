// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "../ERC1967.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @title Proxy
/// @dev Proxy contract mostly based on https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/proxy/Proxy.sol
contract Erc20NftSaleProxy is ERC1967 {
    /// @dev Sets `implementation` address and calls the `Erc20NftSale.initialize` function with the parameters
    /// `currencies`, `owner`, `nftAddress`, `nftPrice`.
    constructor(
        address implementation,
        ERC20[] memory currencies,
        address owner,
        address nftAddress,
        uint256 nftPrice
    ) {
        _assertCorrectImplementationSlot();
        _setImplementation(implementation);

        bytes memory data = abi.encodeWithSignature(
            "initialize(address[],address,address,uint256)",
            currencies,
            owner,
            nftAddress,
            nftPrice
        );
        (bool success, ) = implementation.delegatecall(data);
        require(success, "Initialization unsuccessful");
    }

    /// @dev Delegates the current call to `implementation`.
    /// This function does not return to its internal call site, it will return
    /// directly to the external caller.
    function _delegate(address target) internal {
        assembly {
            // Copy msg.data. We take full control of memory in this inline assembly
            // block because it will not return to Solidity code. We overwrite the
            // Solidity scratch pad at memory position 0.
            calldatacopy(0, 0, calldatasize())

            // Call the implementation.
            // out and outsize are 0 because we don't know the size yet.
            let result := delegatecall(gas(), target, 0, calldatasize(), 0, 0)

            // Copy the returned data.
            returndatacopy(0, 0, returndatasize())

            switch result
            // delegatecall returns 0 on error.
            case 0 {
                revert(0, returndatasize())
            }
            default {
                return(0, returndatasize())
            }
        }
    }

    /// @dev Delegates the current call to the address returned by `_implementation()`.
    /// This function does not return to its internal call site, it will return
    /// directly to the external caller.
    function _fallback() internal {
        _delegate(_getImplementation());
    }

    /// @dev Fallback function that delegates calls to the address returned by `_implementation()`.
    /// Will run if no other function in the contract matches the call data.
    fallback() external payable {
        _fallback();
    }

    /// @dev Called if this contract is receiving native tokens and `msg.data` is empty
    receive() external payable {}
}
