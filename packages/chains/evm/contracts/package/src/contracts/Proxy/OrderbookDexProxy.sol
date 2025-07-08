// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @title Proxy contract for OrderbookDex
contract OrderbookDexProxy is ERC1967Proxy {
    constructor(
        address _implementation,
        address _owner,
        uint256 _defaultMakerFee,
        uint256 _defaultTakerFee,
        uint256 _orderCreationFee
    )
        ERC1967Proxy(
            _implementation,
            abi.encodeWithSignature(
                "initialize(address,uint256,uint256,uint256)",
                _owner,
                _defaultMakerFee,
                _defaultTakerFee,
                _orderCreationFee
            )
        )
    {}
}
