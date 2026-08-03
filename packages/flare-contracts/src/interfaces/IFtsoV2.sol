// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

interface IFtsoV2 {
    function getFeedById(bytes21 feedId) external view returns (uint256 value, int8 decimals, uint64 timestamp);
}
