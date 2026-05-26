// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {PaimaLaunchpad} from "./PaimaLaunchpad.sol";

contract PaimaLaunchpadFactory is Ownable {
    /// @notice Address of the PaimaLaunchpad implementation contract
    address public launchpadImplementation;
    /// @notice Returns whether the address is whitelisted to deploy new launchpads.
    mapping(address => bool) public whitelistedDeployers;
    /// @notice If true, only whitelisted deployers can deploy new launchpads.
    bool public whitelistDeployersOnly;

    event LaunchpadDeployed(address launchpad);

    error PaimaLaunchpadFactory__InvalidZeroValue();
    error PaimaLaunchpadFactory__NotWhitelisted();

    /// @param _launchpadImplementation Address of the deployed PaimaLaunchpad implementation contract
    /// @param _owner Owner of the factory contract
    /// @param _whitelistDeployersOnly If true, only whitelisted deployers can deploy new launchpads
    constructor(address _launchpadImplementation, address _owner, bool _whitelistDeployersOnly) Ownable(_owner) {
        if (_launchpadImplementation == address(0)) {
            revert PaimaLaunchpadFactory__InvalidZeroValue();
        }
        launchpadImplementation = _launchpadImplementation;
        whitelistDeployersOnly = _whitelistDeployersOnly;
        whitelistedDeployers[_owner] = true;
    }

    /// @notice Deploy a new launchpad.
    function deploy(address owner, uint256 referrerRewardBps, address[] memory acceptedPaymentTokens)
        external
        returns (address)
    {
        if (whitelistDeployersOnly && !whitelistedDeployers[msg.sender]) {
            revert PaimaLaunchpadFactory__NotWhitelisted();
        }
        bytes memory initializeData = abi.encodeWithSignature(
            "initialize(address,uint256,address[])", owner, referrerRewardBps, acceptedPaymentTokens
        );
        ERC1967Proxy launchpadProxy = new ERC1967Proxy(launchpadImplementation, initializeData);
        emit LaunchpadDeployed(address(launchpadProxy));
        return address(launchpadProxy);
    }

    function setWhitelistDeployersOnly(bool _whitelistDeployersOnly) external onlyOwner {
        whitelistDeployersOnly = _whitelistDeployersOnly;
    }

    function setWhitelistedDeployer(address deployer, bool whitelisted) external onlyOwner {
        whitelistedDeployers[deployer] = whitelisted;
    }
}
