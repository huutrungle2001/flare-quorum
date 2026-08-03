// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {
    Nox,
    ebool,
    euint256,
    externalEuint256
} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

/// @notice Minimal Gate A contract. This is not production protocol code.
contract PersistentHandleSpike {
    error AlreadySubmitted();
    error MissingStoredBid();

    address public vendor;
    euint256 private _storedBid;
    euint256 private _comparisonResult;

    function submitBid(externalEuint256 encryptedBid, bytes calldata inputProof) external {
        if (Nox.isInitialized(_storedBid)) {
            revert AlreadySubmitted();
        }

        _storedBid = Nox.fromExternal(encryptedBid, inputProof);
        vendor = msg.sender;

        Nox.allowThis(_storedBid);
        Nox.addViewer(_storedBid, msg.sender);
    }

    function compareStoredBid(uint256 publicThreshold) external {
        if (!Nox.isInitialized(_storedBid)) {
            revert MissingStoredBid();
        }

        ebool isBelowThreshold = Nox.lt(_storedBid, Nox.toEuint256(publicThreshold));
        _comparisonResult = Nox.select(
            isBelowThreshold,
            Nox.toEuint256(1),
            Nox.toEuint256(0)
        );

        Nox.allowThis(_comparisonResult);
        Nox.allowPublicDecryption(_comparisonResult);
    }

    function storedBidHandle() external view returns (bytes32) {
        return euint256.unwrap(_storedBid);
    }

    function comparisonResultHandle() external view returns (bytes32) {
        return euint256.unwrap(_comparisonResult);
    }

    function storedBidAllowedFor(address account) external view returns (bool) {
        return Nox.isAllowed(_storedBid, account);
    }

    function storedBidViewableBy(address account) external view returns (bool) {
        return Nox.isViewer(_storedBid, account);
    }
}
