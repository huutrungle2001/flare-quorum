// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {VeilBidFlareMarket} from "../src/VeilBidFlareMarket.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IFtsoV2} from "../src/interfaces/IFtsoV2.sol";
import {IFlareTeeManager} from "../src/interfaces/IFlareTeeManager.sol";
import {ITeeExtensionRegistry} from "../src/interfaces/ITeeExtensionRegistry.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function expectRevert(bytes4 selector) external;
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
        bytes21 private constant XRP_USD_FEED = bytes21("XRP/USD");

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
            if (market.getTender(tenderId).status != VeilBidFlareMarket.TenderStatus.Awarded) {
                revert("not awarded");
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
        }

        function _terms() private view returns (VeilBidFlareMarket.TenderTerms memory terms) {
            address[] memory vendors = new address[](1);
            vendors[0] = vendor;
            bytes32[3] memory fingerprints =
                [manager.fingerprint(teeIds[0]), manager.fingerprint(teeIds[1]), manager.fingerprint(teeIds[2])];
            terms = VeilBidFlareMarket.TenderTerms({
                metadataHash: keccak256("metadata"),
                rulesHash: keccak256("rules"),
                publicCeilingXrp: 1_000,
                bidDeadline: uint64(block.timestamp + 1 days),
                approvedVendors: vendors,
                extensionId: 0x10001,
                codeVersion: keccak256("veilbid-fcc-v1"),
                teeIds: teeIds,
                teeKeyFingerprints: fingerprints,
                ftsoFeedId: XRP_USD_FEED
            });
        }

        function _submitReceipt(uint256 tenderId, uint256 teeKey, address teeId) private {
            VeilBidFlareMarket.BidReceipt memory receipt = VeilBidFlareMarket.BidReceipt({
                vendor: vendor,
                submissionNonce: 1,
                plaintextCommitment: keccak256("opaque-private-bid"),
                teeId: teeId,
                expiry: uint64(block.timestamp + 1 hours)
            });
            VeilBidFlareMarket.Tender memory tender = market.getTender(tenderId);
            bytes32 digest = keccak256(
                abi.encode(
                    market.RECEIPT_DOMAIN(),
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
                expiry: uint64(block.timestamp + 1 hours)
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
