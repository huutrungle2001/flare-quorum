package protocol

import (
	"math/big"
	"testing"

	"github.com/ethereum/go-ethereum/common"
)

func TestBidAndReceiptWireGoldenVectors(t *testing.T) {
	rules, binding, privateBid := scoringFixture(t)
	credential := privateBid.Credentials[0]
	submission := BidSubmission{
		SchemaVersion:   BidSchemaVersion,
		ChainID:         new(big.Int).Set(binding.ChainID),
		Market:          binding.Market,
		ExtensionID:     new(big.Int).Set(binding.ExtensionID),
		CodeVersion:     binding.CodeVersion,
		TenderID:        new(big.Int).Set(binding.TenderID),
		Vendor:          binding.Vendor,
		SubmissionNonce: big.NewInt(7),
		Rules:           rules,
		ReceiptExpiry:   900,
		QuoteCurrency:   privateBid.QuoteCurrency,
		PriceMicros:     privateBid.PriceMicros,
		DeliveryDays:    privateBid.DeliveryDays,
		WarrantyDays:    privateBid.WarrantyDays,
		Credentials: []CredentialWire{{
			CredentialType: credential.CredentialType,
			Issuer:         credential.Issuer,
			ValidUntil:     credential.ValidUntil,
			Nonce:          credential.Nonce,
			Signature:      credential.Signature,
		}},
		Salt: common.HexToHash("0xabcdef"),
	}

	encoded, err := EncodeBidSubmission(submission)
	if err != nil {
		t.Fatal(err)
	}
	var decoded BidSubmission
	if err := DecodeBidSubmission(encoded, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.SchemaVersion != submission.SchemaVersion || decoded.Vendor != submission.Vendor ||
		decoded.SubmissionNonce.Cmp(submission.SubmissionNonce) != 0 || len(decoded.Credentials) != 1 ||
		decoded.Credentials[0].Issuer != credential.Issuer || decoded.Rules.CeilingXrpMicros != rules.CeilingXrpMicros {
		t.Fatalf("bid ABI round trip drifted: %+v", decoded)
	}

	rulesHash, err := RulesHash(rules)
	if err != nil {
		t.Fatal(err)
	}
	commitment, err := BidCommitment(submission)
	if err != nil {
		t.Fatal(err)
	}
	receipt := BidReceipt{
		SchemaVersion:       BidSchemaVersion,
		ChainID:             submission.ChainID,
		Market:              submission.Market,
		ExtensionID:         submission.ExtensionID,
		CodeVersion:         submission.CodeVersion,
		TenderID:            submission.TenderID,
		Vendor:              submission.Vendor,
		SubmissionNonce:     submission.SubmissionNonce,
		RulesHash:           rulesHash,
		PlaintextCommitment: commitment,
		TeeID:               common.HexToAddress("0x3000000000000000000000000000000000000003"),
		Expiry:              submission.ReceiptExpiry,
		Signature:           []byte{1, 2, 3},
	}
	receiptEncoded, err := EncodeBidReceipt(receipt)
	if err != nil {
		t.Fatal(err)
	}
	var receiptDecoded BidReceipt
	if err := DecodeBidReceipt(receiptEncoded, &receiptDecoded); err != nil {
		t.Fatal(err)
	}
	if receiptDecoded.PlaintextCommitment != commitment || receiptDecoded.TeeID != receipt.TeeID || len(receiptDecoded.Signature) != 3 {
		t.Fatalf("receipt ABI round trip drifted: %+v", receiptDecoded)
	}
	receiptDigest, err := BidReceiptDigest(receipt)
	if err != nil {
		t.Fatal(err)
	}

	if rulesHash.Hex() != "0x57c12e9878a9218766f316c084784bfd97b102512847a30f999d32a2c8a5e444" ||
		commitment.Hex() != "0xb587b30b0b7743bc2e8179defb8431dac5d71cc616ef21909771cd785738c6aa" ||
		receiptDigest.Hex() != "0xb22f48371a8f6813be92a51d188dee114c4f188a6d7f201e3712ae8878fed658" {
		t.Fatalf("golden hashes: rules=%s bid=%s receipt=%s", rulesHash, commitment, receiptDigest)
	}
}

func TestPublicScoringPolicyHashMatchesSolidityAndTypeScript(t *testing.T) {
	rules := ScoringRules{
		SchemaVersion:     1,
		CeilingXrpMicros:  1_000,
		BidDeadline:       1_700_000_000,
		AllowXRP:          true,
		AllowUSD:          true,
		FtsoFeedID:        [21]byte{0x01, 'X', 'R', 'P', '/', 'U', 'S', 'D'},
		MaxDeliveryDays:   30,
		MinWarrantyDays:   12,
		MaxWarrantyDays:   36,
		PriceWeightBPS:    6_000,
		DeliveryWeightBPS: 2_500,
		WarrantyWeightBPS: 1_500,
	}
	hash, err := RulesHash(rules)
	if err != nil {
		t.Fatal(err)
	}
	if hash.Hex() != "0x8969aa4d8ee1fde2fbf813214484c245419fd278b1b791fe05997813315f8cb2" {
		t.Fatalf("public scoring policy hash drifted: %s", hash)
	}
}

func TestBidReceiptDigestIgnoresTransportSignatureOnly(t *testing.T) {
	receipt := BidReceipt{
		SchemaVersion:       1,
		ChainID:             big.NewInt(114),
		Market:              common.HexToAddress("0x1000000000000000000000000000000000000001"),
		ExtensionID:         big.NewInt(0x10001),
		CodeVersion:         common.HexToHash("0x1111"),
		TenderID:            big.NewInt(1),
		Vendor:              common.HexToAddress("0x2000000000000000000000000000000000000002"),
		SubmissionNonce:     big.NewInt(1),
		RulesHash:           common.HexToHash("0x2222"),
		PlaintextCommitment: common.HexToHash("0x3333"),
		TeeID:               common.HexToAddress("0x3000000000000000000000000000000000000003"),
		Expiry:              10,
		Signature:           []byte{1},
	}
	first, err := BidReceiptDigest(receipt)
	if err != nil {
		t.Fatal(err)
	}
	receipt.Signature = []byte{2}
	second, err := BidReceiptDigest(receipt)
	if err != nil {
		t.Fatal(err)
	}
	if first != second {
		t.Fatal("receipt signature was included recursively in its own digest")
	}
	receipt.Expiry++
	third, err := BidReceiptDigest(receipt)
	if err != nil {
		t.Fatal(err)
	}
	if third == first {
		t.Fatal("receipt expiry was not bound")
	}
}

func TestBidWireRejectsTruncatedTrailingAndNonCanonicalPayloads(t *testing.T) {
	rules, binding, privateBid := scoringFixture(t)
	submission := BidSubmission{
		SchemaVersion: BidSchemaVersion, ChainID: binding.ChainID, Market: binding.Market,
		ExtensionID: binding.ExtensionID, CodeVersion: binding.CodeVersion, TenderID: binding.TenderID,
		Vendor: binding.Vendor, SubmissionNonce: big.NewInt(7), Rules: rules, ReceiptExpiry: 900,
		QuoteCurrency: privateBid.QuoteCurrency, PriceMicros: privateBid.PriceMicros,
		DeliveryDays: privateBid.DeliveryDays, WarrantyDays: privateBid.WarrantyDays,
		Salt: common.HexToHash("0xabcdef"),
	}
	encoded, err := EncodeBidSubmission(submission)
	if err != nil {
		t.Fatal(err)
	}
	malformed := map[string][]byte{
		"empty":             nil,
		"truncated":         append([]byte(nil), encoded[:len(encoded)-1]...),
		"trailing-byte":     append(append([]byte(nil), encoded...), 0),
		"noncanonical-head": nonCanonicalTupleOffset(encoded),
	}
	for name, payload := range malformed {
		t.Run(name, func(t *testing.T) {
			var decoded BidSubmission
			if err := DecodeBidSubmission(payload, &decoded); err == nil {
				t.Fatal("malformed bid payload decoded successfully")
			}
		})
	}
}

func nonCanonicalTupleOffset(encoded []byte) []byte {
	payload := make([]byte, len(encoded)+32)
	payload[31] = 64
	copy(payload[64:], encoded[32:])
	return payload
}
