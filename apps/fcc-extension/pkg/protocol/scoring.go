package protocol

import (
	"errors"
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum/accounts"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

const (
	ScoringSchemaVersion = uint16(1)
	PenaltyScale         = uint64(1_000_000_000)
	WeightBPS            = uint16(10_000)
	MaxCredentialCount   = 4

	QuoteXRP = uint8(0)
	QuoteUSD = uint8(1)
)

var (
	CredentialDomain = crypto.Keccak256Hash([]byte("VEILBID_CREDENTIAL_V1"))
	credentialArgs   = abi.Arguments{
		{Type: mustScoreABIType("bytes32")},
		{Type: mustScoreABIType("uint256")},
		{Type: mustScoreABIType("address")},
		{Type: mustScoreABIType("uint256")},
		{Type: mustScoreABIType("bytes32")},
		{Type: mustScoreABIType("uint256")},
		{Type: mustScoreABIType("bytes32")},
		{Type: mustScoreABIType("address")},
		{Type: mustScoreABIType("bytes32")},
		{Type: mustScoreABIType("uint64")},
		{Type: mustScoreABIType("bytes32")},
	}
)

type CredentialRequirement struct {
	CredentialType common.Hash    `json:"credentialType" abi:"credentialType"`
	Issuer         common.Address `json:"issuer" abi:"issuer"`
}

type ScoringRules struct {
	SchemaVersion       uint16                  `json:"schemaVersion" abi:"schemaVersion"`
	CeilingXrpMicros    uint64                  `json:"ceilingXrpMicros" abi:"ceilingXrpMicros"`
	BidDeadline         uint64                  `json:"bidDeadline" abi:"bidDeadline"`
	AllowXRP            bool                    `json:"allowXrp" abi:"allowXrp"`
	AllowUSD            bool                    `json:"allowUsd" abi:"allowUsd"`
	FtsoFeedID          [21]byte                `json:"ftsoFeedId" abi:"ftsoFeedId"`
	MaxDeliveryDays     uint16                  `json:"maxDeliveryDays" abi:"maxDeliveryDays"`
	MinWarrantyDays     uint16                  `json:"minWarrantyDays" abi:"minWarrantyDays"`
	MaxWarrantyDays     uint16                  `json:"maxWarrantyDays" abi:"maxWarrantyDays"`
	PriceWeightBPS      uint16                  `json:"priceWeightBps" abi:"priceWeightBps"`
	DeliveryWeightBPS   uint16                  `json:"deliveryWeightBps" abi:"deliveryWeightBps"`
	WarrantyWeightBPS   uint16                  `json:"warrantyWeightBps" abi:"warrantyWeightBps"`
	RequiredCredentials []CredentialRequirement `json:"requiredCredentials" abi:"requiredCredentials"`
}

type CredentialDomainBinding struct {
	ChainID     *big.Int
	Market      common.Address
	ExtensionID *big.Int
	CodeVersion common.Hash
	TenderID    *big.Int
	RulesHash   common.Hash
	Vendor      common.Address
}

type Credential struct {
	CredentialType common.Hash
	Issuer         common.Address
	ValidUntil     uint64
	Nonce          common.Hash
	Signature      []byte
}

type PrivateBid struct {
	BidID         *big.Int
	Vendor        common.Address
	QuoteCurrency uint8
	PriceMicros   uint64
	DeliveryDays  uint16
	WarrantyDays  uint16
	Credentials   []Credential
}

type FtsoSnapshot struct {
	Value    *big.Int
	Decimals int8
}

type ScoredBid struct {
	BidID                  *big.Int
	Vendor                 common.Address
	WinningAmountXrpMicros uint64
	TotalPenalty           *big.Int
}

func (rules ScoringRules) Validate() error {
	if rules.SchemaVersion != ScoringSchemaVersion {
		return errors.New("UNSUPPORTED_SCORING_SCHEMA")
	}
	if rules.CeilingXrpMicros == 0 || (!rules.AllowXRP && !rules.AllowUSD) {
		return errors.New("INVALID_PRICE_POLICY")
	}
	if rules.BidDeadline == 0 || (rules.AllowUSD && rules.FtsoFeedID == ([21]byte{})) {
		return errors.New("INVALID_TENDER_CHECKPOINT")
	}
	if rules.MaxDeliveryDays == 0 || rules.MaxWarrantyDays < rules.MinWarrantyDays {
		return errors.New("INVALID_SERVICE_POLICY")
	}
	weights := uint32(rules.PriceWeightBPS) + uint32(rules.DeliveryWeightBPS) + uint32(rules.WarrantyWeightBPS)
	if weights != uint32(WeightBPS) {
		return errors.New("INVALID_SCORING_WEIGHTS")
	}
	if rules.WarrantyWeightBPS != 0 && rules.MaxWarrantyDays == rules.MinWarrantyDays {
		return errors.New("INVALID_WARRANTY_RANGE")
	}
	if len(rules.RequiredCredentials) > MaxCredentialCount {
		return errors.New("TOO_MANY_CREDENTIAL_REQUIREMENTS")
	}
	seen := make(map[[52]byte]struct{}, len(rules.RequiredCredentials))
	for _, requirement := range rules.RequiredCredentials {
		if requirement.CredentialType == (common.Hash{}) || requirement.Issuer == (common.Address{}) {
			return errors.New("INVALID_CREDENTIAL_REQUIREMENT")
		}
		var key [52]byte
		copy(key[:32], requirement.CredentialType[:])
		copy(key[32:], requirement.Issuer[:])
		if _, duplicate := seen[key]; duplicate {
			return errors.New("DUPLICATE_CREDENTIAL_REQUIREMENT")
		}
		seen[key] = struct{}{}
	}
	return nil
}

func CredentialDigest(binding CredentialDomainBinding, credential Credential) (common.Hash, error) {
	if binding.ChainID == nil || binding.ChainID.Sign() <= 0 || binding.ExtensionID == nil || binding.ExtensionID.Sign() <= 0 || binding.TenderID == nil || binding.TenderID.Sign() <= 0 || binding.Market == (common.Address{}) || binding.CodeVersion == (common.Hash{}) || binding.RulesHash == (common.Hash{}) || binding.Vendor == (common.Address{}) {
		return common.Hash{}, errors.New("INVALID_CREDENTIAL_DOMAIN")
	}
	encoded, err := credentialArgs.Pack(
		CredentialDomain,
		binding.ChainID,
		binding.Market,
		binding.ExtensionID,
		binding.CodeVersion,
		binding.TenderID,
		binding.RulesHash,
		binding.Vendor,
		credential.CredentialType,
		credential.ValidUntil,
		credential.Nonce,
	)
	if err != nil {
		return common.Hash{}, fmt.Errorf("encode credential digest: %w", err)
	}
	return crypto.Keccak256Hash(encoded), nil
}

func ScoreBid(rules ScoringRules, binding CredentialDomainBinding, bid PrivateBid, snapshot FtsoSnapshot, validAt uint64) (ScoredBid, error) {
	if err := rules.Validate(); err != nil {
		return ScoredBid{}, err
	}
	if bid.BidID == nil || bid.BidID.Sign() <= 0 || bid.Vendor == (common.Address{}) || bid.Vendor != binding.Vendor {
		return ScoredBid{}, errors.New("INVALID_BID_DOMAIN")
	}
	if bid.PriceMicros == 0 || bid.DeliveryDays > rules.MaxDeliveryDays || bid.WarrantyDays < rules.MinWarrantyDays {
		return ScoredBid{}, errors.New("INELIGIBLE_BID")
	}
	if err := verifyCredentials(rules, binding, bid.Credentials, validAt); err != nil {
		return ScoredBid{}, err
	}

	priceXRP, err := convertToXRPMicros(rules, bid, snapshot)
	if err != nil {
		return ScoredBid{}, err
	}
	if priceXRP.Sign() <= 0 || !priceXRP.IsUint64() || priceXRP.Uint64() > rules.CeilingXrpMicros {
		return ScoredBid{}, errors.New("INELIGIBLE_BID")
	}

	pricePenalty := ceilDiv(new(big.Int).Mul(priceXRP, new(big.Int).SetUint64(PenaltyScale)), new(big.Int).SetUint64(rules.CeilingXrpMicros))
	deliveryPenalty := new(big.Int).Quo(
		new(big.Int).Mul(new(big.Int).SetUint64(uint64(bid.DeliveryDays)), new(big.Int).SetUint64(PenaltyScale)),
		new(big.Int).SetUint64(uint64(rules.MaxDeliveryDays)),
	)
	warrantyPenalty := new(big.Int)
	if rules.WarrantyWeightBPS != 0 {
		capped := min(bid.WarrantyDays, rules.MaxWarrantyDays)
		warrantyPenalty.Quo(
			new(big.Int).Mul(new(big.Int).SetUint64(uint64(rules.MaxWarrantyDays-capped)), new(big.Int).SetUint64(PenaltyScale)),
			new(big.Int).SetUint64(uint64(rules.MaxWarrantyDays-rules.MinWarrantyDays)),
		)
	}

	total := new(big.Int)
	total.Add(total, new(big.Int).Mul(new(big.Int).SetUint64(uint64(rules.PriceWeightBPS)), pricePenalty))
	total.Add(total, new(big.Int).Mul(new(big.Int).SetUint64(uint64(rules.DeliveryWeightBPS)), deliveryPenalty))
	total.Add(total, new(big.Int).Mul(new(big.Int).SetUint64(uint64(rules.WarrantyWeightBPS)), warrantyPenalty))
	return ScoredBid{
		BidID:                  new(big.Int).Set(bid.BidID),
		Vendor:                 bid.Vendor,
		WinningAmountXrpMicros: priceXRP.Uint64(),
		TotalPenalty:           total,
	}, nil
}

func SelectWinner(rules ScoringRules, bindings []CredentialDomainBinding, bids []PrivateBid, snapshot FtsoSnapshot, validAt uint64) (ScoredBid, bool, error) {
	if len(bindings) != len(bids) {
		return ScoredBid{}, false, errors.New("BID_BINDING_COUNT_MISMATCH")
	}
	if err := rules.Validate(); err != nil {
		return ScoredBid{}, false, err
	}
	if rules.AllowUSD {
		if snapshot.Value == nil || snapshot.Value.Sign() <= 0 || snapshot.Decimals < -18 || snapshot.Decimals > 18 {
			return ScoredBid{}, false, errors.New("INVALID_FTSO_SNAPSHOT")
		}
	}
	var winner ScoredBid
	found := false
	for index, bid := range bids {
		scored, err := ScoreBid(rules, bindings[index], bid, snapshot, validAt)
		if err != nil {
			continue
		}
		if !found || scored.TotalPenalty.Cmp(winner.TotalPenalty) < 0 ||
			(scored.TotalPenalty.Cmp(winner.TotalPenalty) == 0 && scored.BidID.Cmp(winner.BidID) < 0) {
			winner = scored
			found = true
		}
	}
	return winner, found, nil
}

func verifyCredentials(rules ScoringRules, binding CredentialDomainBinding, credentials []Credential, validAt uint64) error {
	if len(credentials) > MaxCredentialCount || len(credentials) != len(rules.RequiredCredentials) {
		if len(credentials) < len(rules.RequiredCredentials) {
			return errors.New("MISSING_CREDENTIAL")
		}
		return errors.New("TOO_MANY_CREDENTIALS")
	}
	required := make(map[[52]byte]struct{}, len(rules.RequiredCredentials))
	for _, requirement := range rules.RequiredCredentials {
		var key [52]byte
		copy(key[:32], requirement.CredentialType[:])
		copy(key[32:], requirement.Issuer[:])
		required[key] = struct{}{}
	}
	seen := make(map[[52]byte]struct{}, len(credentials))
	for _, credential := range credentials {
		var key [52]byte
		copy(key[:32], credential.CredentialType[:])
		copy(key[32:], credential.Issuer[:])
		if _, duplicate := seen[key]; duplicate {
			return errors.New("DUPLICATE_CREDENTIAL")
		}
		if _, expected := required[key]; !expected {
			return errors.New("UNEXPECTED_CREDENTIAL")
		}
		seen[key] = struct{}{}
		if credential.ValidUntil < validAt || credential.Nonce == (common.Hash{}) || len(credential.Signature) != crypto.SignatureLength {
			return errors.New("INVALID_CREDENTIAL")
		}
		r := new(big.Int).SetBytes(credential.Signature[:32])
		s := new(big.Int).SetBytes(credential.Signature[32:64])
		if !crypto.ValidateSignatureValues(credential.Signature[64], r, s, true) {
			return errors.New("INVALID_CREDENTIAL")
		}
		digest, err := CredentialDigest(binding, credential)
		if err != nil {
			return errors.New("INVALID_CREDENTIAL")
		}
		publicKey, err := crypto.SigToPub(accounts.TextHash(digest[:]), credential.Signature)
		if err != nil || crypto.PubkeyToAddress(*publicKey) != credential.Issuer {
			return errors.New("INVALID_CREDENTIAL")
		}
	}
	for _, requirement := range rules.RequiredCredentials {
		var key [52]byte
		copy(key[:32], requirement.CredentialType[:])
		copy(key[32:], requirement.Issuer[:])
		if _, present := seen[key]; !present {
			return errors.New("MISSING_CREDENTIAL")
		}
	}
	return nil
}

func convertToXRPMicros(rules ScoringRules, bid PrivateBid, snapshot FtsoSnapshot) (*big.Int, error) {
	price := new(big.Int).SetUint64(bid.PriceMicros)
	switch bid.QuoteCurrency {
	case QuoteXRP:
		if !rules.AllowXRP {
			return nil, errors.New("UNSUPPORTED_QUOTE_CURRENCY")
		}
		return price, nil
	case QuoteUSD:
		if !rules.AllowUSD || snapshot.Value == nil || snapshot.Value.Sign() <= 0 || snapshot.Decimals < -18 || snapshot.Decimals > 18 {
			return nil, errors.New("INVALID_FTSO_SNAPSHOT")
		}
		if snapshot.Decimals >= 0 {
			numerator := new(big.Int).Mul(price, pow10(uint8(snapshot.Decimals)))
			return ceilDiv(numerator, snapshot.Value), nil
		}
		denominator := new(big.Int).Mul(new(big.Int).Set(snapshot.Value), pow10(uint8(-snapshot.Decimals)))
		return ceilDiv(price, denominator), nil
	default:
		return nil, errors.New("UNSUPPORTED_QUOTE_CURRENCY")
	}
}

func ceilDiv(numerator, denominator *big.Int) *big.Int {
	if denominator.Sign() <= 0 {
		panic("ceilDiv denominator must be positive")
	}
	adjusted := new(big.Int).Add(new(big.Int).Set(numerator), new(big.Int).Sub(new(big.Int).Set(denominator), big.NewInt(1)))
	return adjusted.Quo(adjusted, denominator)
}

func pow10(exponent uint8) *big.Int {
	return new(big.Int).Exp(big.NewInt(10), new(big.Int).SetUint64(uint64(exponent)), nil)
}

func mustScoreABIType(name string) abi.Type {
	value, err := abi.NewType(name, "", nil)
	if err != nil {
		panic(err)
	}
	return value
}
