// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FlareQuorumMarketV2} from "../src/FlareQuorumMarketV2.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IFtsoV2} from "../src/interfaces/IFtsoV2.sol";
import {IFlareTeeManager} from "../src/interfaces/IFlareTeeManager.sol";
import {ITeeExtensionRegistry} from "../src/interfaces/ITeeExtensionRegistry.sol";
import {
    FlareTokenMock,
    FlareTeeManagerMock,
    FtsoV2Mock,
    TeeExtensionRegistryMarketMock
} from "./FlareQuorumMarketV2.t.sol";

interface InvariantVm {
    function addr(uint256 privateKey) external returns (address);
    function prank(address sender) external;
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 timestamp) external;
}

/// @notice Stateful multi-tender escrow conservation harness.
/// @dev Each invariant run executes award, zero-winner refund, cancellation,
/// and a pre-dispatch quorum-loss refund in one sequence, then checks that no
/// escrow remains trapped in the market.
contract FlareQuorumMarketV2InvariantTest {
    InvariantVm private constant vm = InvariantVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant TEE_KEY_1 = 0x1111;
    uint256 private constant TEE_KEY_2 = 0x2222;
    uint256 private constant TEE_KEY_3 = 0x3333;
    uint256 private constant VENDOR_KEY_1 = 0x4444;
    uint256 private constant VENDOR_KEY_2 = 0x5555;
    uint256 private constant VENDOR_KEY_3 = 0x6666;
    bytes21 private constant XRP_USD_FEED = 0x015852502f55534400000000000000000000000000;
    uint256 private constant INITIAL_BALANCE = 10_000;

    FlareTokenMock private token;
    FlareTeeManagerMock private manager;
    FtsoV2Mock private ftso;
    TeeExtensionRegistryMarketMock private registry;
    FlareQuorumMarketV2 private market;
    address[3] private teeIds;
    address[3] private vendors;

    function setUp() public {
        token = new FlareTokenMock();
        manager = new FlareTeeManagerMock();
        ftso = new FtsoV2Mock();
        registry = new TeeExtensionRegistryMarketMock();
        market = new FlareQuorumMarketV2(token, manager, ftso, registry);
        registry.setSender(address(market));

        teeIds = [vm.addr(TEE_KEY_1), vm.addr(TEE_KEY_2), vm.addr(TEE_KEY_3)];
        for (uint256 i; i < teeIds.length; ++i) {
            manager.setStatus(teeIds[i], 2);
            manager.setIdentity(
                teeIds[i],
                0x10001,
                keccak256("veilbid-fcc-v1"),
                IFlareTeeManager.PublicKey(keccak256(abi.encode("x", i)), keccak256(abi.encode("y", i)))
            );
        }
        vendors = [vm.addr(VENDOR_KEY_1), vm.addr(VENDOR_KEY_2), vm.addr(VENDOR_KEY_3)];
        ftso.setTimestamp(uint64(block.timestamp));
        token.mint(address(this), INITIAL_BALANCE);
        token.approve(address(market), type(uint256).max);
    }

    /// @notice The complete multi-tender sequence never leaves public escrow
    /// in the market and preserves the initial token supply.
    function testStatefulMultiTenderEscrowConservation() external {
        _settleAwardedTender(0, 1_000, 400);
        _settleZeroWinnerTender(1, 1_100);
        _cancelTender(2, 1_200);
        _refundUndispatchedTender(2, 1_300);

        uint256 distributed = token.balanceOf(address(this));
        for (uint256 i; i < vendors.length; ++i) {
            distributed += token.balanceOf(vendors[i]);
        }
        if (distributed != INITIAL_BALANCE || token.balanceOf(address(market)) != 0) {
            revert("multi-tender escrow conservation failed");
        }
    }

    function _settleAwardedTender(uint256 index, uint64 ceiling, uint64 amount) private {
        uint256 tenderId = _createTender(index, ceiling);
        _submitReceipts(tenderId, vendors[index]);
        market.closeTender(tenderId);
        market.requestSelection(tenderId);
        FlareQuorumMarketV2.Tender memory tender = market.getTender(tenderId);
        FlareQuorumMarketV2.SelectionResult memory result = _result(tenderId, tender, vendors[index], amount);
        market.finalizeTender(tenderId, result, _proofs(result, tender.requestId));
    }

    function _settleZeroWinnerTender(uint256 index, uint64 ceiling) private {
        uint256 tenderId = _createTender(index, ceiling);
        _submitReceipts(tenderId, vendors[index]);
        market.closeTender(tenderId);
        market.requestSelection(tenderId);
        FlareQuorumMarketV2.Tender memory tender = market.getTender(tenderId);
        FlareQuorumMarketV2.SelectionResult memory result = _result(tenderId, tender, address(0), 0);
        market.finalizeTender(tenderId, result, _proofs(result, tender.requestId));
    }

    function _cancelTender(uint256 index, uint64 ceiling) private {
        uint256 tenderId = _createTender(index, ceiling);
        market.cancelTender(tenderId);
    }

    function _refundUndispatchedTender(uint256 index, uint64 ceiling) private {
        uint256 tenderId = _createTender(index, ceiling);
        _submitReceipts(tenderId, vendors[index]);
        market.closeTender(tenderId);
        FlareQuorumMarketV2.Tender memory tender = market.getTender(tenderId);
        manager.setStatus(teeIds[1], 1);
        manager.setStatus(teeIds[2], 1);
        vm.warp(uint256(tender.closedAt) + market.CLOSED_REFUND_GRACE() + 1);
        market.refundUndispatchedTender(tenderId);
        if (market.getTender(tenderId).status != FlareQuorumMarketV2.TenderStatus.Refunded) {
            revert("undispatched tender did not terminate");
        }
        manager.setStatus(teeIds[1], 2);
        manager.setStatus(teeIds[2], 2);
    }

    function _createTender(uint256 index, uint64 ceiling) private returns (uint256) {
        return market.createTender(_terms(index, ceiling));
    }

    function _terms(uint256 index, uint64 ceiling) private view returns (FlareQuorumMarketV2.TenderTerms memory terms) {
        address[] memory approved = new address[](1);
        approved[0] = vendors[index];
        FlareQuorumMarketV2.CredentialRequirement[] memory credentials =
            new FlareQuorumMarketV2.CredentialRequirement[](0);
        FlareQuorumMarketV2.ScoringPolicy memory policy = FlareQuorumMarketV2.ScoringPolicy({
            schemaVersion: 1,
            ceilingXrpMicros: ceiling,
            bidDeadline: uint64(block.timestamp + 1 days),
            allowXrp: true,
            allowUsd: true,
            ftsoFeedId: XRP_USD_FEED,
            maxDeliveryDays: 30,
            minWarrantyDays: 12,
            maxWarrantyDays: 36,
            priceWeightBps: 6_000,
            deliveryWeightBps: 2_500,
            warrantyWeightBps: 1_500,
            requiredCredentials: credentials
        });
        terms.metadataHash = keccak256(abi.encode("stateful-tender", index));
        terms.scoringPolicy = policy;
        terms.approvedVendors = approved;
        terms.extensionId = 0x10001;
        terms.codeVersion = keccak256("veilbid-fcc-v1");
        terms.teeIds = teeIds;
        terms.teeKeyFingerprints =
            [manager.fingerprint(teeIds[0]), manager.fingerprint(teeIds[1]), manager.fingerprint(teeIds[2])];
    }

    function _submitReceipts(uint256 tenderId, address vendor) private {
        (FlareQuorumMarketV2.BidReceipt[3] memory receipts, bytes[3] memory signatures) = _receiptSet(tenderId, vendor);
        vm.prank(vendor);
        market.submitBidReceipts(tenderId, receipts, signatures);
    }

    function _receiptSet(uint256 tenderId, address vendor)
        private
        returns (FlareQuorumMarketV2.BidReceipt[3] memory receipts, bytes[3] memory signatures)
    {
        FlareQuorumMarketV2.Tender memory tender = market.getTender(tenderId);
        receipts[0] = FlareQuorumMarketV2.BidReceipt({
            schemaVersion: 1,
            vendor: vendor,
            submissionNonce: 1,
            plaintextCommitment: keccak256(abi.encode("stateful-bid", tenderId)),
            teeId: teeIds[0],
            expiry: uint64(block.timestamp + 1 hours)
        });
        receipts[1] = FlareQuorumMarketV2.BidReceipt({
            schemaVersion: 1,
            vendor: vendor,
            submissionNonce: 1,
            plaintextCommitment: receipts[0].plaintextCommitment,
            teeId: teeIds[1],
            expiry: receipts[0].expiry
        });
        receipts[2] = FlareQuorumMarketV2.BidReceipt({
            schemaVersion: 1,
            vendor: vendor,
            submissionNonce: 1,
            plaintextCommitment: receipts[0].plaintextCommitment,
            teeId: teeIds[2],
            expiry: receipts[0].expiry
        });
        signatures[0] = _signEthDigest(TEE_KEY_1, _receiptDigest(tenderId, tender, receipts[0]));
        signatures[1] = _signEthDigest(TEE_KEY_2, _receiptDigest(tenderId, tender, receipts[1]));
        signatures[2] = _signEthDigest(TEE_KEY_3, _receiptDigest(tenderId, tender, receipts[2]));
    }

    function _receiptDigest(
        uint256 tenderId,
        FlareQuorumMarketV2.Tender memory tender,
        FlareQuorumMarketV2.BidReceipt memory receipt
    ) private view returns (bytes32) {
        return keccak256(
            abi.encode(
                market.RECEIPT_DOMAIN(),
                receipt.schemaVersion,
                market.COSTON2_CHAIN_ID(),
                address(market),
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
    }

    function _result(uint256 tenderId, FlareQuorumMarketV2.Tender memory tender, address winner, uint64 amount)
        private
        view
        returns (FlareQuorumMarketV2.SelectionResult memory)
    {
        return FlareQuorumMarketV2.SelectionResult({
            schemaVersion: 1,
            chainId: 114,
            market: address(market),
            extensionId: tender.extensionId,
            codeVersion: tender.codeVersion,
            tenderId: tenderId,
            rulesHash: tender.rulesHash,
            orderedBidRoot: tender.orderedBidRoot,
            quorumBitmap: tender.commonQuorumBitmap,
            ftsoFeedId: tender.ftsoFeedId,
            ftsoValue: tender.ftsoValue,
            ftsoDecimals: tender.ftsoDecimals,
            ftsoTimestamp: tender.ftsoTimestamp,
            closeBlock: tender.closeBlock,
            winnerBidId: winner == address(0) ? 0 : 1,
            winner: winner,
            winningAmountXrp: amount,
            resultNonce: tender.resultNonce,
            expiry: tender.resultExpiry
        });
    }

    function _proofs(FlareQuorumMarketV2.SelectionResult memory result, bytes32 requestId)
        private
        returns (FlareQuorumMarketV2.TeeActionProof[] memory proofs)
    {
        proofs = new FlareQuorumMarketV2.TeeActionProof[](2);
        proofs[0] = _actionProof(result, requestId, TEE_KEY_1);
        proofs[1] = _actionProof(result, requestId, TEE_KEY_2);
    }

    function _actionProof(FlareQuorumMarketV2.SelectionResult memory result, bytes32 requestId, uint256 teeKey)
        private
        returns (FlareQuorumMarketV2.TeeActionProof memory)
    {
        bytes32 actionResultHash = keccak256(
            abi.encodePacked(keccak256(abi.encode(result)), requestId, market.SUBMIT_TAG_HASH(), uint8(1))
        );
        bytes32 signedPayload =
            keccak256(abi.encode(market.TEE_ACTION_RESULT_PREFIX(), market.COSTON2_CHAIN_ID(), actionResultHash));
        return FlareQuorumMarketV2.TeeActionProof({
            actionId: requestId,
            submissionTagHash: market.SUBMIT_TAG_HASH(),
            status: 1,
            signature: _signEthDigest(teeKey, signedPayload)
        });
    }

    function _signEthDigest(uint256 privateKey, bytes32 digest) private returns (bytes memory) {
        bytes32 ethSigned = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, ethSigned);
        return abi.encodePacked(r, s, v);
    }

    function _teeKey(uint256 index) private pure returns (uint256) {
        if (index == 0) return TEE_KEY_1;
        if (index == 1) return TEE_KEY_2;
        return TEE_KEY_3;
    }
}
