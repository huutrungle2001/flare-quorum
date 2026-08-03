package extension

import (
	"context"
	"crypto/ecdsa"
	"encoding/json"
	"math/big"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/accounts"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/crypto"
	teetypes "github.com/flare-foundation/tee-node/pkg/types"
	teeutils "github.com/flare-foundation/tee-node/pkg/utils"

	"github.com/huutrungle2001/veilbid-flare/apps/fcc-extension/internal/config"
	"github.com/huutrungle2001/veilbid-flare/apps/fcc-extension/internal/sealedstore"
	"github.com/huutrungle2001/veilbid-flare/apps/fcc-extension/pkg/protocol"
)

type bidTeeFake struct {
	plaintext []byte
	key       *ecdsa.PrivateKey
}

func (fake *bidTeeFake) Decrypt(context.Context, []byte) ([]byte, error) {
	return append([]byte(nil), fake.plaintext...), nil
}

func (fake *bidTeeFake) Sign(_ context.Context, message []byte) ([]byte, error) {
	return crypto.Sign(accounts.TextHash(crypto.Keccak256(message)), fake.key)
}

func (fake *bidTeeFake) Identity(context.Context) (common.Address, error) {
	return crypto.PubkeyToAddress(fake.key.PublicKey), nil
}

func TestPrivateBidDirectActionReturnsContractVerifiableReceiptAndSealsCiphertext(t *testing.T) {
	submission := extensionBidFixture()
	plaintext, err := protocol.EncodeBidSubmission(submission)
	if err != nil {
		t.Fatal(err)
	}
	key, err := crypto.HexToECDSA(strings.Repeat("44", 32))
	if err != nil {
		t.Fatal(err)
	}
	store, err := sealedstore.Open(filepath.Join(t.TempDir(), "sealed"))
	if err != nil {
		t.Fatal(err)
	}
	extension := newWithDependencies(0, &bidTeeFake{plaintext: plaintext, key: key}, store, func() time.Time {
		return time.Unix(100, 0)
	})
	ciphertext := []byte{9, 8, 7, 6}
	action := directBidAction(t, ciphertext)
	status, body := extension.processAction(action)
	if status != 200 {
		t.Fatalf("HTTP status=%d body=%s", status, body)
	}
	var result teetypes.ActionResult
	if err := json.Unmarshal(body, &result); err != nil {
		t.Fatal(err)
	}
	if result.Status != 1 {
		t.Fatalf("bid rejected: %s", result.Log)
	}
	var receipt protocol.BidReceipt
	if err := protocol.DecodeBidReceipt(result.Data, &receipt); err != nil {
		t.Fatal(err)
	}
	digest, err := protocol.BidReceiptDigest(receipt)
	if err != nil {
		t.Fatal(err)
	}
	publicKey, err := crypto.SigToPub(accounts.TextHash(digest[:]), receipt.Signature)
	if err != nil || crypto.PubkeyToAddress(*publicKey) != receipt.TeeID {
		t.Fatalf("receipt signature is not bound to TEE: %v", err)
	}
	validated, err := protocol.ValidateSubmission(submission, 100)
	if err != nil {
		t.Fatal(err)
	}
	stored, err := store.Get(validated.SealedSlot)
	if err != nil || string(stored) != string(ciphertext) {
		t.Fatalf("ciphertext not sealed: stored=%x err=%v", stored, err)
	}
}

func directBidAction(t *testing.T, ciphertext []byte) teetypes.Action {
	t.Helper()
	direct, err := json.Marshal(teetypes.DirectInstruction{
		OPType: teeutils.ToHash(config.OPTypeVeilBidBid), OPCommand: teeutils.ToHash(config.OPCommandSubmitV1), Message: hexutil.Bytes(ciphertext),
	})
	if err != nil {
		t.Fatal(err)
	}
	return teetypes.Action{Data: teetypes.ActionData{ID: common.HexToHash("0x1"), Type: teetypes.Direct, SubmissionTag: teetypes.Submit, Message: direct}}
}

func extensionBidFixture() protocol.BidSubmission {
	return protocol.BidSubmission{
		SchemaVersion: 1, ChainID: big.NewInt(114), Market: common.HexToAddress("0x1000000000000000000000000000000000000001"),
		ExtensionID: big.NewInt(0x10001), CodeVersion: common.HexToHash("0x1111"), TenderID: big.NewInt(42),
		Vendor: common.HexToAddress("0x2000000000000000000000000000000000000002"), SubmissionNonce: big.NewInt(1),
		Rules: protocol.ScoringRules{
			SchemaVersion: 1, CeilingXrpMicros: 1_000_000, BidDeadline: 1_000, AllowXRP: true,
			MaxDeliveryDays: 10, MinWarrantyDays: 12, MaxWarrantyDays: 36,
			PriceWeightBPS: 6_000, DeliveryWeightBPS: 2_500, WarrantyWeightBPS: 1_500,
		},
		ReceiptExpiry: 900, QuoteCurrency: protocol.QuoteXRP, PriceMicros: 400_000,
		DeliveryDays: 5, WarrantyDays: 24, Salt: common.HexToHash("0x7777"),
	}
}
