package protocol

import (
	"math/big"
	"testing"

	"github.com/ethereum/go-ethereum/common"
)

func TestSelectionWireRoundTripAndDigest(t *testing.T) {
	market := common.HexToAddress("0x1000000000000000000000000000000000000001")
	codeVersion := common.HexToHash("0x1111")
	rules := ScoringRules{SchemaVersion: 1, CeilingXrpMicros: 1_000_000, BidDeadline: 1_000, AllowXRP: true, MaxDeliveryDays: 10, MinWarrantyDays: 12, MaxWarrantyDays: 36, PriceWeightBPS: 6_000, DeliveryWeightBPS: 2_500, WarrantyWeightBPS: 1_500}
	rulesHash, err := RulesHash(rules)
	if err != nil {
		t.Fatal(err)
	}
	submission := BidSubmission{SchemaVersion: BidSchemaVersion, ChainID: big.NewInt(114), Market: market, ExtensionID: big.NewInt(0x10001), CodeVersion: codeVersion, TenderID: big.NewInt(42), Vendor: common.HexToAddress("0x2000000000000000000000000000000000000002"), SubmissionNonce: big.NewInt(7), Rules: rules, ReceiptExpiry: 900, QuoteCurrency: QuoteXRP, PriceMicros: 400_000, DeliveryDays: 5, WarrantyDays: 24, Salt: common.HexToHash("0x7777")}
	commitment, err := BidCommitment(submission)
	if err != nil {
		t.Fatal(err)
	}
	refs := []SelectionBidReference{{BidID: big.NewInt(1), Vendor: submission.Vendor, SubmissionNonce: submission.SubmissionNonce, PlaintextCommitment: commitment, ReceiptBitmap: 7, AcceptedBlock: 33_500_001}}
	root, err := RebuildBidRoot(submission.TenderID, []BidReference{{BidID: refs[0].BidID, Vendor: refs[0].Vendor, PlaintextCommitment: refs[0].PlaintextCommitment, ReceiptBitmap: refs[0].ReceiptBitmap, AcceptedBlock: refs[0].AcceptedBlock}})
	if err != nil {
		t.Fatal(err)
	}
	request := SelectionRequest{SchemaVersion: SelectionSchemaVersion, ChainID: submission.ChainID, Market: market, ExtensionID: submission.ExtensionID, CodeVersion: codeVersion, TenderID: submission.TenderID, RulesHash: rulesHash, PublicCeilingXrp: big.NewInt(1_000_000), BidDeadline: 1_000, OrderedBidRoot: root, QuorumBitmap: 7, FtsoValue: big.NewInt(0), CloseBlock: 33_500_010, ResultNonce: big.NewInt(3), ResultExpiry: 2_000, BidReferences: refs}
	encoded, err := EncodeSelectionRequest(request)
	if err != nil {
		t.Fatal(err)
	}
	var decoded SelectionRequest
	if err := DecodeSelectionRequest(encoded, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.Market != request.Market || decoded.TenderID.Cmp(request.TenderID) != 0 || decoded.OrderedBidRoot != request.OrderedBidRoot || len(decoded.BidReferences) != 1 || decoded.BidReferences[0].SubmissionNonce.Cmp(refs[0].SubmissionNonce) != 0 {
		t.Fatalf("selection request round trip drifted: %+v", decoded)
	}
	result := SelectionResult{SchemaVersion: SelectionSchemaVersion, ChainID: request.ChainID, Market: market, ExtensionID: request.ExtensionID, CodeVersion: codeVersion, TenderID: request.TenderID, RulesHash: rulesHash, OrderedBidRoot: root, QuorumBitmap: 7, FtsoValue: big.NewInt(0), CloseBlock: request.CloseBlock, WinnerBidID: big.NewInt(1), Winner: submission.Vendor, WinningAmountXrp: big.NewInt(400_000), ResultNonce: request.ResultNonce, Expiry: request.ResultExpiry}
	resultEncoded, err := EncodeSelectionResult(result)
	if err != nil {
		t.Fatal(err)
	}
	var resultDecoded SelectionResult
	if err := DecodeSelectionResult(resultEncoded, &resultDecoded); err != nil {
		t.Fatal(err)
	}
	if resultDecoded.Winner != result.Winner || resultDecoded.WinnerBidID.Cmp(result.WinnerBidID) != 0 || resultDecoded.WinningAmountXrp.Cmp(result.WinningAmountXrp) != 0 {
		t.Fatalf("selection result round trip drifted: %+v", resultDecoded)
	}
	digest, err := SelectionResultDigest(result)
	if err != nil {
		t.Fatal(err)
	}
	if digest.Hex() != "0xbebd93f87a362d0fb0817297d9527908ec98aafdeb25e760710d5d790a071f26" {
		t.Fatalf("selection result digest drifted: %s", digest.Hex())
	}
}

func TestBidSlotBindsTypedMarket(t *testing.T) {
	chainID, extensionID, tenderID := big.NewInt(114), big.NewInt(0x10001), big.NewInt(42)
	vendor := common.HexToAddress("0x2000000000000000000000000000000000000002")
	first, err := BidSlotFor(chainID, common.HexToAddress("0x1000000000000000000000000000000000000001"), extensionID, tenderID, vendor)
	if err != nil {
		t.Fatal(err)
	}
	second, err := BidSlotFor(chainID, common.HexToAddress("0x1000000000000000000000000000000000000003"), extensionID, tenderID, vendor)
	if err != nil {
		t.Fatal(err)
	}
	if first == second {
		t.Fatal("bid slot did not bind market address")
	}
}

func TestSelectionResultDigestTypeScriptGoldenVector(t *testing.T) {
	var feed [21]byte
	copy(feed[:], []byte("XRP/USD"))
	digest, err := SelectionResultDigest(SelectionResult{
		SchemaVersion: 1, ChainID: big.NewInt(114), Market: common.HexToAddress("0x1000000000000000000000000000000000000001"), ExtensionID: big.NewInt(65537), CodeVersion: common.HexToHash("0x1111"), TenderID: big.NewInt(42), RulesHash: common.HexToHash("0x2222"), OrderedBidRoot: common.HexToHash("0x3333"), QuorumBitmap: 7, FtsoFeedID: feed, FtsoValue: big.NewInt(250000), FtsoDecimals: 5, FtsoTimestamp: 1700000000, CloseBlock: 33500010, WinnerBidID: big.NewInt(1), Winner: common.HexToAddress("0x2000000000000000000000000000000000000002"), WinningAmountXrp: big.NewInt(400000), ResultNonce: big.NewInt(3), Expiry: 2000,
	})
	if err != nil {
		t.Fatal(err)
	}
	if digest.Hex() != "0xe323859bd3351602eb780752822de0adb41ffca6f2906f9095bb3b0a3baa9763" {
		t.Fatalf("TypeScript result vector drift: %s", digest.Hex())
	}
}
