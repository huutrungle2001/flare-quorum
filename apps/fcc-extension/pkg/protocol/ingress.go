package protocol

import (
	"errors"
	"math/big"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

const Coston2ChainID = int64(114)

var (
	BidSlotDomain = crypto.Keccak256Hash([]byte("VEILBID_BID_SLOT_V1"))
	bidSlotArgs   = abi.Arguments{
		{Type: mustWireABIType("bytes32")},
		{Type: mustWireABIType("uint256")},
		{Type: mustWireABIType("address")},
		{Type: mustWireABIType("uint256")},
		{Type: mustWireABIType("uint256")},
		{Type: mustWireABIType("address")},
	}
)

type ValidatedSubmission struct {
	RulesHash           common.Hash
	PlaintextCommitment common.Hash
	SealedSlot          common.Hash
}

func ValidateSubmission(submission BidSubmission, now uint64) (ValidatedSubmission, error) {
	return validateSubmission(submission, now, true)
}

// ValidateStoredSubmission revalidates a sealed bid after a restart without
// applying the intake-time clock checks. Credentials remain required through
// the frozen bid deadline, and every public domain field is still checked.
func ValidateStoredSubmission(submission BidSubmission) (ValidatedSubmission, error) {
	return validateSubmission(submission, 0, false)
}

func validateSubmission(submission BidSubmission, now uint64, enforceIntakeClock bool) (ValidatedSubmission, error) {
	if submission.SchemaVersion != BidSchemaVersion || submission.ChainID == nil || submission.ChainID.Cmp(big.NewInt(Coston2ChainID)) != 0 {
		return ValidatedSubmission{}, errors.New("INVALID_BID_NETWORK")
	}
	if submission.Market == (common.Address{}) || submission.ExtensionID == nil || submission.ExtensionID.Cmp(big.NewInt(0x10000)) < 0 || submission.CodeVersion == (common.Hash{}) || submission.TenderID == nil || submission.TenderID.Sign() <= 0 || submission.Vendor == (common.Address{}) {
		return ValidatedSubmission{}, errors.New("INVALID_BID_DOMAIN")
	}
	if submission.SubmissionNonce == nil || submission.SubmissionNonce.Sign() <= 0 || submission.Salt == (common.Hash{}) {
		return ValidatedSubmission{}, errors.New("INVALID_BID_NONCE")
	}
	if err := submission.Rules.Validate(); err != nil {
		return ValidatedSubmission{}, err
	}
	if enforceIntakeClock && (now >= submission.Rules.BidDeadline || submission.ReceiptExpiry < now) {
		return ValidatedSubmission{}, errors.New("INVALID_BID_EXPIRY")
	}
	if submission.ReceiptExpiry > submission.Rules.BidDeadline {
		return ValidatedSubmission{}, errors.New("INVALID_BID_EXPIRY")
	}
	if submission.PriceMicros == 0 || submission.DeliveryDays > submission.Rules.MaxDeliveryDays || submission.WarrantyDays < submission.Rules.MinWarrantyDays {
		return ValidatedSubmission{}, errors.New("INELIGIBLE_BID")
	}
	switch submission.QuoteCurrency {
	case QuoteXRP:
		if !submission.Rules.AllowXRP || submission.PriceMicros > submission.Rules.CeilingXrpMicros {
			return ValidatedSubmission{}, errors.New("INELIGIBLE_BID")
		}
	case QuoteUSD:
		if !submission.Rules.AllowUSD {
			return ValidatedSubmission{}, errors.New("UNSUPPORTED_QUOTE_CURRENCY")
		}
	default:
		return ValidatedSubmission{}, errors.New("UNSUPPORTED_QUOTE_CURRENCY")
	}

	rulesHash, err := RulesHash(submission.Rules)
	if err != nil {
		return ValidatedSubmission{}, errors.New("INVALID_RULES_ENCODING")
	}
	binding := CredentialDomainBinding{
		ChainID:     submission.ChainID,
		Market:      submission.Market,
		ExtensionID: submission.ExtensionID,
		CodeVersion: submission.CodeVersion,
		TenderID:    submission.TenderID,
		RulesHash:   rulesHash,
		Vendor:      submission.Vendor,
	}
	credentials := make([]Credential, len(submission.Credentials))
	for index, credential := range submission.Credentials {
		credentials[index] = Credential{
			CredentialType: credential.CredentialType,
			Issuer:         credential.Issuer,
			ValidUntil:     credential.ValidUntil,
			Nonce:          credential.Nonce,
			Signature:      credential.Signature,
		}
	}
	if err := verifyCredentials(submission.Rules, binding, credentials, submission.Rules.BidDeadline); err != nil {
		return ValidatedSubmission{}, err
	}
	commitment, err := BidCommitment(submission)
	if err != nil {
		return ValidatedSubmission{}, errors.New("INVALID_BID_ENCODING")
	}
	sealedSlot, err := BidSlotFor(submission.ChainID, submission.Market, submission.ExtensionID, submission.TenderID, submission.Vendor)
	if err != nil {
		return ValidatedSubmission{}, errors.New("INVALID_BID_DOMAIN")
	}
	return ValidatedSubmission{
		RulesHash:           rulesHash,
		PlaintextCommitment: commitment,
		SealedSlot:          sealedSlot,
	}, nil
}

func BidSlotFor(chainID *big.Int, market common.Address, extensionID, tenderID *big.Int, vendor common.Address) (common.Hash, error) {
	if chainID == nil || chainID.Sign() <= 0 || market == (common.Address{}) || extensionID == nil || extensionID.Sign() <= 0 || tenderID == nil || tenderID.Sign() <= 0 || vendor == (common.Address{}) {
		return common.Hash{}, errors.New("INVALID_BID_SLOT_DOMAIN")
	}
	slotEncoded, err := bidSlotArgs.Pack(BidSlotDomain, chainID, market, extensionID, tenderID, vendor)
	if err != nil {
		return common.Hash{}, err
	}
	return crypto.Keccak256Hash(slotEncoded), nil
}
