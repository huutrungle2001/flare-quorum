package extension

import (
	"crypto/ecdsa"
	"math/big"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/flare-foundation/go-flare-common/pkg/tee/instruction"
	teetypes "github.com/flare-foundation/tee-node/pkg/types"
	teeutils "github.com/flare-foundation/tee-node/pkg/utils"

	"github.com/huutrungle2001/flare-quorum/apps/fcc-extension/internal/config"
	"github.com/huutrungle2001/flare-quorum/apps/fcc-extension/internal/sealedstore"
	"github.com/huutrungle2001/flare-quorum/apps/fcc-extension/pkg/protocol"
)

func TestSelectionInstructionDecryptsSealedBidAndReturnsOnlyWinner(t *testing.T) {
	submission := extensionBidFixture()
	plaintext, err := protocol.EncodeBidSubmission(submission)
	if err != nil {
		t.Fatal(err)
	}
	commitment, err := protocol.BidCommitment(submission)
	if err != nil {
		t.Fatal(err)
	}
	rulesHash, err := protocol.RulesHash(submission.Rules)
	if err != nil {
		t.Fatal(err)
	}
	store, err := sealedstore.Open(filepath.Join(t.TempDir(), "sealed"))
	if err != nil {
		t.Fatal(err)
	}
	slot, err := protocol.BidSlotFor(submission.ChainID, submission.Market, submission.ExtensionID, submission.TenderID, submission.Vendor, submission.SubmissionNonce)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.PutOnce(slot, []byte{9, 8, 7}); err != nil {
		t.Fatal(err)
	}
	key := testTEEKey(t)
	extension := newWithDependencies(0, &bidTeeFake{plaintext: plaintext, key: key}, store, func() time.Time { return time.Unix(100, 0) })
	ref := protocol.SelectionBidReference{BidID: big.NewInt(1), Vendor: submission.Vendor, SubmissionNonce: submission.SubmissionNonce, PlaintextCommitment: commitment, ReceiptBitmap: 7, AcceptedBlock: 33_500_001}
	root, err := protocol.RebuildBidRoot(submission.TenderID, []protocol.BidReference{{BidID: ref.BidID, Vendor: ref.Vendor, PlaintextCommitment: ref.PlaintextCommitment, ReceiptBitmap: ref.ReceiptBitmap, AcceptedBlock: ref.AcceptedBlock}})
	if err != nil {
		t.Fatal(err)
	}
	request := protocol.SelectionRequest{SchemaVersion: protocol.SelectionSchemaVersion, ChainID: submission.ChainID, Market: submission.Market, ExtensionID: submission.ExtensionID, CodeVersion: submission.CodeVersion, TenderID: submission.TenderID, RulesHash: rulesHash, PublicCeilingXrp: new(big.Int).SetUint64(submission.Rules.CeilingXrpMicros), BidDeadline: submission.Rules.BidDeadline, OrderedBidRoot: root, QuorumBitmap: 7, FtsoValue: new(big.Int), ResultNonce: big.NewInt(1), ResultExpiry: 1_000, BidReferences: []protocol.SelectionBidReference{ref}}
	requestBytes, err := protocol.EncodeSelectionRequest(request)
	if err != nil {
		t.Fatal(err)
	}
	dataFixed := &instruction.DataFixed{OPType: teeutils.ToHash(config.OPTypeVeilBidSelection), OPCommand: teeutils.ToHash(config.OPCommandSelectV1), OriginalMessage: requestBytes}
	result := extension.processSelection(teetypes.Action{Data: teetypes.ActionData{ID: common.HexToHash("0x55"), SubmissionTag: teetypes.Threshold}}, dataFixed)
	if result.Status != 1 {
		t.Fatalf("selection rejected: %s", result.Log)
	}
	var decoded protocol.SelectionResult
	if err := protocol.DecodeSelectionResult(result.Data, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.WinnerBidID.Cmp(big.NewInt(1)) != 0 || decoded.Winner != submission.Vendor || decoded.WinningAmountXrp.Cmp(big.NewInt(400_000)) != 0 {
		t.Fatalf("unexpected winner: id=%s vendor=%s amount=%s", decoded.WinnerBidID, decoded.Winner, decoded.WinningAmountXrp)
	}
	if len(result.Data) == 0 || decoded.RulesHash != rulesHash {
		t.Fatal("selection result omitted required public binding")
	}

	request.BidReferences[0].SubmissionNonce = big.NewInt(8)
	wrongNonceBytes, err := protocol.EncodeSelectionRequest(request)
	if err != nil {
		t.Fatal(err)
	}
	dataFixed.OriginalMessage = wrongNonceBytes
	wrongNonceResult := extension.processSelection(teetypes.Action{Data: teetypes.ActionData{ID: common.HexToHash("0x56"), SubmissionTag: teetypes.Threshold}}, dataFixed)
	if wrongNonceResult.Status != 0 || !strings.Contains(wrongNonceResult.Log, errorSelectionRejected) {
		t.Fatalf("selection opened a slot for an unaccepted nonce: status=%d log=%s", wrongNonceResult.Status, wrongNonceResult.Log)
	}
}

func testTEEKey(t *testing.T) *ecdsa.PrivateKey {
	t.Helper()
	key, err := crypto.HexToECDSA(strings.Repeat("44", 32))
	if err != nil {
		t.Fatal(err)
	}
	return key
}
