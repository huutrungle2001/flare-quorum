// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ITeeExtensionRegistry} from "./interfaces/ITeeExtensionRegistry.sol";
import {ITeeMachineRegistry} from "./interfaces/ITeeMachineRegistry.sol";

/// @title VeilBidFoundationSenderV2
/// @notice Constant-time FCC compatibility sender used for a fresh Gate A registration.
/// @dev V1 remains in source solely so its deployed-but-unregistered evidence is reproducible.
contract VeilBidFoundationSenderV2 {
    uint256 private constant FIRST_PUBLIC_EXTENSION_ID = 0x10000;
    uint256 public constant COSTON2_CHAIN_ID = 114;
    uint16 public constant FOUNDATION_SCHEMA_VERSION = 1;
    uint16 public constant FOUNDATION_SENDER_VERSION = 2;

    // forge-lint: disable-next-line(unsafe-typecast)
    bytes32 public constant OP_TYPE = bytes32("VEILBID_FOUNDATION");
    // forge-lint: disable-next-line(unsafe-typecast)
    bytes32 public constant OP_COMMAND = bytes32("PING_V1");
    bytes32 public constant FOUNDATION_DOMAIN = keccak256("VEILBID_FCC_FOUNDATION_V1");

    ITeeExtensionRegistry public immutable teeExtensionRegistry;
    ITeeMachineRegistry public immutable teeMachineRegistry;
    address public immutable owner;

    uint256 private extensionId;

    struct FoundationRequest {
        uint16 schemaVersion;
        uint256 chainId;
        address market;
        bytes32 requestNonce;
        bytes32 payloadHash;
    }

    error ExtensionIdAlreadySet();
    error InvalidExtensionId();
    error InvalidRegistry();
    error InvalidRequest();
    error NoTeeSelected();
    error Unauthorized();

    event ExtensionIdConfigured(uint256 indexed extensionId);

    constructor(ITeeExtensionRegistry extensionRegistry, ITeeMachineRegistry machineRegistry) {
        if (address(extensionRegistry) == address(0) || address(machineRegistry) == address(0)) {
            revert InvalidRegistry();
        }
        if (address(extensionRegistry).code.length == 0 || address(machineRegistry).code.length == 0) {
            revert InvalidRegistry();
        }
        teeExtensionRegistry = extensionRegistry;
        teeMachineRegistry = machineRegistry;
        owner = msg.sender;
    }

    /// @notice Binds the exact ID returned by the live registry without scanning historical IDs.
    /// @dev The registry mapping is authoritative; an owner cannot bind an unassigned or foreign ID.
    function setExtensionIdExplicit(uint256 candidate) external {
        if (msg.sender != owner) revert Unauthorized();
        if (extensionId != 0) revert ExtensionIdAlreadySet();
        uint256 nextId = teeExtensionRegistry.nextPublicExtensionId();
        if (
            candidate < FIRST_PUBLIC_EXTENSION_ID || candidate >= nextId
                || teeExtensionRegistry.getTeeExtensionInstructionsSender(candidate) != address(this)
        ) {
            revert InvalidExtensionId();
        }
        extensionId = candidate;
        emit ExtensionIdConfigured(candidate);
    }

    function getExtensionId() external view returns (uint256) {
        return extensionId;
    }

    function sendFoundationPing(FoundationRequest calldata request) external payable returns (bytes32) {
        if (
            request.schemaVersion != FOUNDATION_SCHEMA_VERSION || request.chainId != COSTON2_CHAIN_ID
                || request.market == address(0) || request.requestNonce == bytes32(0)
                || request.payloadHash == bytes32(0) || extensionId == 0
        ) {
            revert InvalidRequest();
        }

        address[] memory teeIds = teeMachineRegistry.getRandomTeeIds(extensionId, 1);
        if (teeIds.length != 1 || teeIds[0] == address(0)) revert NoTeeSelected();
        address[] memory cosigners = new address[](0);
        ITeeExtensionRegistry.TeeInstructionParams memory params = ITeeExtensionRegistry.TeeInstructionParams({
            opType: OP_TYPE,
            opCommand: OP_COMMAND,
            message: abi.encode(request),
            cosigners: cosigners,
            cosignersThreshold: 0,
            claimBackAddress: msg.sender
        });
        return teeExtensionRegistry.sendInstructions{value: msg.value}(teeIds, params);
    }

    function foundationBindingHash(FoundationRequest calldata request) external pure returns (bytes32) {
        return _foundationBindingHash(request);
    }

    function _foundationBindingHash(FoundationRequest calldata request) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                FOUNDATION_DOMAIN,
                OP_TYPE,
                OP_COMMAND,
                request.schemaVersion,
                request.chainId,
                request.market,
                request.requestNonce,
                request.payloadHash
            )
        );
    }
}
