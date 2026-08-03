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

func TestScoringV1WinnerIsStableAcrossEveryBidPermutation(t *testing.T) {
	rules, binding, _ := scoringFixture(t)
	rules.AllowUSD = false
	rules.FtsoFeedID = [21]byte{}
	rules.RequiredCredentials = nil

	vendors := []common.Address{
		common.HexToAddress("0x1000000000000000000000000000000000000001"),
		common.HexToAddress("0x2000000000000000000000000000000000000002"),
		common.HexToAddress("0x3000000000000000000000000000000000000003"),
	}
	bids := []PrivateBid{
		{BidID: big.NewInt(1), Vendor: vendors[0], QuoteCurrency: QuoteXRP, PriceMicros: 500_000, DeliveryDays: 8, WarrantyDays: 12},
		{BidID: big.NewInt(2), Vendor: vendors[1], QuoteCurrency: QuoteXRP, PriceMicros: 450_000, DeliveryDays: 5, WarrantyDays: 24},
		{BidID: big.NewInt(3), Vendor: vendors[2], QuoteCurrency: QuoteXRP, PriceMicros: 300_000, DeliveryDays: 4, WarrantyDays: 36},
	}
	bindings := make([]CredentialDomainBinding, len(vendors))
	for index, vendor := range vendors {
		bindings[index] = binding
		bindings[index].Vendor = vendor
	}

	permutations := [][3]int{{0, 1, 2}, {0, 2, 1}, {1, 0, 2}, {1, 2, 0}, {2, 0, 1}, {2, 1, 0}}
	for _, permutation := range permutations {
		permutedBids := []PrivateBid{bids[permutation[0]], bids[permutation[1]], bids[permutation[2]]}
		permutedBindings := []CredentialDomainBinding{bindings[permutation[0]], bindings[permutation[1]], bindings[permutation[2]]}
		winner, found, err := SelectWinner(rules, permutedBindings, permutedBids, FtsoSnapshot{}, 100)
		if err != nil {
			t.Fatalf("permutation %v failed: %v", permutation, err)
		}
		if !found || winner.BidID.Cmp(big.NewInt(3)) != 0 || winner.Vendor != vendors[2] {
			t.Fatalf("permutation %v changed winner: %+v", permutation, winner)
		}
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

func TestScoringV1AcceptsMaximumUint64XRPBoundary(t *testing.T) {
	rules, binding, bid := scoringFixture(t)
	rules.CeilingXrpMicros = ^uint64(0)
	rules.AllowUSD = false
	rules.FtsoFeedID = [21]byte{}
	rules.MaxDeliveryDays = ^uint16(0)
	rules.MinWarrantyDays = 0
	rules.MaxWarrantyDays = ^uint16(0)
	rules.PriceWeightBPS = WeightBPS
	rules.DeliveryWeightBPS = 0
	rules.WarrantyWeightBPS = 0
	rules.RequiredCredentials = nil
	bid.PriceMicros = ^uint64(0)
	bid.DeliveryDays = ^uint16(0)
	bid.WarrantyDays = 0
	bid.Credentials = nil

	scored, err := ScoreBid(rules, binding, bid, FtsoSnapshot{}, ^uint64(0))
	if err != nil {
		t.Fatal(err)
	}
	if scored.WinningAmountXrpMicros != ^uint64(0) || scored.TotalPenalty.Cmp(new(big.Int).SetUint64(uint64(WeightBPS)*PenaltyScale)) != 0 {
		t.Fatalf("maximum boundary drifted: %+v", scored)
	}
}

func TestScoringV1USDConversionCannotOverflowOrRoundToZero(t *testing.T) {
	rules, binding, bid := scoringFixture(t)
	rules.CeilingXrpMicros = ^uint64(0)
	rules.RequiredCredentials = nil
	bid.Credentials = nil
	bid.QuoteCurrency = QuoteUSD
	bid.PriceMicros = ^uint64(0)

	if _, err := ScoreBid(rules, binding, bid, FtsoSnapshot{Value: big.NewInt(1), Decimals: 18}, 100); err == nil || err.Error() != "INELIGIBLE_BID" {
		t.Fatalf("uint64-overflowing payout was accepted: %v", err)
	}

	bid.PriceMicros = 1
	scored, err := ScoreBid(rules, binding, bid, FtsoSnapshot{Value: new(big.Int).Exp(big.NewInt(10), big.NewInt(18), nil), Decimals: -18}, 100)
	if err != nil {
		t.Fatal(err)
	}
	if scored.WinningAmountXrpMicros != 1 {
		t.Fatalf("positive USD quote rounded to zero instead of up: %d", scored.WinningAmountXrpMicros)
	}
}

func FuzzScoringV1USDConversionMatchesCheckedCeilingDivision(f *testing.F) {
	f.Add(uint64(1), uint64(1), uint8(18))
	f.Add(^uint64(0), uint64(1), uint8(36))
	f.Add(uint64(1), ^uint64(0), uint8(0))
	f.Add(uint64(1_000_001), uint64(300_000), uint8(23))
	f.Fuzz(func(t *testing.T, price, ftsoValue uint64, decimalSeed uint8) {
		decimals := int8(int(decimalSeed%37) - 18)
		vendor := common.HexToAddress("0x1000000000000000000000000000000000000001")
		rules := ScoringRules{
			SchemaVersion: ScoringSchemaVersion, CeilingXrpMicros: ^uint64(0), BidDeadline: 1,
			AllowUSD: true, FtsoFeedID: [21]byte{'X'}, MaxDeliveryDays: 1,
			PriceWeightBPS: WeightBPS,
		}
		binding := CredentialDomainBinding{
			ChainID: big.NewInt(114), Market: common.HexToAddress("0x2000000000000000000000000000000000000002"),
			ExtensionID: big.NewInt(65537), CodeVersion: common.HexToHash("0x1234"), TenderID: big.NewInt(1),
			RulesHash: common.HexToHash("0x5678"), Vendor: vendor,
		}
		bid := PrivateBid{BidID: big.NewInt(1), Vendor: vendor, QuoteCurrency: QuoteUSD, PriceMicros: price}
		scored, err := ScoreBid(rules, binding, bid, FtsoSnapshot{Value: new(big.Int).SetUint64(ftsoValue), Decimals: decimals}, 1)

		if price == 0 || ftsoValue == 0 {
			if err == nil {
				t.Fatal("zero input unexpectedly produced an eligible payout")
			}
			return
		}
		numerator := new(big.Int).SetUint64(price)
		denominator := new(big.Int).SetUint64(ftsoValue)
		if decimals >= 0 {
			numerator.Mul(numerator, new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(decimals)), nil))
		} else {
			denominator.Mul(denominator, new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(-decimals)), nil))
		}
		expected, remainder := new(big.Int), new(big.Int)
		expected.QuoRem(numerator, denominator, remainder)
		if remainder.Sign() != 0 {
			expected.Add(expected, big.NewInt(1))
		}
		if !expected.IsUint64() {
			if err == nil {
				t.Fatalf("payout outside uint64 was accepted: %s", expected)
			}
			return
		}
		if err != nil {
			t.Fatalf("valid payout %s was rejected: %v", expected, err)
		}
		if scored.WinningAmountXrpMicros != expected.Uint64() || scored.WinningAmountXrpMicros == 0 {
			t.Fatalf("rounding mismatch: got=%d want=%s decimals=%d", scored.WinningAmountXrpMicros, expected, decimals)
		}
	})
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
