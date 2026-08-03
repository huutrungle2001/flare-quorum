package protocol

import (
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/flare-foundation/go-flare-common/pkg/tee/structs"
)

const BidSchemaVersion = uint16(1)

var (
	RulesDomain      = crypto.Keccak256Hash([]byte("VEILBID_RULES_V1"))
	BidDomain        = crypto.Keccak256Hash([]byte("VEILBID_BID_V1"))
	BidReceiptDomain = crypto.Keccak256Hash([]byte("VEILBID_BID_RECEIPT_V1"))

	ScoringRulesArg        abi.Argument
	BidSubmissionArg       abi.Argument
	BidReceiptArg          abi.Argument
	rulesHashArguments     abi.Arguments
	bidCommitmentArguments abi.Arguments
	receiptDigestArguments abi.Arguments
)

type CredentialWire struct {
	CredentialType common.Hash    `json:"credentialType" abi:"credentialType"`
	Issuer         common.Address `json:"issuer" abi:"issuer"`
	ValidUntil     uint64         `json:"validUntil" abi:"validUntil"`
	Nonce          common.Hash    `json:"nonce" abi:"nonce"`
	Signature      []byte         `json:"signature" abi:"signature"`
}

type BidSubmission struct {
	SchemaVersion   uint16           `json:"schemaVersion" abi:"schemaVersion"`
	ChainID         *big.Int         `json:"chainId" abi:"chainId"`
	Market          common.Address   `json:"market" abi:"market"`
	ExtensionID     *big.Int         `json:"extensionId" abi:"extensionId"`
	CodeVersion     common.Hash      `json:"codeVersion" abi:"codeVersion"`
	TenderID        *big.Int         `json:"tenderId" abi:"tenderId"`
	Vendor          common.Address   `json:"vendor" abi:"vendor"`
	SubmissionNonce *big.Int         `json:"submissionNonce" abi:"submissionNonce"`
	Rules           ScoringRules     `json:"rules" abi:"rules"`
	ReceiptExpiry   uint64           `json:"receiptExpiry" abi:"receiptExpiry"`
	QuoteCurrency   uint8            `json:"quoteCurrency" abi:"quoteCurrency"`
	PriceMicros     uint64           `json:"priceMicros" abi:"priceMicros"`
	DeliveryDays    uint16           `json:"deliveryDays" abi:"deliveryDays"`
	WarrantyDays    uint16           `json:"warrantyDays" abi:"warrantyDays"`
	Credentials     []CredentialWire `json:"credentials" abi:"credentials"`
	Salt            common.Hash      `json:"salt" abi:"salt"`
}

type BidReceipt struct {
	SchemaVersion       uint16         `json:"schemaVersion" abi:"schemaVersion"`
	ChainID             *big.Int       `json:"chainId" abi:"chainId"`
	Market              common.Address `json:"market" abi:"market"`
	ExtensionID         *big.Int       `json:"extensionId" abi:"extensionId"`
	CodeVersion         common.Hash    `json:"codeVersion" abi:"codeVersion"`
	TenderID            *big.Int       `json:"tenderId" abi:"tenderId"`
	Vendor              common.Address `json:"vendor" abi:"vendor"`
	SubmissionNonce     *big.Int       `json:"submissionNonce" abi:"submissionNonce"`
	RulesHash           common.Hash    `json:"rulesHash" abi:"rulesHash"`
	PlaintextCommitment common.Hash    `json:"plaintextCommitment" abi:"plaintextCommitment"`
	TeeID               common.Address `json:"teeId" abi:"teeId"`
	Expiry              uint64         `json:"expiry" abi:"expiry"`
	Signature           []byte         `json:"signature" abi:"signature"`
}

func init() {
	requirementComponents := []abi.ArgumentMarshaling{
		{Name: "credentialType", Type: "bytes32"},
		{Name: "issuer", Type: "address"},
	}
	rulesComponents := []abi.ArgumentMarshaling{
		{Name: "schemaVersion", Type: "uint16"},
		{Name: "ceilingXrpMicros", Type: "uint64"},
		{Name: "bidDeadline", Type: "uint64"},
		{Name: "allowXrp", Type: "bool"},
		{Name: "allowUsd", Type: "bool"},
		{Name: "ftsoFeedId", Type: "bytes21"},
		{Name: "maxDeliveryDays", Type: "uint16"},
		{Name: "minWarrantyDays", Type: "uint16"},
		{Name: "maxWarrantyDays", Type: "uint16"},
		{Name: "priceWeightBps", Type: "uint16"},
		{Name: "deliveryWeightBps", Type: "uint16"},
		{Name: "warrantyWeightBps", Type: "uint16"},
		{Name: "requiredCredentials", Type: "tuple[]", Components: requirementComponents},
	}
	credentialComponents := []abi.ArgumentMarshaling{
		{Name: "credentialType", Type: "bytes32"},
		{Name: "issuer", Type: "address"},
		{Name: "validUntil", Type: "uint64"},
		{Name: "nonce", Type: "bytes32"},
		{Name: "signature", Type: "bytes"},
	}
	bidComponents := []abi.ArgumentMarshaling{
		{Name: "schemaVersion", Type: "uint16"},
		{Name: "chainId", Type: "uint256"},
		{Name: "market", Type: "address"},
		{Name: "extensionId", Type: "uint256"},
		{Name: "codeVersion", Type: "bytes32"},
		{Name: "tenderId", Type: "uint256"},
		{Name: "vendor", Type: "address"},
		{Name: "submissionNonce", Type: "uint256"},
		{Name: "rules", Type: "tuple", Components: rulesComponents},
		{Name: "receiptExpiry", Type: "uint64"},
		{Name: "quoteCurrency", Type: "uint8"},
		{Name: "priceMicros", Type: "uint64"},
		{Name: "deliveryDays", Type: "uint16"},
		{Name: "warrantyDays", Type: "uint16"},
		{Name: "credentials", Type: "tuple[]", Components: credentialComponents},
		{Name: "salt", Type: "bytes32"},
	}
	receiptComponents := []abi.ArgumentMarshaling{
		{Name: "schemaVersion", Type: "uint16"},
		{Name: "chainId", Type: "uint256"},
		{Name: "market", Type: "address"},
		{Name: "extensionId", Type: "uint256"},
		{Name: "codeVersion", Type: "bytes32"},
		{Name: "tenderId", Type: "uint256"},
		{Name: "vendor", Type: "address"},
		{Name: "submissionNonce", Type: "uint256"},
		{Name: "rulesHash", Type: "bytes32"},
		{Name: "plaintextCommitment", Type: "bytes32"},
		{Name: "teeId", Type: "address"},
		{Name: "expiry", Type: "uint64"},
		{Name: "signature", Type: "bytes"},
	}

	ScoringRulesArg = abi.Argument{Type: mustWireTuple(rulesComponents)}
	BidSubmissionArg = abi.Argument{Type: mustWireTuple(bidComponents)}
	BidReceiptArg = abi.Argument{Type: mustWireTuple(receiptComponents)}
	rulesHashArguments = abi.Arguments{{Type: mustWireABIType("bytes32")}, ScoringRulesArg}
	bidCommitmentArguments = abi.Arguments{{Type: mustWireABIType("bytes32")}, BidSubmissionArg}
	receiptDigestArguments = abi.Arguments{
		{Type: mustWireABIType("bytes32")},
		{Type: mustWireABIType("uint16")},
		{Type: mustWireABIType("uint256")},
		{Type: mustWireABIType("address")},
		{Type: mustWireABIType("uint256")},
		{Type: mustWireABIType("bytes32")},
		{Type: mustWireABIType("uint256")},
		{Type: mustWireABIType("bytes32")},
		{Type: mustWireABIType("address")},
		{Type: mustWireABIType("uint256")},
		{Type: mustWireABIType("bytes32")},
		{Type: mustWireABIType("address")},
		{Type: mustWireABIType("uint64")},
	}
}

func EncodeBidSubmission(submission BidSubmission) ([]byte, error) {
	return abi.Arguments{BidSubmissionArg}.Pack(submission)
}

func DecodeBidSubmission(data []byte, destination *BidSubmission) error {
	return structs.DecodeTo(BidSubmissionArg, data, destination)
}

func EncodeBidReceipt(receipt BidReceipt) ([]byte, error) {
	return abi.Arguments{BidReceiptArg}.Pack(receipt)
}

func DecodeBidReceipt(data []byte, destination *BidReceipt) error {
	return structs.DecodeTo(BidReceiptArg, data, destination)
}

func RulesHash(rules ScoringRules) (common.Hash, error) {
	encoded, err := rulesHashArguments.Pack(RulesDomain, rules)
	if err != nil {
		return common.Hash{}, fmt.Errorf("encode rules hash: %w", err)
	}
	return crypto.Keccak256Hash(encoded), nil
}

func BidCommitment(submission BidSubmission) (common.Hash, error) {
	encoded, err := bidCommitmentArguments.Pack(BidDomain, submission)
	if err != nil {
		return common.Hash{}, fmt.Errorf("encode bid commitment: %w", err)
	}
	return crypto.Keccak256Hash(encoded), nil
}

func BidReceiptDigest(receipt BidReceipt) (common.Hash, error) {
	encoded, err := BidReceiptSigningMessage(receipt)
	if err != nil {
		return common.Hash{}, err
	}
	return crypto.Keccak256Hash(encoded), nil
}

// BidReceiptSigningMessage is sent to tee-node /sign. The node hashes this
// exact ABI payload once and applies the Ethereum signed-message prefix.
func BidReceiptSigningMessage(receipt BidReceipt) ([]byte, error) {
	encoded, err := receiptDigestArguments.Pack(
		BidReceiptDomain,
		receipt.SchemaVersion,
		receipt.ChainID,
		receipt.Market,
		receipt.ExtensionID,
		receipt.CodeVersion,
		receipt.TenderID,
		receipt.RulesHash,
		receipt.Vendor,
		receipt.SubmissionNonce,
		receipt.PlaintextCommitment,
		receipt.TeeID,
		receipt.Expiry,
	)
	if err != nil {
		return nil, fmt.Errorf("encode bid receipt signing message: %w", err)
	}
	return encoded, nil
}

func mustWireTuple(components []abi.ArgumentMarshaling) abi.Type {
	value, err := abi.NewType("tuple", "", components)
	if err != nil {
		panic(err)
	}
	return value
}

func mustWireABIType(name string) abi.Type {
	value, err := abi.NewType(name, "", nil)
	if err != nil {
		panic(err)
	}
	return value
}
