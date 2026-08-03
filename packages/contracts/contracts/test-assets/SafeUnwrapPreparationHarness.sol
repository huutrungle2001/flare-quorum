// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

contract SafeUnwrapPreparationHarness {
    mapping(address owner => bool enabled) public owners;
    bytes32 public balanceHandle;

    function setOwner(address owner, bool enabled) external {
        owners[owner] = enabled;
    }

    function setBalanceHandle(bytes32 handle) external {
        balanceHandle = handle;
    }

    function isOwner(address owner) external view returns (bool) {
        return owners[owner];
    }

    function confidentialBalanceOf(
        address
    ) external view returns (bytes32) {
        return balanceHandle;
    }
}
