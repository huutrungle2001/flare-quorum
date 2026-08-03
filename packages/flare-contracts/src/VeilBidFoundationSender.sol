// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ITeeExtensionRegistry} from "./interfaces/ITeeExtensionRegistry.sol";
import {ITeeMachineRegistry} from "./interfaces/ITeeMachineRegistry.sol";

/// @title VeilBidFoundationSender
/// @notice Public-safe FCC compatibility sender used for Gate A preparation.
/// @dev This contract deliberately carries no bid, winner, or settlement state.
contract VeilBidFoundationSender {
    uint256 private constant FIRST_PUBLIC_EXTENSION_ID = 0x10000;
    uint256 public constant COSTON2_CHAIN_ID = 114;
    uint16 public constant FOUNDATION_SCHEMA_VERSION = 1;

    // forge-lint: disable-next-line(unsafe-typecast)
    bytes32 public constant OP_TYPE = bytes32("VEILBID_FOUNDATION");
    // forge-lint: disable-next-line(unsafe-typecast)
    bytes32 public constant OP_COMMAND = bytes32("PING_V1");
    bytes32 public constant FOUNDATION_DOMAIN = keccak256("VEILBID_FCC_FOUNDATION_V1");

    ITeeExtensionRegistry public immutable teeExtensionRegistry;
    ITeeMachineRegistry public immutable teeMachineRegistry;

    uint256 private extensionId;

    struct FoundationRequest {
        uint16 schemaVersion;
        uint256 chainId;
        address market;
        bytes32 requestNonce;
        bytes32 payloadHash;
    }

    error InvalidRegistry();
    error ExtensionIdAlreadySet();
    error ExtensionIdNotFound();
    error InvalidRequest();
    error NoTeeSelected();

    constructor(ITeeExtensionRegistry extensionRegistry, ITeeMachineRegistry machineRegistry) {
        if (address(extensionRegistry) == address(0) || address(machineRegistry) == address(0)) {
            revert InvalidRegistry();
        }
        if (address(extensionRegistry).code.length == 0 || address(machineRegistry).code.length == 0) {
            revert InvalidRegistry();
        }
        teeExtensionRegistry = extensionRegistry;
        teeMachineRegistry = machineRegistry;
    }

    function setExtensionId() external {
        if (extensionId != 0) revert ExtensionIdAlreadySet();
        uint256 nextId = teeExtensionRegistry.nextPublicExtensionId();
        for (uint256 candidate = FIRST_PUBLIC_EXTENSION_ID; candidate < nextId; ++candidate) {
            if (teeExtensionRegistry.getTeeExtensionInstructionsSender(candidate) == address(this)) {
                extensionId = candidate;
                return;
            }
        }
        revert ExtensionIdNotFound();
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
