package protocol

import (
	"bytes"
	"math/big"
	"strings"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/crypto/ecies"
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

func TestPrivateBidCommitmentMatchesTypeScript(t *testing.T) {
	rules := ScoringRules{
		SchemaVersion: 1, CeilingXrpMicros: 1_000, BidDeadline: 1_700_000_000,
		AllowXRP: true, AllowUSD: true,
		FtsoFeedID:      [21]byte{0x01, 'X', 'R', 'P', '/', 'U', 'S', 'D'},
		MaxDeliveryDays: 30, MinWarrantyDays: 12, MaxWarrantyDays: 36,
		PriceWeightBPS: 6_000, DeliveryWeightBPS: 2_500, WarrantyWeightBPS: 1_500,
	}
	commitment, err := BidCommitment(BidSubmission{
		SchemaVersion: 1, ChainID: big.NewInt(114),
		Market: common.HexToAddress("0x1000000000000000000000000000000000000001"), ExtensionID: big.NewInt(65_537),
		CodeVersion: common.HexToHash("0x1111111111111111111111111111111111111111111111111111111111111111"),
		TenderID:    big.NewInt(42), Vendor: common.HexToAddress("0x2000000000000000000000000000000000000002"),
		SubmissionNonce: big.NewInt(7), Rules: rules, ReceiptExpiry: 1_700_000_000,
		QuoteCurrency: QuoteXRP, PriceMicros: 400, DeliveryDays: 5, WarrantyDays: 24,
		Salt: common.HexToHash("0x7777777777777777777777777777777777777777777777777777777777777777"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if commitment.Hex() != "0x982631d2fe15e058d0bac43a2cbfd3c0cb0c77166b499fd6a992e4690702a2dc" {
		t.Fatalf("TypeScript private bid commitment drifted: %s", commitment.Hex())
	}
}

func TestTypeScriptECIESVectorDecryptsWithTeeNodePrimitive(t *testing.T) {
	privateKey, err := crypto.HexToECDSA(strings.Repeat("44", 32))
	if err != nil {
		t.Fatal(err)
	}
	ciphertext := common.FromHex("0x044f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa385b6b1b8ead809ca67454d9683fcf2ba03456d6fe2c4abe2b07f0fbdbb2f1c122222222222222222222222222222222d76c006c8f0949a5f57117854f500d53910a263492072ba1db807ddaf0957c1b10d2673c4b90231c8c1301e1784b7f53e0398e964ce685")
	plaintext, err := ecies.ImportECDSA(privateKey).Decrypt(ciphertext, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(plaintext, []byte("VEILBID_ECIES_VECTOR_V1")) {
		t.Fatalf("unexpected TypeScript ECIES plaintext: %x", plaintext)
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
