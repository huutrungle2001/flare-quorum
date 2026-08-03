// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {
    Nox,
    ebool,
    euint256,
    externalEuint256
} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

/// @notice Minimal Gate C close/proof/recovery contract. Not production code.
contract WinnerProofSpike {
    enum Status {
        Open,
        Closed,
        Awarded,
        Refunded
    }

    error InvalidCeiling();
    error InvalidStatus();
    error InvalidWinnerBidId();

    uint256 public immutable tenderId;
    uint256 public immutable publicCeiling;
    uint256 public bidCount;
    uint256 public closeBlock;
    uint256 public winnerBidId;
    address public winner;
    Status public status;

    mapping(uint256 bidId => address vendor) public vendorOf;
    euint256 private _encryptedBestPrice;
    euint256 private _encryptedWinnerBidId;

    constructor(uint256 tenderId_, uint256 ceiling) {
        if (ceiling == type(uint256).max) {
            revert InvalidCeiling();
        }
        tenderId = tenderId_;
        publicCeiling = ceiling;
        _encryptedBestPrice = Nox.toEuint256(ceiling + 1);
        _encryptedWinnerBidId = Nox.toEuint256(0);
    }

    function submitBid(externalEuint256 encryptedPrice, bytes calldata inputProof) external {
        if (status != Status.Open) {
            revert InvalidStatus();
        }

        uint256 bidId = ++bidCount;
        euint256 price = Nox.fromExternal(encryptedPrice, inputProof);
        euint256 sentinel = Nox.toEuint256(publicCeiling + 1);
        ebool isPositive = Nox.gt(price, Nox.toEuint256(0));
        euint256 candidate = Nox.select(isPositive, price, sentinel);
        ebool isWithinCeiling = Nox.le(price, Nox.toEuint256(publicCeiling));
        candidate = Nox.select(isWithinCeiling, candidate, sentinel);
        ebool isBetter = Nox.lt(candidate, _encryptedBestPrice);

        _encryptedBestPrice = Nox.select(isBetter, candidate, _encryptedBestPrice);
        _encryptedWinnerBidId = Nox.select(
            isBetter,
            Nox.toEuint256(bidId),
            _encryptedWinnerBidId
        );
        vendorOf[bidId] = msg.sender;

        Nox.allowThis(price);
        Nox.addViewer(price, msg.sender);
        Nox.allowThis(_encryptedBestPrice);
        Nox.allowThis(_encryptedWinnerBidId);
    }

    function close() external {
        if (status != Status.Open) {
            revert InvalidStatus();
        }
        status = Status.Closed;
        closeBlock = block.number;
        Nox.allowPublicDecryption(_encryptedWinnerBidId);
    }

    function finalize(bytes calldata winnerProof) external {
        if (status != Status.Closed) {
            revert InvalidStatus();
        }

        uint256 proofDerivedWinnerBidId = Nox.publicDecrypt(
            _encryptedWinnerBidId,
            winnerProof
        );
        if (proofDerivedWinnerBidId == 0) {
            status = Status.Refunded;
            return;
        }
        if (
            proofDerivedWinnerBidId > bidCount ||
            vendorOf[proofDerivedWinnerBidId] == address(0)
        ) {
            revert InvalidWinnerBidId();
        }

        winnerBidId = proofDerivedWinnerBidId;
        winner = vendorOf[proofDerivedWinnerBidId];
        status = Status.Awarded;
    }

    function encryptedBestPriceHandle() external view returns (bytes32) {
        return euint256.unwrap(_encryptedBestPrice);
    }

    function encryptedWinnerBidIdHandle() external view returns (bytes32) {
        return euint256.unwrap(_encryptedWinnerBidId);
    }

    function bestPriceIsPubliclyDecryptable() external view returns (bool) {
        return Nox.isPubliclyDecryptable(_encryptedBestPrice);
    }

    function winnerIdIsPubliclyDecryptable() external view returns (bool) {
        return Nox.isPubliclyDecryptable(_encryptedWinnerBidId);
    }
}
