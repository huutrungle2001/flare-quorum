// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {VeilBidFlareMarket} from "../src/VeilBidFlareMarket.sol";
import {VeilBidFlareAwardReceipt} from "../src/VeilBidFlareAwardReceipt.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IFtsoV2} from "../src/interfaces/IFtsoV2.sol";
import {IFlareTeeManager} from "../src/interfaces/IFlareTeeManager.sol";
import {ITeeExtensionRegistry} from "../src/interfaces/ITeeExtensionRegistry.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function expectRevert(bytes4 selector) external;
    function expectRevert(bytes calldata reason) external;
    function prank(address sender) external;
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 timestamp) external;
}

contract FlareTokenMock is IERC20 {
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address account, uint256 amount) external {
        balanceOf[account] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        if (allowance[from][msg.sender] < amount || balanceOf[from] < amount) return false;
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        if (balanceOf[msg.sender] < amount) return false;
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

    contract FlareTeeManagerMock is IFlareTeeManager {
        mapping(address => uint8) public status;
        mapping(address => uint256) public extensionId;
        mapping(address => bytes32) public codeHash;
        mapping(address => PublicKey) private publicKeys;

        function setStatus(address teeId, uint8 nextStatus) external {
            status[teeId] = nextStatus;
        }

        function setIdentity(address teeId, uint256 nextExtensionId, bytes32 nextCodeHash, PublicKey calldata publicKey)
            external
        {
            extensionId[teeId] = nextExtensionId;
            codeHash[teeId] = nextCodeHash;
            publicKeys[teeId] = publicKey;
        }

        function getTeeMachineStatus(address teeId) external view override returns (uint8) {
            return status[teeId];
        }

        function getExtensionId(address teeId) external view override returns (uint256) {
            return extensionId[teeId];
        }

        function getPublicKey(address teeId) external view override returns (PublicKey memory) {
            return publicKeys[teeId];
        }

        function getTeeMachineWithAttestationData(address teeId)
            external
            view
            override
            returns (TeeMachineWithAttestationData memory)
        {
            return TeeMachineWithAttestationData(
                teeId, teeId, "https://tee.test", codeHash[teeId], keccak256("TEST_PLATFORM")
            );
        }

        function fingerprint(address teeId) external view returns (bytes32) {
            PublicKey memory publicKey = publicKeys[teeId];
            return keccak256(abi.encode(publicKey.x, publicKey.y));
        }
    }

    contract FtsoV2Mock is IFtsoV2 {
        uint256 public value = 250_000;
        int8 public decimals = 5;
        uint64 public timestamp;

        function setTimestamp(uint64 nextTimestamp) external {
            timestamp = nextTimestamp;
        }

        function setDecimals(int8 nextDecimals) external {
            decimals = nextDecimals;
        }

        function getFeedById(bytes21) external view override returns (uint256, int8, uint64) {
            return (value, decimals, timestamp);
        }
    }

    contract TeeExtensionRegistryMarketMock is ITeeExtensionRegistry {
        address public sender;
        bytes32 public nextRequestId = keccak256("veilbid-test-request");
        uint256 public selectedTeeCount;
        bytes32 public lastOpType;
        bytes32 public lastOpCommand;

        function setSender(address nextSender) external {
            sender = nextSender;
        }

        function setNextRequestId(bytes32 value) external {
            nextRequestId = value;
        }

        function sendInstructions(address[] calldata teeIds, TeeInstructionParams calldata params)
            external
            payable
            override
            returns (bytes32)
        {
            selectedTeeCount = teeIds.length;
            lastOpType = params.opType;
            lastOpCommand = params.opCommand;
            return nextRequestId;
        }

        function nextPublicExtensionId() external pure override returns (uint256) {
            return 0x10002;
        }

        function getTeeExtensionInstructionsSender(uint256 extensionId) external view override returns (address) {
            return extensionId == 0x10001 ? sender : address(0);
        }
    }

    contract VeilBidFlareMarketTest {
        Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
        uint256 private constant TEE_KEY_1 = 0x1111;
        uint256 private constant TEE_KEY_2 = 0x2222;
        uint256 private constant TEE_KEY_3 = 0x3333;
        uint256 private constant VENDOR_KEY = 0x4444;
        bytes21 private constant XRP_USD_FEED = 0x015852502f55534400000000000000000000000000;

        FlareTokenMock private token;
        FlareTeeManagerMock private manager;
        FtsoV2Mock private ftso;
        TeeExtensionRegistryMarketMock private registry;
        VeilBidFlareMarket private market;

        address[3] private teeIds;
        address private vendor;

        function setUp() public {
            token = new FlareTokenMock();
            manager = new FlareTeeManagerMock();
            ftso = new FtsoV2Mock();
            registry = new TeeExtensionRegistryMarketMock();
            market = new VeilBidFlareMarket(token, manager, ftso, registry);
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
            vendor = vm.addr(VENDOR_KEY);
            ftso.setTimestamp(uint64(block.timestamp));
            token.mint(address(this), 1_000);
            token.approve(address(market), 1_000);
        }

        function testThresholdFccLifecycleConservesFTestXrpEscrow() external {
            uint256 tenderId = market.createTender(_terms());
            _submitReceipt(tenderId, TEE_KEY_1, teeIds[0]);
            _submitReceipt(tenderId, TEE_KEY_2, teeIds[1]);

            VeilBidFlareMarket.BidReference memory bid = market.getBidReference(tenderId, 1);
            if (bid.vendor != vendor || bid.receiptBitmap != 3) revert("receipt quorum mismatch");
            bytes32 expectedRoot = keccak256(
                abi.encode(
                    market.BID_ROOT_DOMAIN(),
                    market.EMPTY_BID_ROOT(),
                    tenderId,
                    uint256(1),
                    vendor,
                    bid.plaintextCommitment,
                    uint8(3),
                    bid.acceptedBlock
                )
            );
            if (market.getTender(tenderId).orderedBidRoot != expectedRoot) revert("ordered root mismatch");

            market.closeTender(tenderId);
            market.requestSelection(tenderId);
            VeilBidFlareMarket.Tender memory tender = market.getTender(tenderId);
            if (tender.ftsoValue != 250_000 || tender.requestId != registry.nextRequestId()) {
                revert("close/request binding mismatch");
            }
            if (registry.selectedTeeCount() != 2) revert("common quorum not targeted");

            VeilBidFlareMarket.SelectionResult memory result = _winningResult(tenderId, tender);
            VeilBidFlareMarket.TeeActionProof[] memory proofs = new VeilBidFlareMarket.TeeActionProof[](2);
            proofs[0] = _actionProof(result, tender.requestId, TEE_KEY_1);
            proofs[1] = _actionProof(result, tender.requestId, TEE_KEY_2);
            market.finalizeTender(tenderId, result, proofs);

            if (token.balanceOf(vendor) != 400) revert("winner payout mismatch");
            if (token.balanceOf(address(this)) != 600) revert("buyer remainder mismatch");
            if (token.balanceOf(address(market)) != 0) revert("escrow not conserved");
            VeilBidFlareAwardReceipt receipt = market.awardReceipt();
            if (receipt.ownerOf(tenderId) != vendor) revert("award receipt owner mismatch");
            VeilBidFlareAwardReceipt.Award memory award = receipt.getAward(tenderId);
            if (
                award.winnerBidId != 1 || award.amount != 400 || award.rulesHash != tender.rulesHash
                    || award.orderedBidRoot != tender.orderedBidRoot
                    || award.resultDigest != market.resultDigest(result)
            ) revert("award receipt binding mismatch");
            vm.expectRevert(VeilBidFlareAwardReceipt.ReceiptIsNonTransferable.selector);
            vm.prank(vendor);
            receipt.transferFrom(vendor, address(this), tenderId);
            if (market.getTender(tenderId).status != VeilBidFlareMarket.TenderStatus.Awarded) {
                revert("not awarded");
            }
        }

        function testOrderedBidRootGoldenVectorMatchesGo() external view {
            bytes32 root = market.EMPTY_BID_ROOT();
            root = keccak256(
                abi.encode(
                    market.BID_ROOT_DOMAIN(),
                    root,
                    uint256(42),
                    uint256(1),
                    0x1000000000000000000000000000000000000001,
                    bytes32(uint256(0x1111)),
                    uint8(3),
                    uint64(33_500_001)
                )
            );
            root = keccak256(
                abi.encode(
                    market.BID_ROOT_DOMAIN(),
                    root,
                    uint256(42),
                    uint256(2),
                    0x2000000000000000000000000000000000000002,
                    bytes32(uint256(0x2222)),
                    uint8(7),
                    uint64(33_500_009)
                )
            );
            if (root != 0xd17b22ee6e48c6ac79cb32c203de07402bfcc9cb79a1f330c043ffa5ed327f77) {
                revert("Go/Solidity root drift");
            }
        }

        function testBidReceiptDigestGoldenVectorMatchesGo() external view {
            bytes32 digest = keccak256(
                abi.encode(
                    market.RECEIPT_DOMAIN(),
                    uint16(1),
                    uint256(114),
                    0x2000000000000000000000000000000000000002,
                    uint256(0x10001),
                    bytes32(uint256(0x1234)),
                    uint256(42),
                    0x57c12e9878a9218766f316c084784bfd97b102512847a30f999d32a2c8a5e444,
                    0x1000000000000000000000000000000000000001,
                    uint256(7),
                    0xb587b30b0b7743bc2e8179defb8431dac5d71cc616ef21909771cd785738c6aa,
                    0x3000000000000000000000000000000000000003,
                    uint64(900)
                )
            );
            if (digest != 0xb22f48371a8f6813be92a51d188dee114c4f188a6d7f201e3712ae8878fed658) {
                revert("Go/Solidity receipt drift");
            }
        }

        function testSelectionResultDigestGoldenVectorMatchesTypeScript() external view {
            VeilBidFlareMarket.SelectionResult memory result = VeilBidFlareMarket.SelectionResult({
                schemaVersion: 1,
                chainId: 114,
                market: address(0x1000000000000000000000000000000000000001),
                extensionId: 0x10001,
                codeVersion: bytes32(uint256(0x1111)),
                tenderId: 42,
                rulesHash: bytes32(uint256(0x2222)),
                orderedBidRoot: bytes32(uint256(0x3333)),
                quorumBitmap: 7,
                ftsoFeedId: bytes21(0x5852502f5553440000000000000000000000000000),
                ftsoValue: 250000,
                ftsoDecimals: 5,
                ftsoTimestamp: 1700000000,
                closeBlock: 33500010,
                winnerBidId: 1,
                winner: address(0x2000000000000000000000000000000000000002),
                winningAmountXrp: 400000,
                resultNonce: 3,
                expiry: 2000
            });
            if (
                market.resultDigest(result)
                    != bytes32(0xe323859bd3351602eb780752822de0adb41ffca6f2906f9095bb3b0a3baa9763)
            ) {
                revert("TypeScript result vector drift");
            }
        }

        function testRejectsStaleFtsoSnapshotAtClose() external {
            uint256 tenderId = market.createTender(_terms());
            VeilBidFlareMarket.Tender memory tender = market.getTender(tenderId);
            vm.warp(tender.bidDeadline + 1);
            ftso.setTimestamp(uint64(block.timestamp - market.FTSO_MAX_AGE() - 1));
            vm.expectRevert(VeilBidFlareMarket.InvalidFeed.selector);
            market.closeTender(tenderId);
        }

        function testPublicScoringPolicyIsValidatedHashedAndStored() external {
            VeilBidFlareMarket.TenderTerms memory terms = _terms();
            uint256 tenderId = market.createTender(terms);
            VeilBidFlareMarket.Tender memory tender = market.getTender(tenderId);
            VeilBidFlareMarket.ScoringPolicy memory stored = market.getScoringPolicy(tenderId);
            if (
                tender.rulesHash != market.scoringPolicyHash(stored) || stored.schemaVersion != 1
                    || stored.ceilingXrpMicros != 1_000 || stored.bidDeadline != tender.bidDeadline || !stored.allowXrp
                    || !stored.allowUsd || stored.ftsoFeedId != market.XRP_USD_FEED_ID()
                    || stored.priceWeightBps != 6_000 || stored.deliveryWeightBps != 2_500
                    || stored.warrantyWeightBps != 1_500 || stored.requiredCredentials.length != 0
            ) revert("public scoring policy mismatch");
        }

        function testScoringPolicyHashMatchesGoAndTypeScript() external view {
            VeilBidFlareMarket.CredentialRequirement[] memory credentials =
                new VeilBidFlareMarket.CredentialRequirement[](0);
            VeilBidFlareMarket.ScoringPolicy memory policy = VeilBidFlareMarket.ScoringPolicy({
                schemaVersion: 1,
                ceilingXrpMicros: 1_000,
                bidDeadline: 1_700_000_000,
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
            if (market.scoringPolicyHash(policy) != 0x8969aa4d8ee1fde2fbf813214484c245419fd278b1b791fe05997813315f8cb2)
            {
                revert("Go/TypeScript scoring policy hash drift");
            }
        }

        function testRejectsInvalidPublicScoringPolicy() external {
            VeilBidFlareMarket.TenderTerms memory terms = _terms();
            terms.scoringPolicy.deliveryWeightBps = 2_499;
            vm.expectRevert(VeilBidFlareMarket.InvalidScoringPolicy.selector);
            market.createTender(terms);

            terms = _terms();
            terms.scoringPolicy.ftsoFeedId = bytes21("XRP/USD");
            vm.expectRevert(VeilBidFlareMarket.InvalidScoringPolicy.selector);
            market.createTender(terms);

            terms = _terms();
            terms.scoringPolicy.requiredCredentials = new VeilBidFlareMarket.CredentialRequirement[](2);
            VeilBidFlareMarket.CredentialRequirement memory requirement = VeilBidFlareMarket.CredentialRequirement({
                credentialType: keccak256("qualified-vendor"), issuer: address(0x1234)
            });
            terms.scoringPolicy.requiredCredentials[0] = requirement;
            terms.scoringPolicy.requiredCredentials[1] = requirement;
            vm.expectRevert(VeilBidFlareMarket.InvalidScoringPolicy.selector);
            market.createTender(terms);
        }

        function testXrpOnlyTenderDoesNotDependOnFtso() external {
            VeilBidFlareMarket.TenderTerms memory terms = _terms();
            terms.scoringPolicy.allowUsd = false;
            terms.scoringPolicy.ftsoFeedId = bytes21(0);
            uint256 tenderId = market.createTender(terms);
            VeilBidFlareMarket.Tender memory tender = market.getTender(tenderId);
            vm.warp(tender.bidDeadline + 1);
            ftso.setTimestamp(0);
            market.closeTender(tenderId);
            tender = market.getTender(tenderId);
            if (tender.ftsoValue != 0 || tender.ftsoDecimals != 0 || tender.ftsoTimestamp != 0) {
                revert("XRP-only tender captured an FTSO value");
            }
        }

        function testRejectsUnsupportedFtsoDecimals() external {
            uint256 tenderId = market.createTender(_terms());
            VeilBidFlareMarket.Tender memory tender = market.getTender(tenderId);
            vm.warp(tender.bidDeadline + 1);
            ftso.setTimestamp(uint64(block.timestamp));
            ftso.setDecimals(19);
            vm.expectRevert(VeilBidFlareMarket.InvalidFeed.selector);
            market.closeTender(tenderId);
        }

        function testRejectsWrongActionResultBinding() external {
            uint256 tenderId = market.createTender(_terms());
            _submitReceipt(tenderId, TEE_KEY_1, teeIds[0]);
            _submitReceipt(tenderId, TEE_KEY_2, teeIds[1]);
            market.closeTender(tenderId);
            market.requestSelection(tenderId);
            VeilBidFlareMarket.Tender memory tender = market.getTender(tenderId);
            VeilBidFlareMarket.SelectionResult memory result = _winningResult(tenderId, tender);
            VeilBidFlareMarket.TeeActionProof[] memory proofs = new VeilBidFlareMarket.TeeActionProof[](2);
            proofs[0] = _actionProof(result, tender.requestId, TEE_KEY_1);
            proofs[1] = _actionProof(result, tender.requestId, TEE_KEY_2);
            proofs[1].actionId = keccak256("wrong-action");

            vm.expectRevert(VeilBidFlareMarket.InvalidResult.selector);
            market.finalizeTender(tenderId, result, proofs);
        }

        function testRejectsDuplicateResultSigner() external {
            (
                uint256 tenderId,
                VeilBidFlareMarket.Tender memory tender,
                VeilBidFlareMarket.SelectionResult memory result,
                VeilBidFlareMarket.TeeActionProof[] memory proofs
            ) = _preparedWinningSelection();
            proofs[1] = _actionProof(result, tender.requestId, TEE_KEY_1);
            vm.expectRevert(VeilBidFlareMarket.InvalidResult.selector);
            market.finalizeTender(tenderId, result, proofs);
        }

        function testRejectsResultExpiryDriftEvenWithValidSignatures() external {
            (
                uint256 tenderId,
                VeilBidFlareMarket.Tender memory tender,
                VeilBidFlareMarket.SelectionResult memory result,
                VeilBidFlareMarket.TeeActionProof[] memory proofs
            ) = _preparedWinningSelection();
            result.expiry += 1;
            proofs[0] = _actionProof(result, tender.requestId, TEE_KEY_1);
            proofs[1] = _actionProof(result, tender.requestId, TEE_KEY_2);
            vm.expectRevert(VeilBidFlareMarket.InvalidResult.selector);
            market.finalizeTender(tenderId, result, proofs);
        }

        function testFinalizationReplayCannotSettleTwice() external {
            (
                uint256 tenderId,
                VeilBidFlareMarket.Tender memory tender,
                VeilBidFlareMarket.SelectionResult memory result,
                VeilBidFlareMarket.TeeActionProof[] memory proofs
            ) = _preparedWinningSelection();
            market.finalizeTender(tenderId, result, proofs);
            vm.expectRevert(
                abi.encodeWithSelector(
                    VeilBidFlareMarket.InvalidStatus.selector,
                    VeilBidFlareMarket.TenderStatus.ComputePending,
                    VeilBidFlareMarket.TenderStatus.Awarded
                )
            );
            market.finalizeTender(tenderId, result, proofs);
            if (tender.buyer == address(0)) revert("invalid fixture");
        }

        function testExpiredSelectionRetriesWithFreshRequestAndNonce() external {
            (
                uint256 tenderId,
                VeilBidFlareMarket.Tender memory firstTender,
                VeilBidFlareMarket.SelectionResult memory staleResult,
                VeilBidFlareMarket.TeeActionProof[] memory staleProofs
            ) = _preparedWinningSelection();
            if (firstTender.selectionAttempt != 1 || firstTender.selectionStartedAt == 0) {
                revert("first selection attempt missing");
            }
            vm.warp(firstTender.resultExpiry);
            vm.expectRevert(VeilBidFlareMarket.SelectionStillLive.selector);
            market.retrySelection(tenderId);

            bytes32 secondRequestId = keccak256("veilbid-test-request-2");
            registry.setNextRequestId(secondRequestId);
            vm.warp(firstTender.resultExpiry + 1);
            market.retrySelection(tenderId);
            VeilBidFlareMarket.Tender memory secondTender = market.getTender(tenderId);
            if (
                secondTender.selectionAttempt != 2 || secondTender.requestId != secondRequestId
                    || secondTender.resultNonce == firstTender.resultNonce
                    || secondTender.selectionStartedAt != firstTender.selectionStartedAt
            ) revert("retry binding mismatch");

            vm.expectRevert(VeilBidFlareMarket.InvalidResult.selector);
            market.finalizeTender(tenderId, staleResult, staleProofs);

            VeilBidFlareMarket.SelectionResult memory result = _winningResult(tenderId, secondTender);
            VeilBidFlareMarket.TeeActionProof[] memory proofs = new VeilBidFlareMarket.TeeActionProof[](2);
            proofs[0] = _actionProof(result, secondTender.requestId, TEE_KEY_1);
            proofs[1] = _actionProof(result, secondTender.requestId, TEE_KEY_2);
            market.finalizeTender(tenderId, result, proofs);
            if (market.getTender(tenderId).status != VeilBidFlareMarket.TenderStatus.Awarded) {
                revert("retry did not settle");
            }
        }

        function testBuyerCanRefundAfterFixedSelectionGrace() external {
            uint256 tenderId = market.createTender(_terms());
            VeilBidFlareMarket.Tender memory tender = market.getTender(tenderId);
            vm.warp(tender.bidDeadline + 1);
            ftso.setTimestamp(uint64(block.timestamp));
            market.closeTender(tenderId);
            market.requestSelection(tenderId);
            tender = market.getTender(tenderId);

            vm.warp(uint256(tender.selectionStartedAt) + market.SELECTION_REFUND_GRACE());
            vm.expectRevert(VeilBidFlareMarket.RefundNotReady.selector);
            market.refundExpiredSelection(tenderId);
            vm.warp(block.timestamp + 1);
            market.refundExpiredSelection(tenderId);

            if (token.balanceOf(address(this)) != 1_000 || token.balanceOf(address(market)) != 0) {
                revert("expired selection refund mismatch");
            }
            if (market.getTender(tenderId).status != VeilBidFlareMarket.TenderStatus.Refunded) {
                revert("expired selection not refunded");
            }
        }

        function testZeroWinnerRefundsEntireEscrow() external {
            uint256 tenderId = market.createTender(_terms());
            VeilBidFlareMarket.Tender memory tender = market.getTender(tenderId);
            vm.warp(tender.bidDeadline + 1);
            ftso.setTimestamp(uint64(block.timestamp));
            market.closeTender(tenderId);
            market.requestSelection(tenderId);
            tender = market.getTender(tenderId);
            VeilBidFlareMarket.SelectionResult memory result = _winningResult(tenderId, tender);
            result.winnerBidId = 0;
            result.winner = address(0);
            result.winningAmountXrp = 0;
            VeilBidFlareMarket.TeeActionProof[] memory proofs = new VeilBidFlareMarket.TeeActionProof[](2);
            proofs[0] = _actionProof(result, tender.requestId, TEE_KEY_1);
            proofs[1] = _actionProof(result, tender.requestId, TEE_KEY_2);
            market.finalizeTender(tenderId, result, proofs);

            if (token.balanceOf(address(this)) != 1_000 || token.balanceOf(address(market)) != 0) {
                revert("refund conservation mismatch");
            }
            if (market.getTender(tenderId).status != VeilBidFlareMarket.TenderStatus.Refunded) {
                revert("not refunded");
            }
            VeilBidFlareAwardReceipt receipt = market.awardReceipt();
            vm.expectRevert(abi.encodeWithSelector(VeilBidFlareAwardReceipt.ReceiptDoesNotExist.selector, tenderId));
            receipt.ownerOf(tenderId);
        }

        function _terms() private view returns (VeilBidFlareMarket.TenderTerms memory terms) {
            address[] memory vendors = new address[](1);
            vendors[0] = vendor;
            bytes32[3] memory fingerprints =
                [manager.fingerprint(teeIds[0]), manager.fingerprint(teeIds[1]), manager.fingerprint(teeIds[2])];
            VeilBidFlareMarket.CredentialRequirement[] memory credentials =
                new VeilBidFlareMarket.CredentialRequirement[](0);
            VeilBidFlareMarket.ScoringPolicy memory policy = VeilBidFlareMarket.ScoringPolicy({
                schemaVersion: 1,
                ceilingXrpMicros: 1_000,
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
            terms = VeilBidFlareMarket.TenderTerms({
                metadataHash: keccak256("metadata"),
                scoringPolicy: policy,
                approvedVendors: vendors,
                extensionId: 0x10001,
                codeVersion: keccak256("veilbid-fcc-v1"),
                teeIds: teeIds,
                teeKeyFingerprints: fingerprints
            });
        }

        function _preparedWinningSelection()
            private
            returns (
                uint256 tenderId,
                VeilBidFlareMarket.Tender memory tender,
                VeilBidFlareMarket.SelectionResult memory result,
                VeilBidFlareMarket.TeeActionProof[] memory proofs
            )
        {
            tenderId = market.createTender(_terms());
            _submitReceipt(tenderId, TEE_KEY_1, teeIds[0]);
            _submitReceipt(tenderId, TEE_KEY_2, teeIds[1]);
            market.closeTender(tenderId);
            market.requestSelection(tenderId);
            tender = market.getTender(tenderId);
            result = _winningResult(tenderId, tender);
            proofs = new VeilBidFlareMarket.TeeActionProof[](2);
            proofs[0] = _actionProof(result, tender.requestId, TEE_KEY_1);
            proofs[1] = _actionProof(result, tender.requestId, TEE_KEY_2);
        }

        function _submitReceipt(uint256 tenderId, uint256 teeKey, address teeId) private {
            VeilBidFlareMarket.BidReceipt memory receipt = VeilBidFlareMarket.BidReceipt({
                schemaVersion: 1,
                vendor: vendor,
                submissionNonce: 1,
                plaintextCommitment: keccak256("opaque-private-bid"),
                teeId: teeId,
                expiry: 900
            });
            VeilBidFlareMarket.Tender memory tender = market.getTender(tenderId);
            bytes32 digest = keccak256(
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
            bytes memory signature = _signEthDigest(teeKey, digest);
            vm.prank(vendor);
            market.submitBidReceipt(tenderId, receipt, signature);
        }

        function _winningResult(uint256 tenderId, VeilBidFlareMarket.Tender memory tender)
            private
            view
            returns (VeilBidFlareMarket.SelectionResult memory)
        {
            return VeilBidFlareMarket.SelectionResult({
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
                winnerBidId: 1,
                winner: vendor,
                winningAmountXrp: 400,
                resultNonce: tender.resultNonce,
                expiry: tender.resultExpiry
            });
        }

        function _actionProof(VeilBidFlareMarket.SelectionResult memory result, bytes32 requestId, uint256 teeKey)
            private
            returns (VeilBidFlareMarket.TeeActionProof memory)
        {
            bytes32 actionResultHash = keccak256(
                abi.encodePacked(keccak256(abi.encode(result)), requestId, market.SUBMIT_TAG_HASH(), uint8(1))
            );
            bytes32 signedPayload =
                keccak256(abi.encode(market.TEE_ACTION_RESULT_PREFIX(), market.COSTON2_CHAIN_ID(), actionResultHash));
            return VeilBidFlareMarket.TeeActionProof({
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
    }
