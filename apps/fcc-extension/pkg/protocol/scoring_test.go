package protocol

import (
	"math/big"
	"strings"
	"testing"

	"github.com/ethereum/go-ethereum/accounts"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

func TestScoringV1GoldenXRPAndUSDVector(t *testing.T) {
	rules, binding, bid := scoringFixture(t)

	xrp, err := ScoreBid(rules, binding, bid, FtsoSnapshot{}, 100)
	if err != nil {
		t.Fatal(err)
	}
	if xrp.WinningAmountXrpMicros != 400_000 || xrp.TotalPenalty.String() != "4400000000000" {
		t.Fatalf("unexpected XRP score: %+v", xrp)
	}

	usdBid := bid
	usdBid.QuoteCurrency = QuoteUSD
	usdBid.PriceMicros = 1_000_000
	usd, err := ScoreBid(rules, binding, usdBid, FtsoSnapshot{Value: big.NewInt(250_000), Decimals: 5}, 100)
	if err != nil {
		t.Fatal(err)
	}
	if usd.WinningAmountXrpMicros != xrp.WinningAmountXrpMicros || usd.TotalPenalty.Cmp(xrp.TotalPenalty) != 0 {
		t.Fatalf("equivalent XRP/USD quotes diverged: xrp=%+v usd=%+v", xrp, usd)
	}
}

func TestScoringV1RoundsUSDPayoutUp(t *testing.T) {
	rules, binding, bid := scoringFixture(t)
	bid.QuoteCurrency = QuoteUSD
	bid.PriceMicros = 1_000_001
	scored, err := ScoreBid(rules, binding, bid, FtsoSnapshot{Value: big.NewInt(300_000), Decimals: 5}, 100)
	if err != nil {
		t.Fatal(err)
	}
	if scored.WinningAmountXrpMicros != 333_334 {
		t.Fatalf("USD conversion did not round up: %d", scored.WinningAmountXrpMicros)
	}
}

func TestScoringV1CredentialsAreFullyDomainBound(t *testing.T) {
	rules, binding, bid := scoringFixture(t)
	mutated := binding
	mutated.RulesHash = common.HexToHash("0x9999")
	if _, err := ScoreBid(rules, mutated, bid, FtsoSnapshot{}, 100); err == nil || err.Error() != "INVALID_CREDENTIAL" {
		t.Fatalf("wrong rules domain accepted: %v", err)
	}

	if _, err := ScoreBid(rules, binding, bid, FtsoSnapshot{}, 201); err == nil || err.Error() != "INVALID_CREDENTIAL" {
		t.Fatalf("expired credential accepted: %v", err)
	}

	bid.Credentials = nil
	if _, err := ScoreBid(rules, binding, bid, FtsoSnapshot{}, 100); err == nil || err.Error() != "MISSING_CREDENTIAL" {
		t.Fatalf("missing credential accepted: %v", err)
	}
}

func TestScoringV1TieUsesFirstAcceptedBid(t *testing.T) {
	rules, binding, bid := scoringFixture(t)
	late := bid
	late.BidID = big.NewInt(2)
	early := bid
	early.BidID = big.NewInt(1)

	winner, found, err := SelectWinner(
		rules,
		[]CredentialDomainBinding{binding, binding},
		[]PrivateBid{late, early},
		FtsoSnapshot{Value: big.NewInt(250_000), Decimals: 5},
		100,
	)
	if err != nil {
		t.Fatal(err)
	}
	if !found || winner.BidID.Cmp(big.NewInt(1)) != 0 {
		t.Fatalf("tie did not select earliest accepted bid: %+v", winner)
	}
}

func TestScoringV1NeverTurnsInvalidSharedFtsoStateIntoRefund(t *testing.T) {
	rules, binding, bid := scoringFixture(t)
	if _, _, err := SelectWinner(rules, []CredentialDomainBinding{binding}, []PrivateBid{bid}, FtsoSnapshot{}, 100); err == nil || err.Error() != "INVALID_FTSO_SNAPSHOT" {
		t.Fatalf("invalid shared FTSO state was not fatal: %v", err)
	}
}

func TestScoringV1RejectsInvalidAndOverCeilingBids(t *testing.T) {
	rules, binding, bid := scoringFixture(t)
	for name, mutate := range map[string]func(*PrivateBid){
		"zero price":     func(candidate *PrivateBid) { candidate.PriceMicros = 0 },
		"over ceiling":   func(candidate *PrivateBid) { candidate.PriceMicros = rules.CeilingXrpMicros + 1 },
		"late delivery":  func(candidate *PrivateBid) { candidate.DeliveryDays = rules.MaxDeliveryDays + 1 },
		"short warranty": func(candidate *PrivateBid) { candidate.WarrantyDays = rules.MinWarrantyDays - 1 },
		"currency":       func(candidate *PrivateBid) { candidate.QuoteCurrency = 9 },
	} {
		t.Run(name, func(t *testing.T) {
			candidate := bid
			mutate(&candidate)
			if _, err := ScoreBid(rules, binding, candidate, FtsoSnapshot{}, 100); err == nil {
				t.Fatal("invalid bid was eligible")
			}
		})
	}
}

func scoringFixture(t *testing.T) (ScoringRules, CredentialDomainBinding, PrivateBid) {
	t.Helper()
	issuerKey, err := crypto.HexToECDSA(strings.Repeat("11", 32))
	if err != nil {
		t.Fatal(err)
	}
	issuer := crypto.PubkeyToAddress(issuerKey.PublicKey)
	vendor := common.HexToAddress("0x1000000000000000000000000000000000000001")
	credentialType := crypto.Keccak256Hash([]byte("LICENSED_VENDOR"))
	rules := ScoringRules{
		SchemaVersion:       ScoringSchemaVersion,
		CeilingXrpMicros:    1_000_000,
		AllowXRP:            true,
		AllowUSD:            true,
		MaxDeliveryDays:     10,
		MinWarrantyDays:     12,
		MaxWarrantyDays:     36,
		PriceWeightBPS:      6_000,
		DeliveryWeightBPS:   2_500,
		WarrantyWeightBPS:   1_500,
		RequiredCredentials: []CredentialRequirement{{CredentialType: credentialType, Issuer: issuer}},
	}
	binding := CredentialDomainBinding{
		ChainID:     big.NewInt(114),
		Market:      common.HexToAddress("0x2000000000000000000000000000000000000002"),
		ExtensionID: big.NewInt(0x10001),
		CodeVersion: common.HexToHash("0x1234"),
		TenderID:    big.NewInt(42),
		RulesHash:   common.HexToHash("0x5678"),
		Vendor:      vendor,
	}
	credential := Credential{
		CredentialType: credentialType,
		Issuer:         issuer,
		ValidUntil:     200,
		Nonce:          common.HexToHash("0xabcd"),
	}
	digest, err := CredentialDigest(binding, credential)
	if err != nil {
		t.Fatal(err)
	}
	credential.Signature, err = crypto.Sign(accounts.TextHash(digest[:]), issuerKey)
	if err != nil {
		t.Fatal(err)
	}
	bid := PrivateBid{
		BidID:         big.NewInt(1),
		Vendor:        vendor,
		QuoteCurrency: QuoteXRP,
		PriceMicros:   400_000,
		DeliveryDays:  5,
		WarrantyDays:  24,
		Credentials:   []Credential{credential},
	}
	return rules, binding, bid
}
