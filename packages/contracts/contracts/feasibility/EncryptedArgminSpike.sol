// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {
    Nox,
    ebool,
    euint256,
    externalEuint256
} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

/// @notice Minimal Gate B accumulator. This is not production protocol code.
contract EncryptedArgminSpike {
    error BidLimitReached();
    error InvalidCeiling();
    error NotOwner();
    error Sealed();
    error SubmissionClosed();

    uint256 public constant MAX_BIDS = 8;

    address public immutable owner;
    uint256 public immutable publicCeiling;
    bool public isSealed;
    uint256 public bidCount;

    mapping(uint256 bidId => address vendor) public vendorOf;
    mapping(uint256 bidId => euint256 price) private _bidPrice;
    euint256 private _encryptedBestPrice;
    euint256 private _encryptedWinnerBidId;

    constructor(uint256 ceiling) {
        if (ceiling == type(uint256).max) {
            revert InvalidCeiling();
        }
        owner = msg.sender;
        publicCeiling = ceiling;
        _encryptedBestPrice = Nox.toEuint256(ceiling + 1);
        _encryptedWinnerBidId = Nox.toEuint256(0);
    }

    function submitBid(externalEuint256 encryptedPrice, bytes calldata inputProof) external {
        if (isSealed) {
            revert SubmissionClosed();
        }
        if (bidCount == MAX_BIDS) {
            revert BidLimitReached();
        }

        uint256 bidId = ++bidCount;
        euint256 price = Nox.fromExternal(encryptedPrice, inputProof);
        euint256 zero = Nox.toEuint256(0);
        euint256 ceiling = Nox.toEuint256(publicCeiling);
        euint256 sentinel = Nox.toEuint256(publicCeiling + 1);

        ebool isPositive = Nox.gt(price, zero);
        euint256 positiveCandidate = Nox.select(isPositive, price, sentinel);
        ebool isWithinCeiling = Nox.le(price, ceiling);
        euint256 candidate = Nox.select(isWithinCeiling, positiveCandidate, sentinel);
        ebool isBetter = Nox.lt(candidate, _encryptedBestPrice);

        _encryptedBestPrice = Nox.select(isBetter, candidate, _encryptedBestPrice);
        _encryptedWinnerBidId = Nox.select(
            isBetter,
            Nox.toEuint256(bidId),
            _encryptedWinnerBidId
        );

        vendorOf[bidId] = msg.sender;
        _bidPrice[bidId] = price;

        Nox.allowThis(price);
        Nox.addViewer(price, msg.sender);
        Nox.allowThis(_encryptedBestPrice);
        Nox.allowThis(_encryptedWinnerBidId);
    }

    function sealAndAuthorizeResultViewer(address viewer) external {
        if (msg.sender != owner) {
            revert NotOwner();
        }
        if (isSealed) {
            revert Sealed();
        }
        isSealed = true;
        Nox.addViewer(_encryptedBestPrice, viewer);
        Nox.addViewer(_encryptedWinnerBidId, viewer);
    }

    function bidPriceHandle(uint256 bidId) external view returns (bytes32) {
        return euint256.unwrap(_bidPrice[bidId]);
    }

    function encryptedBestPriceHandle() external view returns (bytes32) {
        return euint256.unwrap(_encryptedBestPrice);
    }

    function encryptedWinnerBidIdHandle() external view returns (bytes32) {
        return euint256.unwrap(_encryptedWinnerBidId);
    }
}
