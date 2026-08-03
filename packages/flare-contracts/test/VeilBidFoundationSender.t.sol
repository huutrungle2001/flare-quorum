// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {VeilBidFoundationSender} from "../src/VeilBidFoundationSender.sol";
import {ITeeExtensionRegistry} from "../src/interfaces/ITeeExtensionRegistry.sol";
import {ITeeMachineRegistry} from "../src/interfaces/ITeeMachineRegistry.sol";

contract FoundationRegistryMock is ITeeExtensionRegistry {
    function nextPublicExtensionId() external pure override returns (uint256) {
        return 0x10001;
    }

    function getTeeExtensionInstructionsSender(uint256) external pure override returns (address) {
        return address(0);
    }

    function sendInstructions(address[] calldata, TeeInstructionParams calldata)
        external
        payable
        override
        returns (bytes32)
    {
        return bytes32(0);
    }
}

contract FoundationMachineMock is ITeeMachineRegistry {
    function getRandomTeeIds(uint256, uint256) external view override returns (address[] memory ids) {
        ids = new address[](1);
        ids[0] = address(this);
    }
}

contract VeilBidFoundationSenderTest {
    function testDeterministicBindingVector() external {
        VeilBidFoundationSender sender =
            new VeilBidFoundationSender(new FoundationRegistryMock(), new FoundationMachineMock());
        VeilBidFoundationSender.FoundationRequest memory request = VeilBidFoundationSender.FoundationRequest({
            schemaVersion: 1,
            chainId: 114,
            market: address(0x1000000000000000000000000000000000000001),
            requestNonce: bytes32(uint256(0x1234)),
            payloadHash: bytes32(uint256(0xabcd))
        });

        bytes32 expected = 0x1d1142c2df90d62b30369c2079aab9059a6d4e88552fccb06948b0fcd02e0612;
        if (sender.foundationBindingHash(request) != expected) revert("binding mismatch");
    }
}
