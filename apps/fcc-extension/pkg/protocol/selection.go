package protocol

import (
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/flare-foundation/go-flare-common/pkg/tee/structs"
)

const SelectionSchemaVersion = uint16(1)

var (
	SelectionDomain           = crypto.Keccak256Hash([]byte("VEILBID_SELECTION_RESULT_V1"))
	SelectionBidReferenceArg  abi.Argument
	SelectionRequestArg       abi.Argument
	SelectionResultArg        abi.Argument
	selectionResultDigestArgs abi.Arguments
)

type SelectionBidReference struct {
	BidID               *big.Int       `json:"bidId" abi:"bidId"`
	Vendor              common.Address `json:"vendor" abi:"vendor"`
	SubmissionNonce     *big.Int       `json:"submissionNonce" abi:"submissionNonce"`
	PlaintextCommitment common.Hash    `json:"plaintextCommitment" abi:"plaintextCommitment"`
	ReceiptBitmap       uint8          `json:"receiptBitmap" abi:"receiptBitmap"`
	AcceptedBlock       uint64         `json:"acceptedBlock" abi:"acceptedBlock"`
}

type SelectionRequest struct {
	SchemaVersion    uint16                  `json:"schemaVersion" abi:"schemaVersion"`
	ChainID          *big.Int                `json:"chainId" abi:"chainId"`
	Market           common.Address          `json:"market" abi:"market"`
	ExtensionID      *big.Int                `json:"extensionId" abi:"extensionId"`
	CodeVersion      common.Hash             `json:"codeVersion" abi:"codeVersion"`
	TenderID         *big.Int                `json:"tenderId" abi:"tenderId"`
	RulesHash        common.Hash             `json:"rulesHash" abi:"rulesHash"`
	PublicCeilingXrp *big.Int                `json:"publicCeilingXrp" abi:"publicCeilingXrp"`
	BidDeadline      uint64                  `json:"bidDeadline" abi:"bidDeadline"`
	OrderedBidRoot   common.Hash             `json:"orderedBidRoot" abi:"orderedBidRoot"`
	QuorumBitmap     uint8                   `json:"quorumBitmap" abi:"quorumBitmap"`
	FtsoFeedID       [21]byte                `json:"ftsoFeedId" abi:"ftsoFeedId"`
	FtsoValue        *big.Int                `json:"ftsoValue" abi:"ftsoValue"`
	FtsoDecimals     int8                    `json:"ftsoDecimals" abi:"ftsoDecimals"`
	FtsoTimestamp    uint64                  `json:"ftsoTimestamp" abi:"ftsoTimestamp"`
	CloseBlock       uint64                  `json:"closeBlock" abi:"closeBlock"`
	ResultNonce      *big.Int                `json:"resultNonce" abi:"resultNonce"`
	ResultExpiry     uint64                  `json:"resultExpiry" abi:"resultExpiry"`
	BidReferences    []SelectionBidReference `json:"bidReferences" abi:"bidReferences"`
}

type SelectionResult struct {
	SchemaVersion    uint16         `json:"schemaVersion" abi:"schemaVersion"`
	ChainID          *big.Int       `json:"chainId" abi:"chainId"`
	Market           common.Address `json:"market" abi:"market"`
	ExtensionID      *big.Int       `json:"extensionId" abi:"extensionId"`
	CodeVersion      common.Hash    `json:"codeVersion" abi:"codeVersion"`
	TenderID         *big.Int       `json:"tenderId" abi:"tenderId"`
	RulesHash        common.Hash    `json:"rulesHash" abi:"rulesHash"`
	OrderedBidRoot   common.Hash    `json:"orderedBidRoot" abi:"orderedBidRoot"`
	QuorumBitmap     uint8          `json:"quorumBitmap" abi:"quorumBitmap"`
	FtsoFeedID       [21]byte       `json:"ftsoFeedId" abi:"ftsoFeedId"`
	FtsoValue        *big.Int       `json:"ftsoValue" abi:"ftsoValue"`
	FtsoDecimals     int8           `json:"ftsoDecimals" abi:"ftsoDecimals"`
	FtsoTimestamp    uint64         `json:"ftsoTimestamp" abi:"ftsoTimestamp"`
	CloseBlock       uint64         `json:"closeBlock" abi:"closeBlock"`
	WinnerBidID      *big.Int       `json:"winnerBidId" abi:"winnerBidId"`
	Winner           common.Address `json:"winner" abi:"winner"`
	WinningAmountXrp *big.Int       `json:"winningAmountXrp" abi:"winningAmountXrp"`
	ResultNonce      *big.Int       `json:"resultNonce" abi:"resultNonce"`
	Expiry           uint64         `json:"expiry" abi:"expiry"`
}

func init() {
	referenceComponents := []abi.ArgumentMarshaling{
		{Name: "bidId", Type: "uint256"},
		{Name: "vendor", Type: "address"},
		{Name: "submissionNonce", Type: "uint256"},
		{Name: "plaintextCommitment", Type: "bytes32"},
		{Name: "receiptBitmap", Type: "uint8"},
		{Name: "acceptedBlock", Type: "uint64"},
	}
	resultComponents := []abi.ArgumentMarshaling{
		{Name: "schemaVersion", Type: "uint16"},
		{Name: "chainId", Type: "uint256"},
		{Name: "market", Type: "address"},
		{Name: "extensionId", Type: "uint256"},
		{Name: "codeVersion", Type: "bytes32"},
		{Name: "tenderId", Type: "uint256"},
		{Name: "rulesHash", Type: "bytes32"},
		{Name: "orderedBidRoot", Type: "bytes32"},
		{Name: "quorumBitmap", Type: "uint8"},
		{Name: "ftsoFeedId", Type: "bytes21"},
		{Name: "ftsoValue", Type: "uint256"},
		{Name: "ftsoDecimals", Type: "int8"},
		{Name: "ftsoTimestamp", Type: "uint64"},
		{Name: "closeBlock", Type: "uint64"},
		{Name: "winnerBidId", Type: "uint256"},
		{Name: "winner", Type: "address"},
		{Name: "winningAmountXrp", Type: "uint256"},
		{Name: "resultNonce", Type: "uint256"},
		{Name: "expiry", Type: "uint64"},
	}
	requestComponents := []abi.ArgumentMarshaling{
		{Name: "schemaVersion", Type: "uint16"}, {Name: "chainId", Type: "uint256"}, {Name: "market", Type: "address"},
		{Name: "extensionId", Type: "uint256"}, {Name: "codeVersion", Type: "bytes32"}, {Name: "tenderId", Type: "uint256"},
		{Name: "rulesHash", Type: "bytes32"}, {Name: "publicCeilingXrp", Type: "uint256"}, {Name: "bidDeadline", Type: "uint64"},
		{Name: "orderedBidRoot", Type: "bytes32"}, {Name: "quorumBitmap", Type: "uint8"}, {Name: "ftsoFeedId", Type: "bytes21"},
		{Name: "ftsoValue", Type: "uint256"}, {Name: "ftsoDecimals", Type: "int8"}, {Name: "ftsoTimestamp", Type: "uint64"},
		{Name: "closeBlock", Type: "uint64"}, {Name: "resultNonce", Type: "uint256"}, {Name: "resultExpiry", Type: "uint64"},
		{Name: "bidReferences", Type: "tuple[]", Components: referenceComponents},
	}
	SelectionBidReferenceArg = abi.Argument{Type: mustWireTuple(referenceComponents)}
	SelectionRequestArg = abi.Argument{Type: mustWireTuple(requestComponents)}
	SelectionResultArg = abi.Argument{Type: mustWireTuple(resultComponents)}
	selectionResultDigestArgs = abi.Arguments{
		{Type: mustWireABIType("bytes32")}, {Type: mustWireABIType("uint16")}, {Type: mustWireABIType("uint256")},
		{Type: mustWireABIType("address")}, {Type: mustWireABIType("uint256")}, {Type: mustWireABIType("bytes32")},
		{Type: mustWireABIType("uint256")}, {Type: mustWireABIType("bytes32")}, {Type: mustWireABIType("bytes32")},
		{Type: mustWireABIType("uint8")}, {Type: mustWireABIType("bytes21")}, {Type: mustWireABIType("uint256")},
		{Type: mustWireABIType("int8")}, {Type: mustWireABIType("uint64")}, {Type: mustWireABIType("uint64")},
		{Type: mustWireABIType("uint256")}, {Type: mustWireABIType("address")}, {Type: mustWireABIType("uint256")},
		{Type: mustWireABIType("uint256")}, {Type: mustWireABIType("uint64")},
	}
}

func EncodeSelectionRequest(request SelectionRequest) ([]byte, error) {
	return abi.Arguments{SelectionRequestArg}.Pack(request)
}

func DecodeSelectionRequest(data []byte, destination *SelectionRequest) error {
	return structs.DecodeTo(SelectionRequestArg, data, destination)
}

func EncodeSelectionResult(result SelectionResult) ([]byte, error) {
	return abi.Arguments{SelectionResultArg}.Pack(result)
}
func DecodeSelectionResult(data []byte, destination *SelectionResult) error {
	return structs.DecodeTo(SelectionResultArg, data, destination)
}

func SelectionResultDigest(result SelectionResult) (common.Hash, error) {
	encoded, err := selectionResultDigestArgs.Pack(SelectionDomain, result.SchemaVersion, result.ChainID, result.Market, result.ExtensionID, result.CodeVersion, result.TenderID, result.RulesHash, result.OrderedBidRoot, result.QuorumBitmap, result.FtsoFeedID, result.FtsoValue, result.FtsoDecimals, result.FtsoTimestamp, result.CloseBlock, result.WinnerBidID, result.Winner, result.WinningAmountXrp, result.ResultNonce, result.Expiry)
	if err != nil {
		return common.Hash{}, fmt.Errorf("encode selection result digest: %w", err)
	}
	return crypto.Keccak256Hash(encoded), nil
}
