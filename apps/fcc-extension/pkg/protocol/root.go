// Package protocol contains the canonical VeilBid wire and scoring model shared
// with the Flare market contract and generated TypeScript bindings.
package protocol

import (
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

var (
	EmptyBidRoot  = crypto.Keccak256Hash([]byte("VEILBID_EMPTY_BID_ROOT_V1"))
	BidRootDomain = crypto.Keccak256Hash([]byte("VEILBID_BID_ROOT_V1"))

	orderedBidRootArguments = abi.Arguments{
		{Type: mustRootABIType("bytes32")},
		{Type: mustRootABIType("bytes32")},
		{Type: mustRootABIType("uint256")},
		{Type: mustRootABIType("uint256")},
		{Type: mustRootABIType("address")},
		{Type: mustRootABIType("bytes32")},
		{Type: mustRootABIType("uint8")},
		{Type: mustRootABIType("uint64")},
	}
)

// BidReference is the public-safe checkpoint needed to reconstruct the exact
// on-chain order. It intentionally contains neither bid fields nor ciphertext.
type BidReference struct {
	BidID               *big.Int
	Vendor              common.Address
	PlaintextCommitment common.Hash
	ReceiptBitmap       uint8
	AcceptedBlock       uint64
}

// AppendBidRoot applies ADR-008 exactly as VeilBidFlareMarket does.
func AppendBidRoot(previous common.Hash, tenderID *big.Int, reference BidReference) (common.Hash, error) {
	if tenderID == nil || tenderID.Sign() <= 0 || reference.BidID == nil || reference.BidID.Sign() <= 0 {
		return common.Hash{}, fmt.Errorf("tender and bid IDs must be positive")
	}
	if reference.Vendor == (common.Address{}) || reference.PlaintextCommitment == (common.Hash{}) {
		return common.Hash{}, fmt.Errorf("vendor and commitment must be nonzero")
	}
	if reference.ReceiptBitmap&0x07 != reference.ReceiptBitmap || bitCount(reference.ReceiptBitmap) < 2 {
		return common.Hash{}, fmt.Errorf("receipt bitmap must contain at least two of three machines")
	}
	if reference.AcceptedBlock == 0 {
		return common.Hash{}, fmt.Errorf("accepted block must be nonzero")
	}

	encoded, err := orderedBidRootArguments.Pack(
		BidRootDomain,
		previous,
		tenderID,
		reference.BidID,
		reference.Vendor,
		reference.PlaintextCommitment,
		reference.ReceiptBitmap,
		reference.AcceptedBlock,
	)
	if err != nil {
		return common.Hash{}, fmt.Errorf("encode ordered bid root: %w", err)
	}
	return crypto.Keccak256Hash(encoded), nil
}

// RebuildBidRoot rejects gaps and reordered references before returning the
// rolling root. The first accepted bid is always ID 1.
func RebuildBidRoot(tenderID *big.Int, references []BidReference) (common.Hash, error) {
	root := EmptyBidRoot
	for index, reference := range references {
		expectedID := new(big.Int).SetUint64(uint64(index + 1))
		if reference.BidID == nil || reference.BidID.Cmp(expectedID) != 0 {
			return common.Hash{}, fmt.Errorf("non-canonical bid ID at index %d", index)
		}
		var err error
		root, err = AppendBidRoot(root, tenderID, reference)
		if err != nil {
			return common.Hash{}, err
		}
	}
	return root, nil
}

func bitCount(bitmap uint8) uint8 {
	var count uint8
	for index := uint8(0); index < 3; index++ {
		if bitmap&(1<<index) != 0 {
			count++
		}
	}
	return count
}

func mustRootABIType(name string) abi.Type {
	value, err := abi.NewType(name, "", nil)
	if err != nil {
		panic(err)
	}
	return value
}
