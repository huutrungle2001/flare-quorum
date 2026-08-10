// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FlareQuorumMarketV2} from "../src/FlareQuorumMarketV2.sol";
import {FlareQuorumAwardReceiptV2} from "../src/FlareQuorumAwardReceiptV2.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IFtsoV2} from "../src/interfaces/IFtsoV2.sol";
import {IFlareTeeManager} from "../src/interfaces/IFlareTeeManager.sol";
import {ITeeExtensionRegistry} from "../src/interfaces/ITeeExtensionRegistry.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function expectEmit(bool checkTopic1, bool checkTopic2, bool checkTopic3, bool checkData) external;
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

    function transferFrom(address from, address to, uint256 amount) external virtual override returns (bool) {
        if (allowance[from][msg.sender] < amount || balanceOf[from] < amount) return false;
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transfer(address to, uint256 amount) external virtual override returns (bool) {
        if (balanceOf[msg.sender] < amount) return false;
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

    contract ReentrantFlareTokenMock is FlareTokenMock {
        address public reentryTarget;
        bytes public reentryCalldata;
        bool public reentryAttempted;
        bool public reentryBlocked;

        function configureReentry(address target, bytes calldata data) external {
            reentryTarget = target;
            reentryCalldata = data;
        }

        function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
            _attemptReentry();
            if (allowance[from][msg.sender] < amount || balanceOf[from] < amount) return false;
            allowance[from][msg.sender] -= amount;
            balanceOf[from] -= amount;
            balanceOf[to] += amount;
            return true;
        }

        function transfer(address to, uint256 amount) external override returns (bool) {
            _attemptReentry();
            if (balanceOf[msg.sender] < amount) return false;
            balanceOf[msg.sender] -= amount;
            balanceOf[to] += amount;
            return true;
        }

        function _attemptReentry() private {
            if (msg.sender != reentryTarget || reentryAttempted) return;
            reentryAttempted = true;
            (bool success,) = reentryTarget.call(reentryCalldata);
            reentryBlocked = !success;
        }
    }

    contract FailingFlareTokenMock is FlareTokenMock {
        bool public failTransfers;

        function setFailTransfers(bool shouldFail) external {
            failTransfers = shouldFail;
        }

        function transfer(address to, uint256 amount) external override returns (bool) {
            if (failTransfers) return false;
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

    contract FlareQuorumMarketV2Test {
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
        FlareQuorumMarketV2 private market;

        address[3] private teeIds;
        address private vendor;

        event TenderRefunded(uint256 indexed tenderId, address indexed buyer, FlareQuorumMarketV2.RefundReason reason);

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
            vendor = vm.addr(VENDOR_KEY);
            ftso.setTimestamp(uint64(block.timestamp));
            token.mint(address(this), 1_000);
            token.approve(address(market), 1_000);
        }

        function testThresholdFccLifecycleConservesFTestXrpEscrow() external {
            uint256 tenderId = market.createTender(_terms());
            _submitReceipts(tenderId);

            FlareQuorumMarketV2.BidReference memory bid = market.getBidReference(tenderId, 1);
            if (bid.vendor != vendor || bid.receiptBitmap != 7) revert("receipt quorum mismatch");
            bytes32 expectedRoot = keccak256(
                abi.encode(
                    market.BID_ROOT_DOMAIN(),
                    market.EMPTY_BID_ROOT(),
                    tenderId,
                    uint256(1),
                    vendor,
                    bid.plaintextCommitment,
                    uint8(7),
                    bid.acceptedBlock
                )
            );
            if (market.getTender(tenderId).orderedBidRoot != expectedRoot) revert("ordered root mismatch");

            market.closeTender(tenderId);
            market.requestSelection(tenderId);
            FlareQuorumMarketV2.Tender memory tender = market.getTender(tenderId);
            if (tender.ftsoValue != 250_000 || tender.requestId != registry.nextRequestId()) {
                revert("close/request binding mismatch");
            }
            if (registry.selectedTeeCount() != 3) revert("common quorum not targeted");

            FlareQuorumMarketV2.SelectionResult memory result = _winningResult(tenderId, tender);
            FlareQuorumMarketV2.TeeActionProof[] memory proofs = new FlareQuorumMarketV2.TeeActionProof[](2);
            proofs[0] = _actionProof(result, tender.requestId, TEE_KEY_1);
            proofs[1] = _actionProof(result, tender.requestId, TEE_KEY_2);
            market.finalizeTender(tenderId, result, proofs);

            if (token.balanceOf(vendor) != 400) revert("winner payout mismatch");
            if (token.balanceOf(address(this)) != 600) revert("buyer remainder mismatch");
            if (token.balanceOf(address(market)) != 0) revert("escrow not conserved");
            FlareQuorumAwardReceiptV2 receipt = market.awardReceipt();
            if (receipt.ownerOf(tenderId) != vendor) revert("award receipt owner mismatch");
            FlareQuorumAwardReceiptV2.Award memory award = receipt.getAward(tenderId);
            if (
                award.winnerBidId != 1 || award.amount != 400 || award.rulesHash != tender.rulesHash
                    || award.orderedBidRoot != tender.orderedBidRoot
                    || award.resultDigest != market.resultDigest(result)
            ) revert("award receipt binding mismatch");
            vm.expectRevert(FlareQuorumAwardReceiptV2.ReceiptIsNonTransferable.selector);
            vm.prank(vendor);
            receipt.transferFrom(vendor, address(this), tenderId);
            if (market.getTender(tenderId).status != FlareQuorumMarketV2.TenderStatus.Awarded) {
                revert("not awarded");
            }
        }

        function testMarketRuntimeFitsEip170() external view {
            if (address(market).code.length > 24_576) revert("market exceeds EIP-170");
        }

        function testFuzzAcceptsEveryAtomicReceiptPermutation(uint8 seed) external {
            uint256 tenderId = market.createTender(_terms());
            (FlareQuorumMarketV2.BidReceipt[3] memory receipts, bytes[3] memory signatures) = _receiptSet(tenderId);
            uint256 firstSwap = uint256(seed) % 3;
            (receipts[0], receipts[firstSwap]) = (receipts[firstSwap], receipts[0]);
            (signatures[0], signatures[firstSwap]) = (signatures[firstSwap], signatures[0]);
            uint256 secondSwap = 1 + (uint256(seed) / 3) % 2;
            (receipts[1], receipts[secondSwap]) = (receipts[secondSwap], receipts[1]);
            (signatures[1], signatures[secondSwap]) = (signatures[secondSwap], signatures[1]);
            vm.prank(vendor);
            market.submitBidReceipts(tenderId, receipts, signatures);
            FlareQuorumMarketV2.BidReference memory bid = market.getBidReference(tenderId, 1);
            if (bid.receiptBitmap != 7 || market.getTender(tenderId).commonQuorumBitmap != 7) {
                revert("receipt permutation changed custody");
            }
        }

        function testFuzzRejectsSignedReceiptSetDisagreement(uint8 fieldSeed, uint256 valueSeed) external {
            uint256 tenderId = market.createTender(_terms());
            (FlareQuorumMarketV2.BidReceipt[3] memory receipts, bytes[3] memory signatures) = _receiptSet(tenderId);
            uint256 field = uint256(fieldSeed) % 3;
            if (field == 0) {
                receipts[2].submissionNonce = valueSeed % (type(uint256).max - 1) + 2;
            } else if (field == 1) {
                receipts[2].plaintextCommitment = keccak256(abi.encode("different-bid", valueSeed));
            } else {
                receipts[2].expiry -= 1;
            }
            signatures[2] = _signEthDigest(TEE_KEY_3, _receiptDigest(tenderId, receipts[2]));
            vm.prank(vendor);
            vm.expectRevert(FlareQuorumMarketV2.InvalidReceipt.selector);
            market.submitBidReceipts(tenderId, receipts, signatures);
            if (market.getTender(tenderId).bidCount != 0) revert("mismatched receipt set was stored");
        }

        function testFuzzEveryTwoOfThreeSignerPairCanFinalize(uint8 omittedSeed, uint256 amountSeed) external {
            (
                uint256 tenderId,
                FlareQuorumMarketV2.Tender memory tender,
                FlareQuorumMarketV2.SelectionResult memory result,
                FlareQuorumMarketV2.TeeActionProof[] memory proofs
            ) = _preparedWinningSelection();
            result.winningAmountXrp = amountSeed % tender.publicCeilingXrp + 1;
            uint256[3] memory teeKeys = [TEE_KEY_1, TEE_KEY_2, TEE_KEY_3];
            uint256 omitted = uint256(omittedSeed) % 3;
            proofs = new FlareQuorumMarketV2.TeeActionProof[](2);
            uint256 cursor;
            for (uint256 i; i < 3; ++i) {
                if (i != omitted) proofs[cursor++] = _actionProof(result, tender.requestId, teeKeys[i]);
            }
            market.finalizeTender(tenderId, result, proofs);
            if (
                token.balanceOf(vendor) != result.winningAmountXrp
                    || token.balanceOf(address(this)) != tender.publicCeilingXrp - result.winningAmountXrp
                    || token.balanceOf(address(market)) != 0
            ) revert("fuzzed settlement did not conserve escrow");
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
                    uint8(7),
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
            if (root != 0xed019a9542e15443dda5329d4988cf864e9189e39200755837488fcba327eb13) {
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
            FlareQuorumMarketV2.SelectionResult memory result = FlareQuorumMarketV2.SelectionResult({
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
            FlareQuorumMarketV2.Tender memory tender = market.getTender(tenderId);
            vm.warp(tender.bidDeadline + 1);
            ftso.setTimestamp(uint64(block.timestamp - market.FTSO_MAX_AGE() - 1));
            vm.expectRevert(FlareQuorumMarketV2.InvalidFeed.selector);
            market.closeTender(tenderId);
        }

        function testPublicScoringPolicyIsValidatedHashedAndStored() external {
            FlareQuorumMarketV2.TenderTerms memory terms = _terms();
            uint256 tenderId = market.createTender(terms);
            FlareQuorumMarketV2.Tender memory tender = market.getTender(tenderId);
            FlareQuorumMarketV2.ScoringPolicy memory stored = market.getScoringPolicy(tenderId);
            if (
                tender.rulesHash != market.scoringPolicyHash(stored) || stored.schemaVersion != 1
                    || stored.ceilingXrpMicros != 1_000 || stored.bidDeadline != tender.bidDeadline || !stored.allowXrp
                    || !stored.allowUsd || stored.ftsoFeedId != market.XRP_USD_FEED_ID()
                    || stored.priceWeightBps != 6_000 || stored.deliveryWeightBps != 2_500
                    || stored.warrantyWeightBps != 1_500 || stored.requiredCredentials.length != 0
            ) revert("public scoring policy mismatch");
        }

        function testScoringPolicyHashMatchesGoAndTypeScript() external view {
            FlareQuorumMarketV2.CredentialRequirement[] memory credentials =
                new FlareQuorumMarketV2.CredentialRequirement[](0);
            FlareQuorumMarketV2.ScoringPolicy memory policy = FlareQuorumMarketV2.ScoringPolicy({
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
            FlareQuorumMarketV2.TenderTerms memory terms = _terms();
            terms.scoringPolicy.deliveryWeightBps = 2_499;
            vm.expectRevert(FlareQuorumMarketV2.InvalidScoringPolicy.selector);
            market.createTender(terms);

            terms = _terms();
            terms.scoringPolicy.ftsoFeedId = bytes21("XRP/USD");
            vm.expectRevert(FlareQuorumMarketV2.InvalidScoringPolicy.selector);
            market.createTender(terms);

            terms = _terms();
            terms.scoringPolicy.requiredCredentials = new FlareQuorumMarketV2.CredentialRequirement[](2);
            FlareQuorumMarketV2.CredentialRequirement memory requirement = FlareQuorumMarketV2.CredentialRequirement({
                credentialType: keccak256("qualified-vendor"), issuer: address(0x1234)
            });
            terms.scoringPolicy.requiredCredentials[0] = requirement;
            terms.scoringPolicy.requiredCredentials[1] = requirement;
            vm.expectRevert(FlareQuorumMarketV2.InvalidScoringPolicy.selector);
            market.createTender(terms);
        }

        function testRejectsDuplicateFrozenTeeKeyFingerprint() external {
            manager.setIdentity(teeIds[2], 0x10001, keccak256("veilbid-fcc-v1"), manager.getPublicKey(teeIds[1]));
            FlareQuorumMarketV2.TenderTerms memory terms = _terms();
            vm.expectRevert(FlareQuorumMarketV2.NotEnoughTeeIdentities.selector);
            market.createTender(terms);
        }

        function testXrpOnlyTenderDoesNotDependOnFtso() external {
            FlareQuorumMarketV2.TenderTerms memory terms = _terms();
            terms.scoringPolicy.allowUsd = false;
            terms.scoringPolicy.ftsoFeedId = bytes21(0);
            uint256 tenderId = market.createTender(terms);
            FlareQuorumMarketV2.Tender memory tender = market.getTender(tenderId);
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
            FlareQuorumMarketV2.Tender memory tender = market.getTender(tenderId);
            vm.warp(tender.bidDeadline + 1);
            ftso.setTimestamp(uint64(block.timestamp));
            ftso.setDecimals(19);
            vm.expectRevert(FlareQuorumMarketV2.InvalidFeed.selector);
            market.closeTender(tenderId);
        }

        function testRejectsWrongActionResultBinding() external {
            uint256 tenderId = market.createTender(_terms());
            _submitReceipts(tenderId);
            market.closeTender(tenderId);
            market.requestSelection(tenderId);
            FlareQuorumMarketV2.Tender memory tender = market.getTender(tenderId);
            FlareQuorumMarketV2.SelectionResult memory result = _winningResult(tenderId, tender);
            FlareQuorumMarketV2.TeeActionProof[] memory proofs = new FlareQuorumMarketV2.TeeActionProof[](2);
            proofs[0] = _actionProof(result, tender.requestId, TEE_KEY_1);
            proofs[1] = _actionProof(result, tender.requestId, TEE_KEY_2);
            proofs[1].actionId = keccak256("wrong-action");

            vm.expectRevert(FlareQuorumMarketV2.InvalidResult.selector);
            market.finalizeTender(tenderId, result, proofs);
        }

        function testRejectsDuplicateResultSigner() external {
            (
                uint256 tenderId,
                FlareQuorumMarketV2.Tender memory tender,
                FlareQuorumMarketV2.SelectionResult memory result,
                FlareQuorumMarketV2.TeeActionProof[] memory proofs
            ) = _preparedWinningSelection();
            proofs[1] = _actionProof(result, tender.requestId, TEE_KEY_1);
            vm.expectRevert(FlareQuorumMarketV2.InvalidResult.selector);
            market.finalizeTender(tenderId, result, proofs);
        }

        function testRequiresAllThreeMatchingBidReceipts() external {
            uint256 tenderId = market.createTender(_terms());
            (FlareQuorumMarketV2.BidReceipt[3] memory receipts, bytes[3] memory signatures) = _receiptSet(tenderId);
            receipts[2] = receipts[1];
            signatures[2] = signatures[1];
            vm.prank(vendor);
            vm.expectRevert(FlareQuorumMarketV2.InvalidReceipt.selector);
            market.submitBidReceipts(tenderId, receipts, signatures);
            if (market.getTender(tenderId).bidCount != 0) revert("partial receipt set was stored");
        }

        function testRejectsChangedTeeIdentityAtBidAcceptance() external {
            uint256 tenderId = market.createTender(_terms());
            (FlareQuorumMarketV2.BidReceipt[3] memory receipts, bytes[3] memory signatures) = _receiptSet(tenderId);
            manager.setIdentity(
                teeIds[2],
                0x10001,
                keccak256("changed-code"),
                IFlareTeeManager.PublicKey(keccak256("changed-x"), keccak256("changed-y"))
            );
            vm.prank(vendor);
            vm.expectRevert(FlareQuorumMarketV2.NotRegisteredTee.selector);
            market.submitBidReceipts(tenderId, receipts, signatures);
        }

        function testSelectionAndFinalizationSurviveOneMachineOutage() external {
            uint256 tenderId = market.createTender(_terms());
            _submitReceipts(tenderId);
            market.closeTender(tenderId);
            manager.setStatus(teeIds[2], 1);
            market.requestSelection(tenderId);
            if (registry.selectedTeeCount() != 2) revert("active two-machine target mismatch");
            FlareQuorumMarketV2.Tender memory tender = market.getTender(tenderId);
            FlareQuorumMarketV2.SelectionResult memory result = _winningResult(tenderId, tender);
            FlareQuorumMarketV2.TeeActionProof[] memory proofs = new FlareQuorumMarketV2.TeeActionProof[](2);
            proofs[0] = _actionProof(result, tender.requestId, TEE_KEY_1);
            proofs[1] = _actionProof(result, tender.requestId, TEE_KEY_2);
            market.finalizeTender(tenderId, result, proofs);
            if (market.getTender(tenderId).status != FlareQuorumMarketV2.TenderStatus.Awarded) {
                revert("one-machine outage did not settle");
            }
        }

        function testSelectionRejectsTwoMachineOutage() external {
            uint256 tenderId = market.createTender(_terms());
            _submitReceipts(tenderId);
            market.closeTender(tenderId);
            manager.setStatus(teeIds[1], 1);
            manager.setStatus(teeIds[2], 1);
            vm.expectRevert(FlareQuorumMarketV2.NotEnoughTeeIdentities.selector);
            market.requestSelection(tenderId);
        }

        function testRejectsChangedTeeKeyAtFinalization() external {
            (
                uint256 tenderId,
                FlareQuorumMarketV2.Tender memory tender,
                FlareQuorumMarketV2.SelectionResult memory result,
                FlareQuorumMarketV2.TeeActionProof[] memory proofs
            ) = _preparedWinningSelection();
            manager.setIdentity(
                teeIds[1],
                tender.extensionId,
                tender.codeVersion,
                IFlareTeeManager.PublicKey(keccak256("rotated-x"), keccak256("rotated-y"))
            );
            vm.expectRevert(FlareQuorumMarketV2.InvalidResult.selector);
            market.finalizeTender(tenderId, result, proofs);
        }

        function testRejectsResultExpiryDriftEvenWithValidSignatures() external {
            (
                uint256 tenderId,
                FlareQuorumMarketV2.Tender memory tender,
                FlareQuorumMarketV2.SelectionResult memory result,
                FlareQuorumMarketV2.TeeActionProof[] memory proofs
            ) = _preparedWinningSelection();
            result.expiry += 1;
            proofs[0] = _actionProof(result, tender.requestId, TEE_KEY_1);
            proofs[1] = _actionProof(result, tender.requestId, TEE_KEY_2);
            vm.expectRevert(FlareQuorumMarketV2.InvalidResult.selector);
            market.finalizeTender(tenderId, result, proofs);
        }

        function testFinalizationReplayCannotSettleTwice() external {
            (
                uint256 tenderId,
                FlareQuorumMarketV2.Tender memory tender,
                FlareQuorumMarketV2.SelectionResult memory result,
                FlareQuorumMarketV2.TeeActionProof[] memory proofs
            ) = _preparedWinningSelection();
            market.finalizeTender(tenderId, result, proofs);
            vm.expectRevert(
                abi.encodeWithSelector(
                    FlareQuorumMarketV2.InvalidStatus.selector,
                    FlareQuorumMarketV2.TenderStatus.ComputePending,
                    FlareQuorumMarketV2.TenderStatus.Awarded
                )
            );
            market.finalizeTender(tenderId, result, proofs);
            if (tender.buyer == address(0)) revert("invalid fixture");
        }

        function testExpiredSelectionRetriesWithFreshRequestAndNonce() external {
            (
                uint256 tenderId,
                FlareQuorumMarketV2.Tender memory firstTender,
                FlareQuorumMarketV2.SelectionResult memory staleResult,
                FlareQuorumMarketV2.TeeActionProof[] memory staleProofs
            ) = _preparedWinningSelection();
            if (firstTender.selectionAttempt != 1 || firstTender.selectionStartedAt == 0) {
                revert("first selection attempt missing");
            }
            vm.warp(firstTender.resultExpiry);
            vm.expectRevert(FlareQuorumMarketV2.SelectionStillLive.selector);
            market.retrySelection(tenderId);

            bytes32 secondRequestId = keccak256("veilbid-test-request-2");
            registry.setNextRequestId(secondRequestId);
            vm.warp(firstTender.resultExpiry + 1);
            market.retrySelection(tenderId);
            FlareQuorumMarketV2.Tender memory secondTender = market.getTender(tenderId);
            if (
                secondTender.selectionAttempt != 2 || secondTender.requestId != secondRequestId
                    || secondTender.resultNonce == firstTender.resultNonce
                    || secondTender.selectionStartedAt != firstTender.selectionStartedAt
            ) revert("retry binding mismatch");

            vm.expectRevert(FlareQuorumMarketV2.InvalidResult.selector);
            market.finalizeTender(tenderId, staleResult, staleProofs);

            FlareQuorumMarketV2.SelectionResult memory result = _winningResult(tenderId, secondTender);
            FlareQuorumMarketV2.TeeActionProof[] memory proofs = new FlareQuorumMarketV2.TeeActionProof[](2);
            proofs[0] = _actionProof(result, secondTender.requestId, TEE_KEY_1);
            proofs[1] = _actionProof(result, secondTender.requestId, TEE_KEY_2);
            market.finalizeTender(tenderId, result, proofs);
            if (market.getTender(tenderId).status != FlareQuorumMarketV2.TenderStatus.Awarded) {
                revert("retry did not settle");
            }
        }

        function testBuyerCanRefundAfterFixedSelectionGrace() external {
            uint256 tenderId = market.createTender(_terms());
            FlareQuorumMarketV2.Tender memory tender = market.getTender(tenderId);
            vm.warp(tender.bidDeadline + 1);
            ftso.setTimestamp(uint64(block.timestamp));
            market.closeTender(tenderId);
            market.requestSelection(tenderId);
            tender = market.getTender(tenderId);

            vm.warp(uint256(tender.selectionStartedAt) + market.SELECTION_REFUND_GRACE());
            vm.expectRevert(FlareQuorumMarketV2.RefundNotReady.selector);
            market.refundExpiredSelection(tenderId);
            vm.warp(block.timestamp + 1);
            market.refundExpiredSelection(tenderId);

            if (token.balanceOf(address(this)) != 1_000 || token.balanceOf(address(market)) != 0) {
                revert("expired selection refund mismatch");
            }
            if (market.getTender(tenderId).status != FlareQuorumMarketV2.TenderStatus.Refunded) {
                revert("expired selection not refunded");
            }
        }

        function testClosedTenderRefundsAfterFailedInitialDispatch() external {
            uint256 tenderId = market.createTender(_terms());
            FlareQuorumMarketV2.Tender memory tender = market.getTender(tenderId);
            vm.warp(tender.bidDeadline + 1);
            ftso.setTimestamp(uint64(block.timestamp));
            market.closeTender(tenderId);
            tender = market.getTender(tenderId);
            if (tender.closedAt != block.timestamp || tender.selectionStartedAt != 0 || tender.requestId != bytes32(0))
            {
                revert("closed checkpoint mismatch");
            }

            manager.setStatus(teeIds[1], 1);
            manager.setStatus(teeIds[2], 1);
            vm.expectRevert(FlareQuorumMarketV2.NotEnoughTeeIdentities.selector);
            market.requestSelection(tenderId);

            tender = market.getTender(tenderId);
            if (
                tender.status != FlareQuorumMarketV2.TenderStatus.Closed || tender.selectionStartedAt != 0
                    || tender.selectionAttempt != 0 || tender.resultNonce != 0 || tender.requestId != bytes32(0)
            ) revert("failed dispatch changed state");

            vm.warp(uint256(tender.closedAt) + market.CLOSED_REFUND_GRACE());
            vm.expectRevert(FlareQuorumMarketV2.RefundNotReady.selector);
            market.refundUndispatchedTender(tenderId);
            vm.warp(block.timestamp + 1);
            vm.expectEmit(true, true, false, true);
            emit TenderRefunded(tenderId, address(this), FlareQuorumMarketV2.RefundReason.UndispatchedTimeout);
            market.refundUndispatchedTender(tenderId);

            if (
                market.getTender(tenderId).status != FlareQuorumMarketV2.TenderStatus.Refunded
                    || token.balanceOf(address(this)) != 1_000 || token.balanceOf(address(market)) != 0
            ) revert("undispatched refund did not conserve escrow");
            vm.expectRevert(
                abi.encodeWithSelector(
                    FlareQuorumMarketV2.InvalidStatus.selector,
                    FlareQuorumMarketV2.TenderStatus.Closed,
                    FlareQuorumMarketV2.TenderStatus.Refunded
                )
            );
            market.requestSelection(tenderId);
        }

        function testFuzzUndispatchedRefundIgnoresTeeManagerDrift(uint8 driftSeed) external {
            uint256 tenderId = market.createTender(_terms());
            FlareQuorumMarketV2.Tender memory tender = market.getTender(tenderId);
            vm.warp(tender.bidDeadline + 1);
            ftso.setTimestamp(uint64(block.timestamp));
            market.closeTender(tenderId);
            tender = market.getTender(tenderId);

            uint256 mode = uint256(driftSeed) % 4;
            for (uint256 i = 1; i < 3; ++i) {
                if (mode == 0) {
                    manager.setStatus(teeIds[i], 1);
                    continue;
                }
                IFlareTeeManager.PublicKey memory publicKey = manager.getPublicKey(teeIds[i]);
                uint256 extensionId = tender.extensionId;
                bytes32 codeVersion = tender.codeVersion;
                if (mode == 1) extensionId += 1;
                else if (mode == 2) codeVersion = keccak256(abi.encode("wrong-code", i));
                else publicKey = IFlareTeeManager.PublicKey(keccak256(abi.encode("wrong-x", i)), publicKey.y);
                manager.setIdentity(teeIds[i], extensionId, codeVersion, publicKey);
            }

            vm.expectRevert(FlareQuorumMarketV2.NotEnoughTeeIdentities.selector);
            market.requestSelection(tenderId);
            vm.warp(uint256(tender.closedAt) + market.CLOSED_REFUND_GRACE() + 1);
            market.refundUndispatchedTender(tenderId);
            if (
                market.getTender(tenderId).status != FlareQuorumMarketV2.TenderStatus.Refunded
                    || token.balanceOf(address(market)) != 0
            ) revert("manager-independent refund failed");
        }

        function testOnlyBuyerCanRefundUndispatchedTender() external {
            uint256 tenderId = market.createTender(_terms());
            FlareQuorumMarketV2.Tender memory tender = market.getTender(tenderId);
            vm.warp(tender.bidDeadline + 1);
            ftso.setTimestamp(uint64(block.timestamp));
            market.closeTender(tenderId);
            tender = market.getTender(tenderId);
            vm.warp(uint256(tender.closedAt) + market.CLOSED_REFUND_GRACE() + 1);

            vm.prank(vendor);
            vm.expectRevert(FlareQuorumMarketV2.NotBuyer.selector);
            market.refundUndispatchedTender(tenderId);
            market.refundUndispatchedTender(tenderId);
        }

        function testPostDispatchQuorumLossUsesSelectionRefund() external {
            uint256 tenderId = market.createTender(_terms());
            FlareQuorumMarketV2.Tender memory tender = market.getTender(tenderId);
            vm.warp(tender.bidDeadline + 1);
            ftso.setTimestamp(uint64(block.timestamp));
            market.closeTender(tenderId);
            market.requestSelection(tenderId);
            tender = market.getTender(tenderId);
            manager.setStatus(teeIds[1], 1);
            manager.setStatus(teeIds[2], 1);

            vm.expectRevert(
                abi.encodeWithSelector(
                    FlareQuorumMarketV2.InvalidStatus.selector,
                    FlareQuorumMarketV2.TenderStatus.Closed,
                    FlareQuorumMarketV2.TenderStatus.ComputePending
                )
            );
            market.refundUndispatchedTender(tenderId);
            vm.warp(uint256(tender.selectionStartedAt) + market.SELECTION_REFUND_GRACE() + 1);
            vm.expectEmit(true, true, false, true);
            emit TenderRefunded(tenderId, address(this), FlareQuorumMarketV2.RefundReason.SelectionExpired);
            market.refundExpiredSelection(tenderId);
            if (
                market.getTender(tenderId).status != FlareQuorumMarketV2.TenderStatus.Refunded
                    || token.balanceOf(address(market)) != 0
            ) revert("post-dispatch refund failed");
        }

        function testRefundedSelectionExcludesFinalizeRetryAndSecondRefund() external {
            (
                uint256 tenderId,
                FlareQuorumMarketV2.Tender memory tender,
                FlareQuorumMarketV2.SelectionResult memory result,
                FlareQuorumMarketV2.TeeActionProof[] memory proofs
            ) = _preparedWinningSelection();
            vm.warp(uint256(tender.selectionStartedAt) + market.SELECTION_REFUND_GRACE() + 1);
            market.refundExpiredSelection(tenderId);

            bytes memory statusError = abi.encodeWithSelector(
                FlareQuorumMarketV2.InvalidStatus.selector,
                FlareQuorumMarketV2.TenderStatus.ComputePending,
                FlareQuorumMarketV2.TenderStatus.Refunded
            );
            vm.expectRevert(statusError);
            market.finalizeTender(tenderId, result, proofs);
            vm.expectRevert(statusError);
            market.retrySelection(tenderId);
            vm.expectRevert(statusError);
            market.refundExpiredSelection(tenderId);
        }

        function testUndispatchedRefundBlocksTokenReentrancy() external {
            ReentrantFlareTokenMock reentrantToken = new ReentrantFlareTokenMock();
            token = reentrantToken;
            market = new FlareQuorumMarketV2(reentrantToken, manager, ftso, registry);
            registry.setSender(address(market));
            reentrantToken.mint(address(this), 1_000);
            reentrantToken.approve(address(market), 1_000);

            uint256 tenderId = market.createTender(_terms());
            FlareQuorumMarketV2.Tender memory tender = market.getTender(tenderId);
            vm.warp(tender.bidDeadline + 1);
            ftso.setTimestamp(uint64(block.timestamp));
            market.closeTender(tenderId);
            tender = market.getTender(tenderId);
            vm.warp(uint256(tender.closedAt) + market.CLOSED_REFUND_GRACE() + 1);
            reentrantToken.configureReentry(
                address(market), abi.encodeCall(FlareQuorumMarketV2.refundUndispatchedTender, (tenderId))
            );

            market.refundUndispatchedTender(tenderId);
            if (
                !reentrantToken.reentryAttempted() || !reentrantToken.reentryBlocked()
                    || market.getTender(tenderId).status != FlareQuorumMarketV2.TenderStatus.Refunded
                    || token.balanceOf(address(this)) != 1_000 || token.balanceOf(address(market)) != 0
            ) revert("reentrant refund was not safely contained");
        }

        function testCreateTenderBlocksTokenReentrancyAndConservesExactEscrow() external {
            ReentrantFlareTokenMock reentrantToken = new ReentrantFlareTokenMock();
            token = reentrantToken;
            market = new FlareQuorumMarketV2(reentrantToken, manager, ftso, registry);
            registry.setSender(address(market));
            reentrantToken.mint(address(this), 1_000);
            reentrantToken.approve(address(market), 1_000);
            FlareQuorumMarketV2.TenderTerms memory terms = _terms();
            reentrantToken.configureReentry(address(market), abi.encodeCall(FlareQuorumMarketV2.createTender, (terms)));

            uint256 tenderId = market.createTender(terms);
            if (
                tenderId != 1 || market.tenderCount() != 1 || !reentrantToken.reentryAttempted()
                    || !reentrantToken.reentryBlocked() || token.balanceOf(address(market)) != 1_000
                    || market.getTender(tenderId).status != FlareQuorumMarketV2.TenderStatus.Open
            ) revert("create reentrancy or escrow conservation mismatch");
        }

        function testRefundTransferFailureRollsBackAndCanRetry() external {
            FailingFlareTokenMock failingToken = new FailingFlareTokenMock();
            token = failingToken;
            market = new FlareQuorumMarketV2(failingToken, manager, ftso, registry);
            registry.setSender(address(market));
            failingToken.mint(address(this), 1_000);
            failingToken.approve(address(market), 1_000);

            uint256 tenderId = market.createTender(_terms());
            FlareQuorumMarketV2.Tender memory tender = market.getTender(tenderId);
            vm.warp(tender.bidDeadline + 1);
            ftso.setTimestamp(uint64(block.timestamp));
            market.closeTender(tenderId);
            tender = market.getTender(tenderId);
            vm.warp(uint256(tender.closedAt) + market.CLOSED_REFUND_GRACE() + 1);
            failingToken.setFailTransfers(true);
            vm.expectRevert(FlareQuorumMarketV2.InvalidTokenTransfer.selector);
            market.refundUndispatchedTender(tenderId);
            if (
                market.getTender(tenderId).status != FlareQuorumMarketV2.TenderStatus.Closed
                    || token.balanceOf(address(market)) != 1_000
            ) revert("failed transfer did not roll back");

            failingToken.setFailTransfers(false);
            market.refundUndispatchedTender(tenderId);
            if (
                market.getTender(tenderId).status != FlareQuorumMarketV2.TenderStatus.Refunded
                    || token.balanceOf(address(market)) != 0
            ) revert("refund retry failed");
        }

        function testZeroWinnerRefundsEntireEscrow() external {
            uint256 tenderId = market.createTender(_terms());
            FlareQuorumMarketV2.Tender memory tender = market.getTender(tenderId);
            vm.warp(tender.bidDeadline + 1);
            ftso.setTimestamp(uint64(block.timestamp));
            market.closeTender(tenderId);
            market.requestSelection(tenderId);
            tender = market.getTender(tenderId);
            FlareQuorumMarketV2.SelectionResult memory result = _winningResult(tenderId, tender);
            result.winnerBidId = 0;
            result.winner = address(0);
            result.winningAmountXrp = 0;
            FlareQuorumMarketV2.TeeActionProof[] memory proofs = new FlareQuorumMarketV2.TeeActionProof[](2);
            proofs[0] = _actionProof(result, tender.requestId, TEE_KEY_1);
            proofs[1] = _actionProof(result, tender.requestId, TEE_KEY_2);
            market.finalizeTender(tenderId, result, proofs);

            if (token.balanceOf(address(this)) != 1_000 || token.balanceOf(address(market)) != 0) {
                revert("refund conservation mismatch");
            }
            if (market.getTender(tenderId).status != FlareQuorumMarketV2.TenderStatus.Refunded) {
                revert("not refunded");
            }
            FlareQuorumAwardReceiptV2 receipt = market.awardReceipt();
            vm.expectRevert(abi.encodeWithSelector(FlareQuorumAwardReceiptV2.ReceiptDoesNotExist.selector, tenderId));
            receipt.ownerOf(tenderId);
        }

        function _terms() private view returns (FlareQuorumMarketV2.TenderTerms memory terms) {
            address[] memory vendors = new address[](1);
            vendors[0] = vendor;
            bytes32[3] memory fingerprints =
                [manager.fingerprint(teeIds[0]), manager.fingerprint(teeIds[1]), manager.fingerprint(teeIds[2])];
            FlareQuorumMarketV2.CredentialRequirement[] memory credentials =
                new FlareQuorumMarketV2.CredentialRequirement[](0);
            FlareQuorumMarketV2.ScoringPolicy memory policy = FlareQuorumMarketV2.ScoringPolicy({
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
            terms = FlareQuorumMarketV2.TenderTerms({
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
                FlareQuorumMarketV2.Tender memory tender,
                FlareQuorumMarketV2.SelectionResult memory result,
                FlareQuorumMarketV2.TeeActionProof[] memory proofs
            )
        {
            tenderId = market.createTender(_terms());
            _submitReceipts(tenderId);
            market.closeTender(tenderId);
            market.requestSelection(tenderId);
            tender = market.getTender(tenderId);
            result = _winningResult(tenderId, tender);
            proofs = new FlareQuorumMarketV2.TeeActionProof[](2);
            proofs[0] = _actionProof(result, tender.requestId, TEE_KEY_1);
            proofs[1] = _actionProof(result, tender.requestId, TEE_KEY_2);
        }

        function _submitReceipts(uint256 tenderId) private {
            (FlareQuorumMarketV2.BidReceipt[3] memory receipts, bytes[3] memory signatures) = _receiptSet(tenderId);
            vm.prank(vendor);
            market.submitBidReceipts(tenderId, receipts, signatures);
        }

        function _receiptSet(uint256 tenderId)
            private
            returns (FlareQuorumMarketV2.BidReceipt[3] memory receipts, bytes[3] memory signatures)
        {
            uint256[3] memory teeKeys = [TEE_KEY_1, TEE_KEY_2, TEE_KEY_3];
            for (uint256 i; i < 3; ++i) {
                receipts[i] = FlareQuorumMarketV2.BidReceipt({
                    schemaVersion: 1,
                    vendor: vendor,
                    submissionNonce: 1,
                    plaintextCommitment: keccak256("opaque-private-bid"),
                    teeId: teeIds[i],
                    expiry: uint64(block.timestamp + 1 hours)
                });
                signatures[i] = _signEthDigest(teeKeys[i], _receiptDigest(tenderId, receipts[i]));
            }
        }

        function _receiptDigest(uint256 tenderId, FlareQuorumMarketV2.BidReceipt memory receipt)
            private
            view
            returns (bytes32)
        {
            FlareQuorumMarketV2.Tender memory tender = market.getTender(tenderId);
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

        function _winningResult(uint256 tenderId, FlareQuorumMarketV2.Tender memory tender)
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
                winnerBidId: 1,
                winner: vendor,
                winningAmountXrp: 400,
                resultNonce: tender.resultNonce,
                expiry: tender.resultExpiry
            });
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
    }
