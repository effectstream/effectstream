// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Demonstration receiver for events supplied by a trusted CKB relayer.
/// This contract does not verify CKB headers, proofs, or canonicality.
contract CkbEventRelay {
    error UnauthorizedRelayer();
    error InvalidPayload();
    error DuplicateEvent(bytes32 eventId);

    struct RelayPayload {
        uint16 schemaVersion;
        bytes32 sourceNetwork;
        uint256 blockHeight;
        bytes32 blockHash;
        bytes32 eventId;
        bytes32 transactionHash;
        uint32 outputIndex;
        bytes eventData;
    }

    address public immutable owner;
    mapping(address => bool) public authorizedRelayer;
    mapping(bytes32 => bytes32) public acceptedPayloadHash;

    event SourceEventAccepted(
        bytes32 indexed eventId,
        bytes32 indexed payloadHash,
        bytes32 indexed sourceNetwork,
        uint256 blockHeight,
        bytes32 blockHash,
        bytes32 transactionHash,
        uint32 outputIndex,
        bytes eventData
    );

    constructor(address initialRelayer) {
        if (initialRelayer == address(0)) revert InvalidPayload();
        owner = msg.sender;
        authorizedRelayer[initialRelayer] = true;
    }

    function setRelayer(address relayer, bool authorized) external {
        if (msg.sender != owner) revert UnauthorizedRelayer();
        if (relayer == address(0)) revert InvalidPayload();
        authorizedRelayer[relayer] = authorized;
    }

    function relay(RelayPayload calldata payload) external returns (bytes32 payloadHash) {
        if (!authorizedRelayer[msg.sender]) revert UnauthorizedRelayer();
        if (
            payload.schemaVersion != 1 || payload.sourceNetwork == bytes32(0) ||
            payload.blockHash == bytes32(0) || payload.eventId == bytes32(0) ||
            payload.transactionHash == bytes32(0) || payload.eventData.length == 0
        ) revert InvalidPayload();
        if (acceptedPayloadHash[payload.eventId] != bytes32(0)) {
            revert DuplicateEvent(payload.eventId);
        }

        // Domain separation prevents the same source event hash from being replayed
        // to a different EVM chain or receiver contract.
        payloadHash = keccak256(abi.encode(
            keccak256("EffectStream CKB Event Relay"),
            payload.schemaVersion,
            block.chainid,
            address(this),
            payload.sourceNetwork,
            payload.blockHeight,
            payload.blockHash,
            payload.eventId,
            payload.transactionHash,
            payload.outputIndex,
            keccak256(payload.eventData)
        ));
        acceptedPayloadHash[payload.eventId] = payloadHash;
        emit SourceEventAccepted(
            payload.eventId, payloadHash, payload.sourceNetwork,
            payload.blockHeight, payload.blockHash, payload.transactionHash,
            payload.outputIndex, payload.eventData
        );
    }
}
