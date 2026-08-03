// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {
    IERC7984
} from "@iexec-nox/nox-confidential-contracts/contracts/interfaces/IERC7984.sol";
import {
    Nox,
    ebool,
    euint256,
    externalEuint256
} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {
    VeilBidAwardReceipt
} from "../receipt/VeilBidAwardReceipt.sol";

interface IVeilBidSafePreparationModule {
    function safe() external view returns (address);

    function market() external view returns (address);

    function computeActionHash(
        bytes32 actionDataHash,
        uint256 nonce
    ) external view returns (bytes32);

    function consumePreparedInput(
        bytes32 actionHash
    ) external returns (euint256);
}

/// @notice Confidential, lowest-valid-bid procurement with internal custody.
contract VeilBidMarket is ReentrancyGuard {
    uint256 public constant MAX_BIDS = 8;

    enum TenderStatus {
        FundingPending,
        Open,
        Closed,
        Awarded,
        Refunded,
        Cancelled
    }

    struct Tender {
        address buyer;
        address reviewViewer;
        bytes32 metadataHash;
        uint256 publicCeiling;
        uint64 bidDeadline;
        uint64 closeBlock;
        uint8 approvedVendorCount;
        uint8 bidCount;
        TenderStatus status;
        uint256 winnerBidId;
        address winner;
        euint256 escrowedBudget;
        ebool fundingMatchesCeiling;
        euint256 encryptedBestPrice;
        euint256 encryptedWinnerBidId;
    }

    struct Bid {
        address vendor;
        uint64 submittedAt;
        euint256 encryptedPrice;
    }

    struct TenderView {
        address buyer;
        address reviewViewer;
        address paymentToken;
        bytes32 metadataHash;
        uint256 publicCeiling;
        uint64 bidDeadline;
        uint64 closeBlock;
        uint8 approvedVendorCount;
        uint8 bidCount;
        TenderStatus status;
        uint256 winnerBidId;
        address winner;
        bytes32 escrowedBudgetHandle;
        bytes32 fundingCheckHandle;
        bytes32 encryptedBestPriceHandle;
        bytes32 encryptedWinnerBidIdHandle;
    }

    struct BidView {
        uint256 tenderId;
        uint256 bidId;
        address vendor;
        uint64 submittedAt;
        bytes32 encryptedPriceHandle;
    }

    error AlreadySubmitted();
    error BidDeadlineNotReached();
    error BidDeadlinePassed();
    error BidDoesNotExist();
    error DuplicateVendor();
    error InvalidBuyer();
    error InvalidCeiling();
    error InvalidDeadline();
    error InvalidMetadata();
    error InvalidPaymentToken();
    error InvalidSafeModule();
    error InvalidStatus(TenderStatus expected, TenderStatus actual);
    error InvalidVendor();
    error InvalidVendorCount();
    error InvalidViewer();
    error InvalidWinnerBidId();
    error NotApprovedVendor();
    error NotBuyer();
    error NotViewerGrantAuthority();
    error TenderDoesNotExist();
    error TenderHasBids();

    IERC7984 public immutable paymentToken;
    VeilBidAwardReceipt public immutable awardReceipt;
    uint256 public tenderCount;

    mapping(uint256 tenderId => Tender tender) private _tenders;
    mapping(uint256 tenderId => mapping(uint256 bidId => Bid bid))
        private _bids;
    mapping(uint256 tenderId => mapping(address vendor => bool approved))
        public isApprovedVendor;
    mapping(uint256 tenderId => mapping(address vendor => bool submitted))
        public hasSubmittedBid;

    event TenderCreated(
        uint256 indexed tenderId,
        address indexed buyer,
        bytes32 indexed metadataHash,
        address paymentToken,
        address reviewViewer,
        uint256 publicCeiling,
        uint64 bidDeadline,
        uint8 approvedVendorCount
    );
    event TenderFunded(uint256 indexed tenderId);
    event BidSubmitted(
        uint256 indexed tenderId,
        uint256 indexed bidId,
        address indexed vendor
    );
    event TenderClosed(
        uint256 indexed tenderId,
        uint64 closeBlock
    );
    event TenderAwarded(
        uint256 indexed tenderId,
        uint256 indexed winnerBidId,
        address indexed winner
    );
    event TenderRefunded(uint256 indexed tenderId, address indexed buyer);
    event TenderCancelled(uint256 indexed tenderId, address indexed buyer);
    event ViewerGranted(
        uint256 indexed tenderId,
        uint256 indexed bidId,
        address indexed viewer,
        address grantor
    );

    constructor(IERC7984 paymentToken_) {
        if (address(paymentToken_) == address(0)) {
            revert InvalidPaymentToken();
        }
        paymentToken = paymentToken_;
        awardReceipt = new VeilBidAwardReceipt();
    }

    function createTender(
        bytes32 metadataHash,
        uint256 publicCeiling,
        uint64 bidDeadline,
        address[] calldata approvedVendors
    ) external nonReentrant returns (uint256 tenderId) {
        tenderId = _initializeTender(
            msg.sender,
            msg.sender,
            metadataHash,
            publicCeiling,
            bidDeadline,
            approvedVendors
        );

        euint256 requested = Nox.toEuint256(publicCeiling);
        _attemptFunding(tenderId, requested);
    }

    function createTenderAuthorized(
        bytes32 metadataHash,
        uint256 publicCeiling,
        uint64 bidDeadline,
        address[] calldata approvedVendors,
        address reviewViewer,
        IVeilBidSafePreparationModule module,
        uint256 nonce
    ) external nonReentrant returns (uint256 tenderId) {
        if (
            module.safe() != msg.sender ||
            module.market() != address(this)
        ) {
            revert InvalidSafeModule();
        }

        bytes32 actionDataHash = hashTenderAction(
            msg.sender,
            reviewViewer,
            metadataHash,
            publicCeiling,
            bidDeadline,
            approvedVendors
        );
        bytes32 actionHash = module.computeActionHash(actionDataHash, nonce);

        tenderId = _initializeTender(
            msg.sender,
            reviewViewer,
            metadataHash,
            publicCeiling,
            bidDeadline,
            approvedVendors
        );
        _attemptFunding(
            tenderId,
            module.consumePreparedInput(actionHash)
        );
    }

    function confirmTenderFunding(
        uint256 tenderId,
        bytes calldata fundingProof
    ) external nonReentrant {
        Tender storage tender = _requireTender(tenderId);
        _requireStatus(tender, TenderStatus.FundingPending);

        bool exactlyFunded = Nox.publicDecrypt(
            tender.fundingMatchesCeiling,
            fundingProof
        );
        if (exactlyFunded) {
            tender.status = TenderStatus.Open;
            emit TenderFunded(tenderId);
        } else {
            tender.status = TenderStatus.Cancelled;
            emit TenderCancelled(tenderId, tender.buyer);
        }
    }

    function submitBid(
        uint256 tenderId,
        externalEuint256 encryptedPrice,
        bytes calldata inputProof
    ) external nonReentrant returns (uint256 bidId) {
        Tender storage tender = _requireTender(tenderId);
        _requireStatus(tender, TenderStatus.Open);
        if (block.timestamp >= tender.bidDeadline) {
            revert BidDeadlinePassed();
        }
        if (!isApprovedVendor[tenderId][msg.sender]) {
            revert NotApprovedVendor();
        }
        if (hasSubmittedBid[tenderId][msg.sender]) {
            revert AlreadySubmitted();
        }

        bidId = uint256(tender.bidCount) + 1;
        tender.bidCount = uint8(bidId);
        hasSubmittedBid[tenderId][msg.sender] = true;

        euint256 price = Nox.fromExternal(encryptedPrice, inputProof);
        euint256 sentinel = Nox.toEuint256(tender.publicCeiling + 1);
        ebool isPositive = Nox.gt(price, Nox.toEuint256(0));
        euint256 candidate = Nox.select(isPositive, price, sentinel);
        ebool isWithinCeiling = Nox.le(
            price,
            Nox.toEuint256(tender.publicCeiling)
        );
        candidate = Nox.select(isWithinCeiling, candidate, sentinel);
        ebool isBetter = Nox.lt(candidate, tender.encryptedBestPrice);

        tender.encryptedBestPrice = Nox.select(
            isBetter,
            candidate,
            tender.encryptedBestPrice
        );
        tender.encryptedWinnerBidId = Nox.select(
            isBetter,
            Nox.toEuint256(bidId),
            tender.encryptedWinnerBidId
        );
        _bids[tenderId][bidId] = Bid({
            vendor: msg.sender,
            submittedAt: uint64(block.timestamp),
            encryptedPrice: price
        });

        Nox.allowThis(price);
        Nox.addViewer(price, msg.sender);
        Nox.allowThis(tender.encryptedBestPrice);
        Nox.allowThis(tender.encryptedWinnerBidId);

        emit BidSubmitted(tenderId, bidId, msg.sender);
    }

    function closeTender(uint256 tenderId) external nonReentrant {
        Tender storage tender = _requireTender(tenderId);
        _requireStatus(tender, TenderStatus.Open);
        if (
            block.timestamp < tender.bidDeadline &&
            tender.bidCount < tender.approvedVendorCount
        ) {
            revert BidDeadlineNotReached();
        }

        tender.status = TenderStatus.Closed;
        tender.closeBlock = uint64(block.number);
        Nox.allowPublicDecryption(tender.encryptedWinnerBidId);

        emit TenderClosed(tenderId, tender.closeBlock);
    }

    function finalizeTender(
        uint256 tenderId,
        bytes calldata winnerProof
    ) external nonReentrant {
        Tender storage tender = _requireTender(tenderId);
        _requireStatus(tender, TenderStatus.Closed);

        uint256 proofDerivedWinnerBidId = Nox.publicDecrypt(
            tender.encryptedWinnerBidId,
            winnerProof
        );
        if (proofDerivedWinnerBidId == 0) {
            tender.status = TenderStatus.Refunded;
            _grantAutomaticReviewAccess(tenderId, tender);
            Nox.allowTransient(
                tender.escrowedBudget,
                address(paymentToken)
            );
            paymentToken.confidentialTransfer(
                tender.buyer,
                tender.escrowedBudget
            );
            emit TenderRefunded(tenderId, tender.buyer);
            return;
        }

        Bid storage winningBid = _bids[tenderId][proofDerivedWinnerBidId];
        if (
            proofDerivedWinnerBidId > tender.bidCount ||
            winningBid.vendor == address(0)
        ) {
            revert InvalidWinnerBidId();
        }

        tender.status = TenderStatus.Awarded;
        tender.winnerBidId = proofDerivedWinnerBidId;
        tender.winner = winningBid.vendor;
        _grantAutomaticReviewAccess(tenderId, tender);

        Nox.allowTransient(
            winningBid.encryptedPrice,
            address(paymentToken)
        );
        paymentToken.confidentialTransfer(
            winningBid.vendor,
            winningBid.encryptedPrice
        );

        euint256 remainder = Nox.sub(
            tender.escrowedBudget,
            winningBid.encryptedPrice
        );
        Nox.allowThis(remainder);
        Nox.allowTransient(remainder, address(paymentToken));
        paymentToken.confidentialTransfer(tender.buyer, remainder);

        awardReceipt.mint(
            tenderId,
            tender.buyer,
            winningBid.vendor,
            address(paymentToken)
        );
        emit TenderAwarded(
            tenderId,
            proofDerivedWinnerBidId,
            winningBid.vendor
        );
    }

    function cancelTender(uint256 tenderId) external nonReentrant {
        Tender storage tender = _requireTender(tenderId);
        _requireStatus(tender, TenderStatus.Open);
        if (msg.sender != tender.buyer) revert NotBuyer();
        if (tender.bidCount != 0) revert TenderHasBids();

        tender.status = TenderStatus.Cancelled;
        Nox.allowTransient(tender.escrowedBudget, address(paymentToken));
        paymentToken.confidentialTransfer(
            tender.buyer,
            tender.escrowedBudget
        );

        emit TenderCancelled(tenderId, tender.buyer);
    }

    function grantBidViewer(
        uint256 tenderId,
        uint256 bidId,
        address viewer
    ) external nonReentrant {
        if (viewer == address(0)) revert InvalidViewer();
        Tender storage tender = _requireTender(tenderId);
        Bid storage bid = _bids[tenderId][bidId];
        if (bid.vendor == address(0)) revert BidDoesNotExist();

        bool vendorGrant = msg.sender == bid.vendor;
        bool buyerGrant = msg.sender == tender.buyer &&
            tender.status != TenderStatus.Open &&
            tender.status != TenderStatus.FundingPending;
        if (!vendorGrant && !buyerGrant) {
            revert NotViewerGrantAuthority();
        }

        Nox.addViewer(bid.encryptedPrice, viewer);
        emit ViewerGranted(tenderId, bidId, viewer, msg.sender);
    }

    function hashTenderAction(
        address buyer,
        address reviewViewer,
        bytes32 metadataHash,
        uint256 publicCeiling,
        uint64 bidDeadline,
        address[] calldata approvedVendors
    ) public pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    buyer,
                    reviewViewer,
                    metadataHash,
                    publicCeiling,
                    bidDeadline,
                    approvedVendors
                )
            );
    }

    function getTender(
        uint256 tenderId
    ) external view returns (TenderView memory view_) {
        Tender storage tender = _requireTender(tenderId);
        view_ = TenderView({
            buyer: tender.buyer,
            reviewViewer: tender.reviewViewer,
            paymentToken: address(paymentToken),
            metadataHash: tender.metadataHash,
            publicCeiling: tender.publicCeiling,
            bidDeadline: tender.bidDeadline,
            closeBlock: tender.closeBlock,
            approvedVendorCount: tender.approvedVendorCount,
            bidCount: tender.bidCount,
            status: tender.status,
            winnerBidId: tender.winnerBidId,
            winner: tender.winner,
            escrowedBudgetHandle: euint256.unwrap(
                tender.escrowedBudget
            ),
            fundingCheckHandle: ebool.unwrap(
                tender.fundingMatchesCeiling
            ),
            encryptedBestPriceHandle: euint256.unwrap(
                tender.encryptedBestPrice
            ),
            encryptedWinnerBidIdHandle: euint256.unwrap(
                tender.encryptedWinnerBidId
            )
        });
    }

    function getBid(
        uint256 tenderId,
        uint256 bidId
    ) external view returns (BidView memory view_) {
        _requireTender(tenderId);
        Bid storage bid = _bids[tenderId][bidId];
        if (bid.vendor == address(0)) revert BidDoesNotExist();
        view_ = BidView({
            tenderId: tenderId,
            bidId: bidId,
            vendor: bid.vendor,
            submittedAt: bid.submittedAt,
            encryptedPriceHandle: euint256.unwrap(bid.encryptedPrice)
        });
    }

    function bidViewableBy(
        uint256 tenderId,
        uint256 bidId,
        address account
    ) external view returns (bool) {
        _requireTender(tenderId);
        Bid storage bid = _bids[tenderId][bidId];
        if (bid.vendor == address(0)) revert BidDoesNotExist();
        return Nox.isViewer(bid.encryptedPrice, account);
    }

    function winnerIdIsPubliclyDecryptable(
        uint256 tenderId
    ) external view returns (bool) {
        return
            Nox.isPubliclyDecryptable(
                _requireTender(tenderId).encryptedWinnerBidId
            );
    }

    function bestPriceIsPubliclyDecryptable(
        uint256 tenderId
    ) external view returns (bool) {
        return
            Nox.isPubliclyDecryptable(
                _requireTender(tenderId).encryptedBestPrice
            );
    }

    function canClose(uint256 tenderId) external view returns (bool) {
        Tender storage tender = _requireTender(tenderId);
        return
            tender.status == TenderStatus.Open &&
            (
                block.timestamp >= tender.bidDeadline ||
                tender.bidCount == tender.approvedVendorCount
            );
    }

    function canFinalize(uint256 tenderId) external view returns (bool) {
        return _requireTender(tenderId).status == TenderStatus.Closed;
    }

    /// @notice Legacy readiness alias retained for the deployed release ABI.
    /// @dev A true value does not authorize a standalone refund. Finalization
    ///      refunds only when the verified public winner proof resolves to zero.
    function canRefund(uint256 tenderId) external view returns (bool) {
        return _requireTender(tenderId).status == TenderStatus.Closed;
    }

    function _initializeTender(
        address buyer,
        address reviewViewer,
        bytes32 metadataHash,
        uint256 publicCeiling,
        uint64 bidDeadline,
        address[] calldata approvedVendors
    ) internal returns (uint256 tenderId) {
        if (buyer == address(0)) revert InvalidBuyer();
        if (reviewViewer == address(0)) revert InvalidViewer();
        if (metadataHash == bytes32(0)) revert InvalidMetadata();
        if (publicCeiling == 0 || publicCeiling == type(uint256).max) {
            revert InvalidCeiling();
        }
        if (bidDeadline <= block.timestamp) revert InvalidDeadline();
        if (
            approvedVendors.length == 0 ||
            approvedVendors.length > MAX_BIDS
        ) {
            revert InvalidVendorCount();
        }

        tenderId = ++tenderCount;
        Tender storage tender = _tenders[tenderId];
        tender.buyer = buyer;
        tender.reviewViewer = reviewViewer;
        tender.metadataHash = metadataHash;
        tender.publicCeiling = publicCeiling;
        tender.bidDeadline = bidDeadline;
        tender.approvedVendorCount = uint8(approvedVendors.length);
        tender.status = TenderStatus.FundingPending;
        tender.encryptedBestPrice = Nox.toEuint256(publicCeiling + 1);
        tender.encryptedWinnerBidId = Nox.toEuint256(0);
        Nox.allowThis(tender.encryptedBestPrice);
        Nox.allowThis(tender.encryptedWinnerBidId);

        for (uint256 index = 0; index < approvedVendors.length; ++index) {
            address vendor = approvedVendors[index];
            if (vendor == address(0)) revert InvalidVendor();
            if (isApprovedVendor[tenderId][vendor]) {
                revert DuplicateVendor();
            }
            isApprovedVendor[tenderId][vendor] = true;
        }

        emit TenderCreated(
            tenderId,
            buyer,
            metadataHash,
            address(paymentToken),
            reviewViewer,
            publicCeiling,
            bidDeadline,
            uint8(approvedVendors.length)
        );
    }

    function _grantAutomaticReviewAccess(
        uint256 tenderId,
        Tender storage tender
    ) internal {
        for (uint256 bidId = 1; bidId <= tender.bidCount; ++bidId) {
            Nox.addViewer(
                _bids[tenderId][bidId].encryptedPrice,
                tender.reviewViewer
            );
            emit ViewerGranted(
                tenderId,
                bidId,
                tender.reviewViewer,
                tender.buyer
            );
        }
    }

    function _attemptFunding(
        uint256 tenderId,
        euint256 requested
    ) internal {
        Tender storage tender = _tenders[tenderId];
        Nox.allowTransient(requested, address(paymentToken));
        tender.escrowedBudget = paymentToken.confidentialTransferFrom(
            tender.buyer,
            address(this),
            requested
        );
        Nox.allowThis(tender.escrowedBudget);

        tender.fundingMatchesCeiling = Nox.eq(
            tender.escrowedBudget,
            Nox.toEuint256(tender.publicCeiling)
        );
        Nox.allowThis(tender.fundingMatchesCeiling);
        Nox.allowPublicDecryption(tender.fundingMatchesCeiling);
    }

    function _requireTender(
        uint256 tenderId
    ) internal view returns (Tender storage tender) {
        tender = _tenders[tenderId];
        if (tender.buyer == address(0)) revert TenderDoesNotExist();
    }

    function _requireStatus(
        Tender storage tender,
        TenderStatus expected
    ) internal view {
        if (tender.status != expected) {
            revert InvalidStatus(expected, tender.status);
        }
    }
}
