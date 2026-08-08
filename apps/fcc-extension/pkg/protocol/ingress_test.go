package protocol

import (
	"math/big"
	"strings"
	"testing"

	"github.com/ethereum/go-ethereum/accounts"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

func TestValidateSubmissionBindsNonceAddressedSealedSlot(t *testing.T) {
	submission := validSubmissionFixture(t)
	validated, err := ValidateSubmission(submission, 100)
	if err != nil {
		t.Fatal(err)
	}
	if validated.RulesHash == (common.Hash{}) || validated.PlaintextCommitment == (common.Hash{}) || validated.SealedSlot == (common.Hash{}) {
		t.Fatalf("missing validation bindings: %+v", validated)
	}

	retry := submission
	retry.SubmissionNonce = big.NewInt(8)
	retry.Salt = common.HexToHash("0x8888")
	retryValidated, err := ValidateSubmission(retry, 100)
	if err != nil {
		t.Fatal(err)
	}
	if retryValidated.SealedSlot == validated.SealedSlot || retryValidated.PlaintextCommitment == validated.PlaintextCommitment {
		t.Fatal("slot and commitment must bind the one-time submission nonce")
	}
}

func TestValidateSubmissionFailsClosedOnEveryPublicBoundary(t *testing.T) {
	for name, mutate := range map[string]func(*BidSubmission){
		"bid schema":     func(value *BidSubmission) { value.SchemaVersion++ },
		"scoring schema": func(value *BidSubmission) { value.Rules.SchemaVersion++ },
		"chain":          func(value *BidSubmission) { value.ChainID = big.NewInt(1) },
		"market":         func(value *BidSubmission) { value.Market = common.Address{} },
		"extension":      func(value *BidSubmission) { value.ExtensionID = big.NewInt(1) },
		"code":           func(value *BidSubmission) { value.CodeVersion = common.Hash{} },
		"tender":         func(value *BidSubmission) { value.TenderID = big.NewInt(0) },
		"vendor":         func(value *BidSubmission) { value.Vendor = common.Address{} },
		"nonce":          func(value *BidSubmission) { value.SubmissionNonce = big.NewInt(0) },
		"salt":           func(value *BidSubmission) { value.Salt = common.Hash{} },
		"expiry":         func(value *BidSubmission) { value.ReceiptExpiry = 1_001 },
		"currency":       func(value *BidSubmission) { value.QuoteCurrency = 9 },
		"credential":     func(value *BidSubmission) { value.Credentials[0].Signature[0] ^= 1 },
	} {
		t.Run(name, func(t *testing.T) {
			candidate := validSubmissionFixture(t)
			mutate(&candidate)
			if _, err := ValidateSubmission(candidate, 100); err == nil {
				t.Fatal("invalid submission accepted")
			}
		})
	}
}

func validSubmissionFixture(t *testing.T) BidSubmission {
	t.Helper()
	issuerKey, err := crypto.HexToECDSA(strings.Repeat("33", 32))
	if err != nil {
		t.Fatal(err)
	}
	issuer := crypto.PubkeyToAddress(issuerKey.PublicKey)
	credentialType := crypto.Keccak256Hash([]byte("LICENSED_VENDOR"))
	rules := ScoringRules{
		SchemaVersion:       1,
		CeilingXrpMicros:    1_000_000,
		BidDeadline:         1_000,
		AllowXRP:            true,
		AllowUSD:            true,
		FtsoFeedID:          [21]byte{'X', 'R', 'P', '/', 'U', 'S', 'D'},
		MaxDeliveryDays:     10,
		MinWarrantyDays:     12,
		MaxWarrantyDays:     36,
		PriceWeightBPS:      6_000,
		DeliveryWeightBPS:   2_500,
		WarrantyWeightBPS:   1_500,
		RequiredCredentials: []CredentialRequirement{{CredentialType: credentialType, Issuer: issuer}},
	}
	submission := BidSubmission{
		SchemaVersion:   1,
		ChainID:         big.NewInt(114),
		Market:          common.HexToAddress("0x1000000000000000000000000000000000000001"),
		ExtensionID:     big.NewInt(0x10001),
		CodeVersion:     common.HexToHash("0x1111"),
		TenderID:        big.NewInt(42),
		Vendor:          common.HexToAddress("0x2000000000000000000000000000000000000002"),
		SubmissionNonce: big.NewInt(7),
		Rules:           rules,
		ReceiptExpiry:   900,
		QuoteCurrency:   QuoteXRP,
		PriceMicros:     400_000,
		DeliveryDays:    5,
		WarrantyDays:    24,
		Salt:            common.HexToHash("0x7777"),
	}
	rulesHash, err := RulesHash(rules)
	if err != nil {
		t.Fatal(err)
	}
	credential := CredentialWire{
		CredentialType: credentialType,
		Issuer:         issuer,
		ValidUntil:     rules.BidDeadline,
		Nonce:          common.HexToHash("0x1234"),
	}
	digest, err := CredentialDigest(CredentialDomainBinding{
		ChainID: submission.ChainID, Market: submission.Market, ExtensionID: submission.ExtensionID,
		CodeVersion: submission.CodeVersion, TenderID: submission.TenderID, RulesHash: rulesHash, Vendor: submission.Vendor,
	}, Credential{
		CredentialType: credential.CredentialType, Issuer: credential.Issuer, ValidUntil: credential.ValidUntil, Nonce: credential.Nonce,
	})
	if err != nil {
		t.Fatal(err)
	}
	credential.Signature, err = crypto.Sign(accounts.TextHash(digest[:]), issuerKey)
	if err != nil {
		t.Fatal(err)
	}
	submission.Credentials = []CredentialWire{credential}
	return submission
}
