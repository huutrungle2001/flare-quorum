// Package types defines VeilBid's public FCC foundation wire format.
package types

import (
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/flare-foundation/go-flare-common/pkg/tee/structs"
	teeutils "github.com/flare-foundation/tee-node/pkg/utils"

	"github.com/huutrungle2001/flare-quorum/apps/fcc-extension/internal/config"
)

type FoundationRequest struct {
	SchemaVersion uint16         `json:"schemaVersion" abi:"schemaVersion"`
	ChainID       *big.Int       `json:"chainId" abi:"chainId"`
	Market        common.Address `json:"market" abi:"market"`
	RequestNonce  common.Hash    `json:"requestNonce" abi:"requestNonce"`
	PayloadHash   common.Hash    `json:"payloadHash" abi:"payloadHash"`
}

type FoundationResponse struct {
	SchemaVersion uint16         `json:"schemaVersion" abi:"schemaVersion"`
	ChainID       *big.Int       `json:"chainId" abi:"chainId"`
	Market        common.Address `json:"market" abi:"market"`
	RequestNonce  common.Hash    `json:"requestNonce" abi:"requestNonce"`
	PayloadHash   common.Hash    `json:"payloadHash" abi:"payloadHash"`
	BindingHash   common.Hash    `json:"bindingHash" abi:"bindingHash"`
}

type State struct {
	ProcessedActions uint64      `json:"processedActions"`
	LastBindingHash  common.Hash `json:"lastBindingHash"`
}

type StateResponse struct {
	StateVersion common.Hash `json:"stateVersion"`
	State        State       `json:"state"`
}

var (
	FoundationRequestArg  abi.Argument
	FoundationResponseArg abi.Argument
	foundationBindingArgs abi.Arguments
)

func init() {
	requestType := mustTuple([]abi.ArgumentMarshaling{
		{Name: "schemaVersion", Type: "uint16"},
		{Name: "chainId", Type: "uint256"},
		{Name: "market", Type: "address"},
		{Name: "requestNonce", Type: "bytes32"},
		{Name: "payloadHash", Type: "bytes32"},
	})
	responseType := mustTuple([]abi.ArgumentMarshaling{
		{Name: "schemaVersion", Type: "uint16"},
		{Name: "chainId", Type: "uint256"},
		{Name: "market", Type: "address"},
		{Name: "requestNonce", Type: "bytes32"},
		{Name: "payloadHash", Type: "bytes32"},
		{Name: "bindingHash", Type: "bytes32"},
	})
	FoundationRequestArg = abi.Argument{Type: requestType}
	FoundationResponseArg = abi.Argument{Type: responseType}

	foundationBindingArgs = abi.Arguments{
		{Type: mustABIType("bytes32")},
		{Type: mustABIType("bytes32")},
		{Type: mustABIType("bytes32")},
		{Type: mustABIType("uint16")},
		{Type: mustABIType("uint256")},
		{Type: mustABIType("address")},
		{Type: mustABIType("bytes32")},
		{Type: mustABIType("bytes32")},
	}
}

func DecodeFoundationRequest(data []byte, destination *FoundationRequest) error {
	return structs.DecodeTo(FoundationRequestArg, data, destination)
}

func EncodeFoundationResponse(response FoundationResponse) ([]byte, error) {
	return abi.Arguments{FoundationResponseArg}.Pack(response)
}

func DecodeFoundationResponse(data []byte, destination *FoundationResponse) error {
	return structs.DecodeTo(FoundationResponseArg, data, destination)
}

func FoundationBindingHash(request FoundationRequest) (common.Hash, error) {
	encoded, err := foundationBindingArgs.Pack(
		crypto.Keccak256Hash([]byte(config.FoundationDomain)),
		teeutils.ToHash(config.OPTypeVeilBidFoundation),
		teeutils.ToHash(config.OPCommandPingV1),
		request.SchemaVersion,
		request.ChainID,
		request.Market,
		request.RequestNonce,
		request.PayloadHash,
	)
	if err != nil {
		return common.Hash{}, fmt.Errorf("encode foundation binding: %w", err)
	}
	return crypto.Keccak256Hash(encoded), nil
}

func mustTuple(components []abi.ArgumentMarshaling) abi.Type {
	value, err := abi.NewType("tuple", "", components)
	if err != nil {
		panic(err)
	}
	return value
}

func mustABIType(name string) abi.Type {
	value, err := abi.NewType(name, "", nil)
	if err != nil {
		panic(err)
	}
	return value
}
