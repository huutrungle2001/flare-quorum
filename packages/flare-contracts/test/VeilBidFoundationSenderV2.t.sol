// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {VeilBidFoundationSenderV2} from "../src/VeilBidFoundationSenderV2.sol";
import {ITeeExtensionRegistry} from "../src/interfaces/ITeeExtensionRegistry.sol";
import {ITeeMachineRegistry} from "../src/interfaces/ITeeMachineRegistry.sol";

interface FoundationVm {
    function expectRevert(bytes4 selector) external;
    function prank(address sender) external;
}

contract FoundationV2RegistryMock is ITeeExtensionRegistry {
    uint256 public nextId = 65_922;
    mapping(uint256 => address) public senderById;
    bytes32 public lastInstructionId = keccak256("FOUNDATION_ACTION");

    function setNextId(uint256 value) external {
        nextId = value;
    }

    function setSender(uint256 id, address sender) external {
        senderById[id] = sender;
    }

    function nextPublicExtensionId() external view override returns (uint256) {
        return nextId;
    }

    function getTeeExtensionInstructionsSender(uint256 id) external view override returns (address) {
        return senderById[id];
    }

    function sendInstructions(address[] calldata, TeeInstructionParams calldata)
        external
        payable
        override
        returns (bytes32)
    {
        return lastInstructionId;
    }
}

contract FoundationV2MachineMock is ITeeMachineRegistry {
    uint256 public expectedExtensionId;

    function setExpectedExtensionId(uint256 value) external {
        expectedExtensionId = value;
    }

    function getRandomTeeIds(uint256 id, uint256 count) external view override returns (address[] memory ids) {
        if (id != expectedExtensionId || count != 1) return new address[](0);
        ids = new address[](1);
        ids[0] = address(this);
    }
}

contract VeilBidFoundationSenderV2Test {
    FoundationVm private constant vm = FoundationVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant HIGH_EXTENSION_ID = 65_921;

    FoundationV2RegistryMock private registry;
    FoundationV2MachineMock private machines;
    VeilBidFoundationSenderV2 private sender;

    function setUp() public {
        registry = new FoundationV2RegistryMock();
        machines = new FoundationV2MachineMock();
        sender = new VeilBidFoundationSenderV2(registry, machines);
        registry.setSender(HIGH_EXTENSION_ID, address(sender));
        machines.setExpectedExtensionId(HIGH_EXTENSION_ID);
    }

    function testExplicitBindingAcceptsHighRegisteredIdInConstantTime() external {
        sender.setExtensionIdExplicit(HIGH_EXTENSION_ID);
        if (sender.getExtensionId() != HIGH_EXTENSION_ID) revert("extension binding mismatch");
        if (sender.owner() != address(this)) revert("owner mismatch");
        if (sender.FOUNDATION_SENDER_VERSION() != 2) revert("version mismatch");
    }

    function testExplicitBindingRejectsUnauthorizedCaller() external {
        vm.prank(address(0xBEEF));
        vm.expectRevert(VeilBidFoundationSenderV2.Unauthorized.selector);
        sender.setExtensionIdExplicit(HIGH_EXTENSION_ID);
    }

    function testExplicitBindingRejectsReservedFutureAndForeignIds() external {
        vm.expectRevert(VeilBidFoundationSenderV2.InvalidExtensionId.selector);
        sender.setExtensionIdExplicit(65_535);

        vm.expectRevert(VeilBidFoundationSenderV2.InvalidExtensionId.selector);
        sender.setExtensionIdExplicit(65_922);

        vm.expectRevert(VeilBidFoundationSenderV2.InvalidExtensionId.selector);
        sender.setExtensionIdExplicit(65_920);
    }

    function testExplicitBindingCannotBeChanged() external {
        sender.setExtensionIdExplicit(HIGH_EXTENSION_ID);
        registry.setSender(65_920, address(sender));
        vm.expectRevert(VeilBidFoundationSenderV2.ExtensionIdAlreadySet.selector);
        sender.setExtensionIdExplicit(65_920);
    }

    function testConfiguredSenderDispatchesFoundationAction() external {
        sender.setExtensionIdExplicit(HIGH_EXTENSION_ID);
        VeilBidFoundationSenderV2.FoundationRequest memory request = VeilBidFoundationSenderV2.FoundationRequest({
            schemaVersion: 1,
            chainId: 114,
            market: address(0x1000000000000000000000000000000000000001),
            requestNonce: bytes32(uint256(0x1234)),
            payloadHash: bytes32(uint256(0xabcd))
        });

        bytes32 actionId = sender.sendFoundationPing(request);
        if (actionId != registry.lastInstructionId()) revert("action id mismatch");
        bytes32 expected = 0x1d1142c2df90d62b30369c2079aab9059a6d4e88552fccb06948b0fcd02e0612;
        if (sender.foundationBindingHash(request) != expected) revert("binding mismatch");
    }
}
