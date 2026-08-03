// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

interface IFlareTeeManager {
    struct PublicKey {
        bytes32 x;
        bytes32 y;
    }

    struct TeeMachineWithAttestationData {
        address teeId;
        address initialTeeId;
        string url;
        bytes32 codeHash;
        bytes32 platform;
    }

    function getTeeMachineStatus(address teeId) external view returns (uint8);

    function getExtensionId(address teeId) external view returns (uint256);

    function getPublicKey(address teeId) external view returns (PublicKey memory);

    function getTeeMachineWithAttestationData(address teeId)
        external
        view
        returns (TeeMachineWithAttestationData memory);
}
