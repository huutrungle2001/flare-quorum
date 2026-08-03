package protocol

import (
	"math/big"
	"testing"

	"github.com/ethereum/go-ethereum/common"
)

func TestOrderedBidRootGoldenVector(t *testing.T) {
	references := []BidReference{
		{
			BidID:               big.NewInt(1),
			Vendor:              common.HexToAddress("0x1000000000000000000000000000000000000001"),
			PlaintextCommitment: common.HexToHash("0x1111"),
			ReceiptBitmap:       0x07,
			AcceptedBlock:       33_500_001,
		},
		{
			BidID:               big.NewInt(2),
			Vendor:              common.HexToAddress("0x2000000000000000000000000000000000000002"),
			PlaintextCommitment: common.HexToHash("0x2222"),
			ReceiptBitmap:       0x07,
			AcceptedBlock:       33_500_009,
		},
	}

	root, err := RebuildBidRoot(big.NewInt(42), references)
	if err != nil {
		t.Fatal(err)
	}
	const expected = "0xed019a9542e15443dda5329d4988cf864e9189e39200755837488fcba327eb13"
	if root.Hex() != expected {
		t.Fatalf("ordered root mismatch: got %s want %s", root.Hex(), expected)
	}
}

func TestOrderedBidRootRejectsGapAndWeakQuorum(t *testing.T) {
	base := BidReference{
		BidID:               big.NewInt(2),
		Vendor:              common.HexToAddress("0x1000000000000000000000000000000000000001"),
		PlaintextCommitment: common.HexToHash("0x1111"),
		ReceiptBitmap:       0x07,
		AcceptedBlock:       1,
	}
	if _, err := RebuildBidRoot(big.NewInt(1), []BidReference{base}); err == nil {
		t.Fatal("accepted a non-canonical first bid ID")
	}
	base.BidID = big.NewInt(1)
	base.ReceiptBitmap = 0x03
	if _, err := RebuildBidRoot(big.NewInt(1), []BidReference{base}); err == nil {
		t.Fatal("accepted a partial receipt bitmap")
	}
}
