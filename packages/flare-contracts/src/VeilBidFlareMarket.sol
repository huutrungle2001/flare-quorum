// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "./interfaces/IERC20.sol";
import {IFtsoV2} from "./interfaces/IFtsoV2.sol";
import {IFlareTeeManager} from "./interfaces/IFlareTeeManager.sol";
import {ITeeExtensionRegistry} from "./interfaces/ITeeExtensionRegistry.sol";
import {VeilBidFlareAwardReceipt} from "./VeilBidFlareAwardReceipt.sol";

/// @title VeilBidFlareMarket
/// @notice FTestXRP escrow and threshold-result verifier for Coston2.
/// @dev Bid contents never enter this contract. FCC supplies signed public result facts.
contract VeilBidFlareMarket {
    uint256 public constant COSTON2_CHAIN_ID = 114;
    uint256 public constant MAX_BIDS = 8;
    uint256 public constant TEE_COUNT = 3;
    uint8 public constant RESULT_THRESHOLD = 2;
    uint64 public constant FTSO_MAX_AGE = 300;

    bytes32 public constant RECEIPT_DOMAIN = keccak256("VEILBID_BID_RECEIPT_V1");
    bytes32 public constant RESULT_DOMAIN = keccak256("VEILBID_SELECTION_RESULT_V1");
    bytes32 public constant EMPTY_BID_ROOT = keccak256("VEILBID_EMPTY_BID_ROOT_V1");
    bytes32 public constant BID_ROOT_DOMAIN = keccak256("VEILBID_BID_ROOT_V1");
    // forge-lint: disable-next-line(unsafe-typecast)
    bytes32 public constant OP_TYPE_SELECTION = bytes32("VEILBID_SELECTION");
    // forge-lint: disable-next-line(unsafe-typecast)
    bytes32 public constant OP_COMMAND_SELECT = bytes32("SELECT_V1");
    // forge-lint: disable-next-line(unsafe-typecast)
    bytes32 public constant TEE_ACTION_RESULT_PREFIX = bytes32("TEE_ACTION_RESULT");
    bytes32 public constant SUBMIT_TAG_HASH = keccak256("submit");
    bytes32 public constant THRESHOLD_TAG_HASH = keccak256("threshold");

    enum TenderStatus {
        FundingPending,
        Open,
        Closed,
        ComputePending,
        Awarded,
        Refunded,
        Cancelled
    }

    struct TenderTerms {
        bytes32 metadataHash;
        bytes32 rulesHash;
        uint256 publicCeilingXrp;
        uint64 bidDeadline;
        address[] approvedVendors;
        uint256 extensionId;
        bytes32 codeVersion;
        address[3] teeIds;
        bytes32[3] teeKeyFingerprints;
        bytes21 ftsoFeedId;
    }

    struct Tender {
        address buyer;
        bytes32 metadataHash;
        bytes32 rulesHash;
        uint256 publicCeilingXrp;
        uint64 bidDeadline;
        uint64 closeBlock;
        uint256 bidCount;
        uint8 approvedVendorCount;
        uint8 commonQuorumBitmap;
        bytes32 orderedBidRoot;
        uint256 extensionId;
        bytes32 codeVersion;
        bytes21 ftsoFeedId;
        uint256 ftsoValue;
        int8 ftsoDecimals;
        uint64 ftsoTimestamp;
        uint256 resultNonce;
        uint64 resultExpiry;
        bytes32 requestId;
        TenderStatus status;
        address[3] teeIds;
        bytes32[3] teeKeyFingerprints;
    }

    struct BidReceipt {
        uint16 schemaVersion;
        address vendor;
        uint256 submissionNonce;
        bytes32 plaintextCommitment;
        address teeId;
        uint64 expiry;
    }

    struct BidReference {
        address vendor;
        uint256 submissionNonce;
        bytes32 plaintextCommitment;
        uint8 receiptBitmap;
        uint64 receiptExpiry;
        uint64 acceptedBlock;
    }

    struct SelectionBidReference {
        uint256 bidId;
        address vendor;
        uint256 submissionNonce;
        bytes32 plaintextCommitment;
        uint8 receiptBitmap;
        uint64 acceptedBlock;
    }

    struct SelectionRequest {
        uint16 schemaVersion;
        uint256 chainId;
        address market;
        uint256 extensionId;
        bytes32 codeVersion;
        uint256 tenderId;
        bytes32 rulesHash;
        uint256 publicCeilingXrp;
        uint64 bidDeadline;
        bytes32 orderedBidRoot;
        uint8 quorumBitmap;
        bytes21 ftsoFeedId;
        uint256 ftsoValue;
        int8 ftsoDecimals;
        uint64 ftsoTimestamp;
        uint64 closeBlock;
        uint256 resultNonce;
        uint64 resultExpiry;
        SelectionBidReference[] bidReferences;
    }

    struct SelectionResult {
        uint16 schemaVersion;
        uint256 chainId;
        address market;
        uint256 extensionId;
        bytes32 codeVersion;
        uint256 tenderId;
        bytes32 rulesHash;
        bytes32 orderedBidRoot;
        uint8 quorumBitmap;
        bytes21 ftsoFeedId;
        uint256 ftsoValue;
        int8 ftsoDecimals;
        uint64 ftsoTimestamp;
        uint64 closeBlock;
        uint256 winnerBidId;
        address winner;
        uint256 winningAmountXrp;
        uint256 resultNonce;
        uint64 expiry;
    }

    struct TeeActionProof {
        bytes32 actionId;
        bytes32 submissionTagHash;
        uint8 status;
        bytes signature;
    }

    IERC20 public immutable paymentToken;
    IFlareTeeManager public immutable teeManager;
    IFtsoV2 public immutable ftso;
    ITeeExtensionRegistry public immutable teeExtensionRegistry;
    VeilBidFlareAwardReceipt public immutable awardReceipt;
    uint256 public tenderCount;

    mapping(uint256 => Tender) private tenders;
    mapping(uint256 => mapping(address => bool)) public isApprovedVendor;
    mapping(uint256 => mapping(address => bool)) public hasSubmittedBid;
    mapping(uint256 => mapping(address => uint8)) public receiptBitmapByVendor;
    mapping(uint256 => mapping(address => uint256)) public bidIdByVendor;
    mapping(uint256 => mapping(address => BidReference)) private pendingBidReferences;
    mapping(uint256 => mapping(uint256 => BidReference)) private bidReferences;

    error AlreadySubmitted();
    error BidDeadlineNotReached();
    error BidDeadlinePassed();
    error InvalidAddress();
    error InvalidCodeVersion();
    error InvalidDeadline();
    error InvalidFeed();
    error InvalidReceipt();
    error InvalidResult();
    error InvalidStatus(TenderStatus expected, TenderStatus actual);
    error InvalidTender();
    error InvalidTokenTransfer();
    error NotApprovedVendor();
    error NotBuyer();
    error NotEnoughTeeIdentities();
    error NotRegisteredTee();
    error TenderDoesNotExist();

    event TenderCreated(uint256 indexed tenderId, address indexed buyer, bytes32 indexed rulesHash, uint256 ceiling);
    event BidReceiptAccepted(
        uint256 indexed tenderId, uint256 indexed bidId, address indexed vendor, uint8 receiptBitmap
    );
    event TenderClosed(
        uint256 indexed tenderId, uint64 closeBlock, uint256 ftsoValue, int8 ftsoDecimals, uint64 ftsoTimestamp
    );
    event SelectionRequested(uint256 indexed tenderId, bytes32 indexed requestId, uint256 indexed resultNonce);
    event TenderAwarded(uint256 indexed tenderId, uint256 indexed winnerBidId, address indexed winner, uint256 amount);
    event TenderRefunded(uint256 indexed tenderId, address indexed buyer);
    event TenderCancelled(uint256 indexed tenderId, address indexed buyer);

    bool private entered;

    modifier nonReentrant() {
        require(!entered, "reentrant");
        entered = true;
        _;
        entered = false;
    }

    constructor(
        IERC20 paymentToken_,
        IFlareTeeManager teeManager_,
        IFtsoV2 ftso_,
        ITeeExtensionRegistry teeExtensionRegistry_
    ) {
        if (
            address(paymentToken_) == address(0) || address(teeManager_) == address(0) || address(ftso_) == address(0)
                || address(teeExtensionRegistry_) == address(0)
        ) {
            revert InvalidAddress();
        }
        if (
            address(paymentToken_).code.length == 0 || address(teeManager_).code.length == 0
                || address(ftso_).code.length == 0 || address(teeExtensionRegistry_).code.length == 0
        ) {
            revert InvalidAddress();
        }
        paymentToken = paymentToken_;
        teeManager = teeManager_;
        ftso = ftso_;
        teeExtensionRegistry = teeExtensionRegistry_;
        awardReceipt = new VeilBidFlareAwardReceipt();
    }

    function createTender(TenderTerms calldata terms) external nonReentrant returns (uint256 tenderId) {
        if (
            terms.metadataHash == bytes32(0) || terms.rulesHash == bytes32(0) || terms.publicCeilingXrp == 0
                || terms.publicCeilingXrp > type(uint64).max
        ) {
            revert InvalidTender();
        }
        if (terms.bidDeadline <= block.timestamp || terms.bidDeadline > block.timestamp + 30 days) {
            revert InvalidDeadline();
        }
        if (terms.approvedVendors.length == 0 || terms.approvedVendors.length > MAX_BIDS) revert InvalidTender();
        if (terms.extensionId < 0x10000 || terms.codeVersion == bytes32(0)) revert InvalidCodeVersion();
        if (teeExtensionRegistry.getTeeExtensionInstructionsSender(terms.extensionId) != address(this)) {
            revert InvalidCodeVersion();
        }
        for (uint256 i; i < TEE_COUNT; ++i) {
            if (terms.teeIds[i] == address(0) || terms.teeKeyFingerprints[i] == bytes32(0)) {
                revert NotEnoughTeeIdentities();
            }
            if (teeManager.getTeeMachineStatus(terms.teeIds[i]) != 2) revert NotRegisteredTee();
            if (teeManager.getExtensionId(terms.teeIds[i]) != terms.extensionId) revert NotRegisteredTee();
            IFlareTeeManager.TeeMachineWithAttestationData memory machine =
                teeManager.getTeeMachineWithAttestationData(terms.teeIds[i]);
            if (machine.teeId != terms.teeIds[i] || machine.codeHash != terms.codeVersion) {
                revert NotRegisteredTee();
            }
            IFlareTeeManager.PublicKey memory publicKey = teeManager.getPublicKey(terms.teeIds[i]);
            if (keccak256(abi.encode(publicKey.x, publicKey.y)) != terms.teeKeyFingerprints[i]) {
                revert NotRegisteredTee();
            }
            for (uint256 j; j < i; ++j) {
                if (terms.teeIds[i] == terms.teeIds[j]) revert NotEnoughTeeIdentities();
            }
        }
        if (terms.ftsoFeedId == bytes21(0)) revert InvalidFeed();
        uint256 balanceBefore = paymentToken.balanceOf(address(this));
        if (!paymentToken.transferFrom(msg.sender, address(this), terms.publicCeilingXrp)) {
            revert InvalidTokenTransfer();
        }
        if (paymentToken.balanceOf(address(this)) - balanceBefore != terms.publicCeilingXrp) {
            revert InvalidTokenTransfer();
        }

        tenderId = ++tenderCount;
        Tender storage tender = tenders[tenderId];
        tender.buyer = msg.sender;
        tender.metadataHash = terms.metadataHash;
        tender.rulesHash = terms.rulesHash;
        tender.publicCeilingXrp = terms.publicCeilingXrp;
        tender.bidDeadline = terms.bidDeadline;
        tender.approvedVendorCount = uint8(terms.approvedVendors.length);
        tender.commonQuorumBitmap = 0x07;
        tender.orderedBidRoot = EMPTY_BID_ROOT;
        tender.extensionId = terms.extensionId;
        tender.codeVersion = terms.codeVersion;
        tender.ftsoFeedId = terms.ftsoFeedId;
        tender.status = TenderStatus.Open;
        for (uint256 i; i < TEE_COUNT; ++i) {
            tender.teeIds[i] = terms.teeIds[i];
            tender.teeKeyFingerprints[i] = terms.teeKeyFingerprints[i];
        }
        for (uint256 i; i < terms.approvedVendors.length; ++i) {
            address vendor = terms.approvedVendors[i];
            if (vendor == address(0) || isApprovedVendor[tenderId][vendor]) revert InvalidAddress();
            isApprovedVendor[tenderId][vendor] = true;
        }
        emit TenderCreated(tenderId, msg.sender, terms.rulesHash, terms.publicCeilingXrp);
    }

    function submitBidReceipt(uint256 tenderId, BidReceipt calldata receipt, bytes calldata signature)
        external
        nonReentrant
        returns (uint256 bidId)
    {
        Tender storage tender = _requireTender(tenderId);
        if (tender.status != TenderStatus.Open) revert InvalidStatus(TenderStatus.Open, tender.status);
        if (block.timestamp >= tender.bidDeadline) revert BidDeadlinePassed();
        if (receipt.vendor != msg.sender || !isApprovedVendor[tenderId][msg.sender]) revert NotApprovedVendor();
        if (hasSubmittedBid[tenderId][msg.sender]) revert AlreadySubmitted();
        if (
            receipt.schemaVersion != 1 || receipt.submissionNonce == 0 || receipt.plaintextCommitment == bytes32(0)
                || receipt.teeId == address(0) || receipt.expiry < block.timestamp
        ) revert InvalidReceipt();
        uint8 existing = receiptBitmapByVendor[tenderId][msg.sender];
        BidReference storage pending = pendingBidReferences[tenderId][msg.sender];
        if (existing != 0 && pending.receiptExpiry < block.timestamp) {
            delete pendingBidReferences[tenderId][msg.sender];
            receiptBitmapByVendor[tenderId][msg.sender] = 0;
            existing = 0;
        }
        uint8 teeIndex = _teeIndex(tender, receipt.teeId);
        uint8 bit = uint8(2 ** teeIndex);
        if ((existing & bit) != 0) revert InvalidReceipt();
        bytes32 digest = keccak256(
            abi.encode(
                RECEIPT_DOMAIN,
                receipt.schemaVersion,
                COSTON2_CHAIN_ID,
                address(this),
                tender.extensionId,
                tender.codeVersion,
                tenderId,
                tender.rulesHash,
                receipt.vendor,
                receipt.submissionNonce,
                receipt.plaintextCommitment,
                receipt.teeId,
                receipt.expiry
            )
        );
        if (_recoverEthSigned(digest, signature) != receipt.teeId) revert InvalidReceipt();
        pending = pendingBidReferences[tenderId][msg.sender];
        if (existing == 0) {
            pending.vendor = msg.sender;
            pending.submissionNonce = receipt.submissionNonce;
            pending.plaintextCommitment = receipt.plaintextCommitment;
            pending.receiptExpiry = receipt.expiry;
        } else if (
            pending.submissionNonce != receipt.submissionNonce
                || pending.plaintextCommitment != receipt.plaintextCommitment || pending.receiptExpiry != receipt.expiry
        ) {
            revert InvalidReceipt();
        }
        receiptBitmapByVendor[tenderId][msg.sender] = existing | bit;
        if (_bitCount(existing | bit) >= RESULT_THRESHOLD) {
            uint8 nextCommonQuorum = tender.commonQuorumBitmap & (existing | bit);
            if (_bitCount(nextCommonQuorum) < RESULT_THRESHOLD) revert InvalidReceipt();
            bidId = ++tender.bidCount;
            bidIdByVendor[tenderId][msg.sender] = bidId;
            hasSubmittedBid[tenderId][msg.sender] = true;
            uint64 acceptedBlock = uint64(block.number);
            bidReferences[tenderId][bidId] = BidReference(
                msg.sender,
                receipt.submissionNonce,
                receipt.plaintextCommitment,
                existing | bit,
                receipt.expiry,
                acceptedBlock
            );
            delete pendingBidReferences[tenderId][msg.sender];
            tender.commonQuorumBitmap = nextCommonQuorum;
            tender.orderedBidRoot = keccak256(
                abi.encode(
                    BID_ROOT_DOMAIN,
                    tender.orderedBidRoot,
                    tenderId,
                    bidId,
                    msg.sender,
                    receipt.plaintextCommitment,
                    existing | bit,
                    acceptedBlock
                )
            );
            emit BidReceiptAccepted(tenderId, bidId, msg.sender, existing | bit);
        }
    }

    function closeTender(uint256 tenderId) external nonReentrant {
        Tender storage tender = _requireTender(tenderId);
        if (tender.status != TenderStatus.Open) revert InvalidStatus(TenderStatus.Open, tender.status);
        if (block.timestamp < tender.bidDeadline && tender.bidCount < tender.approvedVendorCount) {
            revert BidDeadlineNotReached();
        }
        (uint256 feedValue, int8 feedDecimals, uint64 feedTimestamp) = ftso.getFeedById(tender.ftsoFeedId);
        if (feedValue == 0 || feedTimestamp > block.timestamp || block.timestamp - feedTimestamp > FTSO_MAX_AGE) {
            revert InvalidFeed();
        }
        tender.ftsoValue = feedValue;
        tender.ftsoDecimals = feedDecimals;
        tender.ftsoTimestamp = feedTimestamp;
        tender.status = TenderStatus.Closed;
        tender.closeBlock = uint64(block.number);
        emit TenderClosed(tenderId, tender.closeBlock, tender.ftsoValue, tender.ftsoDecimals, tender.ftsoTimestamp);
    }

    function requestSelection(uint256 tenderId) external payable nonReentrant {
        Tender storage tender = _requireTender(tenderId);
        if (tender.status != TenderStatus.Closed) revert InvalidStatus(TenderStatus.Closed, tender.status);
        tender.resultNonce =
            uint256(keccak256(abi.encode(address(this), tenderId, tender.closeBlock, tender.orderedBidRoot)));
        tender.resultExpiry = uint64(block.timestamp + 1 hours);
        address[] memory teeIds = _commonTeeIds(tender);
        address[] memory cosigners = new address[](0);
        SelectionBidReference[] memory references = _selectionBidReferences(tenderId, tender);
        ITeeExtensionRegistry.TeeInstructionParams memory params = ITeeExtensionRegistry.TeeInstructionParams({
            opType: OP_TYPE_SELECTION,
            opCommand: OP_COMMAND_SELECT,
            message: abi.encode(
                SelectionRequest({
                    schemaVersion: 1,
                    chainId: COSTON2_CHAIN_ID,
                    market: address(this),
                    extensionId: tender.extensionId,
                    codeVersion: tender.codeVersion,
                    tenderId: tenderId,
                    rulesHash: tender.rulesHash,
                    publicCeilingXrp: tender.publicCeilingXrp,
                    bidDeadline: tender.bidDeadline,
                    orderedBidRoot: tender.orderedBidRoot,
                    quorumBitmap: tender.commonQuorumBitmap,
                    ftsoFeedId: tender.ftsoFeedId,
                    ftsoValue: tender.ftsoValue,
                    ftsoDecimals: tender.ftsoDecimals,
                    ftsoTimestamp: tender.ftsoTimestamp,
                    closeBlock: tender.closeBlock,
                    resultNonce: tender.resultNonce,
                    resultExpiry: tender.resultExpiry,
                    bidReferences: references
                })
            ),
            cosigners: cosigners,
            cosignersThreshold: 0,
            claimBackAddress: msg.sender
        });
        tender.requestId = teeExtensionRegistry.sendInstructions{value: msg.value}(teeIds, params);
        if (tender.requestId == bytes32(0)) revert InvalidResult();
        tender.status = TenderStatus.ComputePending;
        emit SelectionRequested(tenderId, tender.requestId, tender.resultNonce);
    }

    function finalizeTender(uint256 tenderId, SelectionResult calldata result, TeeActionProof[] calldata proofs)
        external
        nonReentrant
    {
        Tender storage tender = _requireTender(tenderId);
        if (tender.status != TenderStatus.ComputePending) {
            revert InvalidStatus(TenderStatus.ComputePending, tender.status);
        }
        if (
            result.schemaVersion != 1 || result.chainId != COSTON2_CHAIN_ID || result.market != address(this)
                || result.extensionId != tender.extensionId || result.codeVersion != tender.codeVersion
                || result.tenderId != tenderId || result.rulesHash != tender.rulesHash
                || result.orderedBidRoot != tender.orderedBidRoot || result.ftsoFeedId != tender.ftsoFeedId
                || result.ftsoValue != tender.ftsoValue || result.ftsoDecimals != tender.ftsoDecimals
                || result.ftsoTimestamp != tender.ftsoTimestamp || result.closeBlock != tender.closeBlock
                || result.resultNonce != tender.resultNonce || result.expiry != tender.resultExpiry
                || result.expiry < block.timestamp
        ) revert InvalidResult();
        if (result.quorumBitmap != tender.commonQuorumBitmap || _bitCount(result.quorumBitmap) < RESULT_THRESHOLD) {
            revert InvalidResult();
        }
        if (result.winnerBidId == 0) {
            if (result.winner != address(0) || result.winningAmountXrp != 0) revert InvalidResult();
        } else {
            BidReference storage winningBid = bidReferences[tenderId][result.winnerBidId];
            if (
                winningBid.vendor == address(0) || result.winner != winningBid.vendor || result.winningAmountXrp == 0
                    || result.winningAmountXrp > tender.publicCeilingXrp
            ) revert InvalidResult();
        }
        bytes memory resultData = abi.encode(result);
        uint8 seen;
        uint256 valid;
        for (uint256 i; i < proofs.length; ++i) {
            TeeActionProof calldata proof = proofs[i];
            if (
                proof.actionId != tender.requestId
                    || (proof.submissionTagHash != SUBMIT_TAG_HASH && proof.submissionTagHash != THRESHOLD_TAG_HASH)
                    || proof.status != 1
            ) revert InvalidResult();
            bytes32 actionResultHash = keccak256(
                abi.encodePacked(keccak256(resultData), proof.actionId, proof.submissionTagHash, proof.status)
            );
            bytes32 signedPayload = keccak256(abi.encode(TEE_ACTION_RESULT_PREFIX, COSTON2_CHAIN_ID, actionResultHash));
            address signer = _recoverEthSigned(signedPayload, proof.signature);
            if (teeManager.getTeeMachineStatus(signer) != 2 || teeManager.getExtensionId(signer) != tender.extensionId) revert InvalidResult();
            uint8 index = _teeIndex(tender, signer);
            uint8 bit = uint8(2 ** index);
            if ((result.quorumBitmap & bit) == 0 || (seen & bit) != 0) revert InvalidResult();
            seen |= bit;
            ++valid;
        }
        if (valid < RESULT_THRESHOLD) revert InvalidResult();
        tender.status = result.winnerBidId == 0 ? TenderStatus.Refunded : TenderStatus.Awarded;
        uint256 buyerRemainder = tender.publicCeilingXrp - result.winningAmountXrp;
        if (result.winnerBidId != 0) {
            awardReceipt.mint(
                VeilBidFlareAwardReceipt.Award({
                    tenderId: tenderId,
                    winnerBidId: result.winnerBidId,
                    buyer: tender.buyer,
                    winner: result.winner,
                    paymentToken: address(paymentToken),
                    amount: result.winningAmountXrp,
                    rulesHash: tender.rulesHash,
                    orderedBidRoot: tender.orderedBidRoot,
                    resultDigest: _resultDigest(result),
                    finalizedAt: 0,
                    finalizedBlock: 0
                })
            );
            if (!paymentToken.transfer(result.winner, result.winningAmountXrp)) revert InvalidTokenTransfer();
        }
        if (!paymentToken.transfer(tender.buyer, buyerRemainder)) revert InvalidTokenTransfer();
        if (result.winnerBidId == 0) emit TenderRefunded(tenderId, tender.buyer);
        else emit TenderAwarded(tenderId, result.winnerBidId, result.winner, result.winningAmountXrp);
    }

    function cancelTender(uint256 tenderId) external nonReentrant {
        Tender storage tender = _requireTender(tenderId);
        if (tender.status != TenderStatus.Open) revert InvalidStatus(TenderStatus.Open, tender.status);
        if (msg.sender != tender.buyer) revert NotBuyer();
        if (tender.bidCount != 0) revert AlreadySubmitted();
        tender.status = TenderStatus.Cancelled;
        if (!paymentToken.transfer(tender.buyer, tender.publicCeilingXrp)) revert InvalidTokenTransfer();
        emit TenderCancelled(tenderId, tender.buyer);
    }

    function getTender(uint256 tenderId) external view returns (Tender memory) {
        return _requireTender(tenderId);
    }

    function getBidReference(uint256 tenderId, uint256 bidId) external view returns (BidReference memory) {
        _requireTender(tenderId);
        return bidReferences[tenderId][bidId];
    }

    function resultDigest(SelectionResult calldata result) external pure returns (bytes32) {
        return _resultDigest(result);
    }

    function _resultDigest(SelectionResult calldata result) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                RESULT_DOMAIN,
                result.schemaVersion,
                result.chainId,
                result.market,
                result.extensionId,
                result.codeVersion,
                result.tenderId,
                result.rulesHash,
                result.orderedBidRoot,
                result.quorumBitmap,
                result.ftsoFeedId,
                result.ftsoValue,
                result.ftsoDecimals,
                result.ftsoTimestamp,
                result.closeBlock,
                result.winnerBidId,
                result.winner,
                result.winningAmountXrp,
                result.resultNonce,
                result.expiry
            )
        );
    }

    function _requireTender(uint256 tenderId) internal view returns (Tender storage tender) {
        tender = tenders[tenderId];
        if (tender.buyer == address(0)) revert TenderDoesNotExist();
    }

    function _teeIndex(Tender storage tender, address teeId) internal view returns (uint8) {
        for (uint8 i; i < TEE_COUNT; ++i) {
            if (tender.teeIds[i] == teeId) return i;
        }
        revert InvalidReceipt();
    }

    function _selectionBidReferences(uint256 tenderId, Tender storage tender)
        internal
        view
        returns (SelectionBidReference[] memory references)
    {
        references = new SelectionBidReference[](tender.bidCount);
        for (uint256 i = 1; i <= tender.bidCount; ++i) {
            BidReference storage bid = bidReferences[tenderId][i];
            references[i - 1] = SelectionBidReference({
                bidId: i,
                vendor: bid.vendor,
                submissionNonce: bid.submissionNonce,
                plaintextCommitment: bid.plaintextCommitment,
                receiptBitmap: bid.receiptBitmap,
                acceptedBlock: bid.acceptedBlock
            });
        }
    }

    function _commonTeeIds(Tender storage tender) internal view returns (address[] memory ids) {
        ids = new address[](_bitCount(tender.commonQuorumBitmap));
        uint256 cursor;
        for (uint8 i; i < TEE_COUNT; ++i) {
            if ((tender.commonQuorumBitmap & uint8(2 ** i)) != 0) ids[cursor++] = tender.teeIds[i];
        }
    }

    function _recoverEthSigned(bytes32 digest, bytes calldata signature) internal pure returns (address signer) {
        if (signature.length != 65) revert InvalidReceipt();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) revert InvalidReceipt();
        if (uint256(s) > 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0) revert InvalidReceipt();
        bytes32 ethSignedDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        signer = ecrecover(ethSignedDigest, v, r, s);
        if (signer == address(0)) revert InvalidReceipt();
    }

    function _bitCount(uint8 bitmap) internal pure returns (uint8 count) {
        for (uint8 i; i < TEE_COUNT; ++i) {
            count += (bitmap & uint8(2 ** i)) == 0 ? 0 : 1;
        }
    }
}
