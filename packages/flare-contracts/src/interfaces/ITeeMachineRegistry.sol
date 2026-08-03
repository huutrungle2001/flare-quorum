// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

interface ITeeMachineRegistry {
    function getRandomTeeIds(uint256 extensionId, uint256 count) external view returns (address[] memory);
}
