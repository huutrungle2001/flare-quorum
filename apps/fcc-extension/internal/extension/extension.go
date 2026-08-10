package extension

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"sync"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/flare-foundation/go-flare-common/pkg/tee/instruction"
	"github.com/flare-foundation/tee-node/pkg/processorutils"
	teetypes "github.com/flare-foundation/tee-node/pkg/types"
	teeutils "github.com/flare-foundation/tee-node/pkg/utils"

	"github.com/huutrungle2001/flare-quorum/apps/fcc-extension/internal/config"
	"github.com/huutrungle2001/flare-quorum/apps/fcc-extension/internal/sealedstore"
	"github.com/huutrungle2001/flare-quorum/apps/fcc-extension/internal/teeclient"
	"github.com/huutrungle2001/flare-quorum/apps/fcc-extension/pkg/protocol"
	"github.com/huutrungle2001/flare-quorum/apps/fcc-extension/pkg/types"
)

const (
	errorActionEnvelope    = "INVALID_ACTION_ENVELOPE"
	errorDecode            = "INVALID_FOUNDATION_REQUEST"
	errorSchema            = "UNSUPPORTED_SCHEMA_VERSION"
	errorChain             = "UNSUPPORTED_CHAIN"
	errorMarket            = "INVALID_MARKET"
	errorNonce             = "INVALID_REQUEST_NONCE"
	errorPayloadHash       = "INVALID_PAYLOAD_HASH"
	errorInternal          = "INTERNAL_ERROR"
	errorBidDecode         = "INVALID_PRIVATE_BID"
	errorBidRejected       = "PRIVATE_BID_REJECTED"
	errorBidConflict       = "PRIVATE_BID_CONFLICT"
	errorTeeUnavailable    = "TEE_CRYPTO_UNAVAILABLE"
	errorSelectionDecode   = "INVALID_SELECTION_REQUEST"
	errorSelectionRejected = "SELECTION_REJECTED"
)

type teeCrypto interface {
	Decrypt(context.Context, []byte) ([]byte, error)
	Sign(context.Context, []byte) ([]byte, error)
	Identity(context.Context) (common.Address, error)
}

type sealedBidStore interface {
	PutOnce(common.Hash, []byte) (bool, error)
	Get(common.Hash) ([]byte, error)
}

type Extension struct {
	mu     sync.RWMutex
	Server *http.Server

	processedActions uint64
	lastBindingHash  common.Hash
	tee              teeCrypto
	sealed           sealedBidStore
	now              func() time.Time
}

func New(extensionPort, signPort int) (*Extension, error) {
	tee, err := teeclient.NewLocal(signPort)
	if err != nil {
		return nil, err
	}
	sealed, err := sealedstore.Open(config.SealedStoreDirectory)
	if err != nil {
		return nil, err
	}
	return newWithDependencies(extensionPort, tee, sealed, time.Now), nil
}

func newWithDependencies(extensionPort int, tee teeCrypto, sealed sealedBidStore, now func() time.Time) *Extension {
	extension := &Extension{tee: tee, sealed: sealed, now: now}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /state", extension.stateHandler)
	mux.HandleFunc("POST /action", extension.actionHandler)
	extension.Server = &http.Server{Addr: fmt.Sprintf(":%d", extensionPort), Handler: mux}
	return extension
}

func (e *Extension) stateHandler(writer http.ResponseWriter, _ *http.Request) {
	e.mu.RLock()
	response := types.StateResponse{
		StateVersion: teeutils.ToHash(config.Version),
		State: types.State{
			ProcessedActions: e.processedActions,
			LastBindingHash:  e.lastBindingHash,
		},
	}
	e.mu.RUnlock()
	writer.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(writer).Encode(response); err != nil {
		http.Error(writer, errorInternal, http.StatusInternalServerError)
	}
}

func (e *Extension) processAction(action teetypes.Action) (int, []byte) {
	if action.Data.Type == teetypes.Direct {
		return e.processDirectAction(action)
	}
	dataFixed, err := processorutils.Parse[instruction.DataFixed](action.Data.Message)
	if err != nil {
		return http.StatusBadRequest, []byte(errorActionEnvelope)
	}

	if dataFixed.OPType != teeutils.ToHash(config.OPTypeVeilBidFoundation) {
		if dataFixed.OPType == teeutils.ToHash(config.OPTypeVeilBidSelection) && dataFixed.OPCommand == teeutils.ToHash(config.OPCommandSelectV1) {
			result := e.processSelection(action, dataFixed)
			body, marshalErr := json.Marshal(result)
			if marshalErr != nil {
				return http.StatusInternalServerError, []byte(errorInternal)
			}
			return http.StatusOK, body
		}
		return http.StatusNotImplemented, []byte("UNSUPPORTED_OPERATION_TYPE")
	}
	if dataFixed.OPCommand != teeutils.ToHash(config.OPCommandPingV1) {
		return http.StatusNotImplemented, []byte("UNSUPPORTED_OPERATION_COMMAND")
	}

	result := e.processFoundationPing(action, dataFixed)
	body, err := json.Marshal(result)
	if err != nil {
		return http.StatusInternalServerError, []byte(errorInternal)
	}
	return http.StatusOK, body
}

func (e *Extension) processSelection(action teetypes.Action, dataFixed *instruction.DataFixed) teetypes.ActionResult {
	if e.tee == nil || e.sealed == nil || e.now == nil {
		return buildResult(action, dataFixed, nil, 0, errorTeeUnavailable)
	}
	var request protocol.SelectionRequest
	if err := protocol.DecodeSelectionRequest(dataFixed.OriginalMessage, &request); err != nil {
		return buildResult(action, dataFixed, nil, 0, errorSelectionDecode)
	}
	now := uint64(e.now().Unix())
	if request.SchemaVersion != protocol.SelectionSchemaVersion || request.ChainID == nil || request.ChainID.Cmp(big.NewInt(config.Coston2ChainID)) != 0 || request.Market == (common.Address{}) || request.ExtensionID == nil || request.ExtensionID.Sign() <= 0 || request.CodeVersion == (common.Hash{}) || request.TenderID == nil || request.TenderID.Sign() <= 0 || request.RulesHash == (common.Hash{}) || request.PublicCeilingXrp == nil || !request.PublicCeilingXrp.IsUint64() || request.PublicCeilingXrp.Sign() <= 0 || request.BidDeadline == 0 || request.OrderedBidRoot == (common.Hash{}) || request.ResultNonce == nil || request.ResultNonce.Sign() <= 0 || request.ResultExpiry < now {
		return buildResult(action, dataFixed, nil, 0, errorSelectionRejected)
	}
	if request.QuorumBitmap != 0x07 || len(request.BidReferences) > 256 {
		return buildResult(action, dataFixed, nil, 0, errorSelectionRejected)
	}
	if _, err := e.tee.Identity(context.Background()); err != nil {
		return buildResult(action, dataFixed, nil, 0, errorTeeUnavailable)
	}

	references := make([]protocol.BidReference, len(request.BidReferences))
	for index, reference := range request.BidReferences {
		if reference.BidID == nil || reference.BidID.Cmp(new(big.Int).SetUint64(uint64(index+1))) != 0 || reference.Vendor == (common.Address{}) || reference.PlaintextCommitment == (common.Hash{}) || reference.SubmissionNonce == nil || reference.SubmissionNonce.Sign() <= 0 || reference.ReceiptBitmap != 0x07 || reference.AcceptedBlock == 0 {
			return buildResult(action, dataFixed, nil, 0, errorSelectionRejected)
		}
		references[index] = protocol.BidReference{BidID: reference.BidID, Vendor: reference.Vendor, PlaintextCommitment: reference.PlaintextCommitment, ReceiptBitmap: reference.ReceiptBitmap, AcceptedBlock: reference.AcceptedBlock}
	}
	root, err := protocol.RebuildBidRoot(request.TenderID, references)
	if err != nil || root != request.OrderedBidRoot {
		return buildResult(action, dataFixed, nil, 0, errorSelectionRejected)
	}

	// A zero-bid tender is a valid, public-safe no-award result. There is no
	// private rules preimage to decrypt in this case; the contract still binds
	// the result to the public request fields and root.
	if len(request.BidReferences) == 0 {
		data, encodeErr := protocol.EncodeSelectionResult(protocol.SelectionResult{SchemaVersion: protocol.SelectionSchemaVersion, ChainID: request.ChainID, Market: request.Market, ExtensionID: request.ExtensionID, CodeVersion: request.CodeVersion, TenderID: request.TenderID, RulesHash: request.RulesHash, OrderedBidRoot: request.OrderedBidRoot, QuorumBitmap: request.QuorumBitmap, FtsoFeedID: request.FtsoFeedID, FtsoValue: request.FtsoValue, FtsoDecimals: request.FtsoDecimals, FtsoTimestamp: request.FtsoTimestamp, CloseBlock: request.CloseBlock, WinnerBidID: new(big.Int), Winner: common.Address{}, WinningAmountXrp: new(big.Int), ResultNonce: request.ResultNonce, Expiry: request.ResultExpiry})
		if encodeErr != nil {
			return buildResult(action, dataFixed, nil, 0, errorInternal)
		}
		return buildResult(action, dataFixed, data, 1, "")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	bids := make([]protocol.PrivateBid, 0, len(request.BidReferences))
	bindings := make([]protocol.CredentialDomainBinding, 0, len(request.BidReferences))
	var rules protocol.ScoringRules
	for index, reference := range request.BidReferences {
		slot, slotErr := protocol.BidSlotFor(request.ChainID, request.Market, request.ExtensionID, request.TenderID, reference.Vendor, reference.SubmissionNonce)
		if slotErr != nil {
			return buildResult(action, dataFixed, nil, 0, errorSelectionRejected)
		}
		ciphertext, getErr := e.sealed.Get(slot)
		if getErr != nil {
			return buildResult(action, dataFixed, nil, 0, errorSelectionRejected)
		}
		plaintext, decryptErr := e.tee.Decrypt(ctx, ciphertext)
		if decryptErr != nil {
			return buildResult(action, dataFixed, nil, 0, errorSelectionRejected)
		}
		var submission protocol.BidSubmission
		if decodeErr := protocol.DecodeBidSubmission(plaintext, &submission); decodeErr != nil {
			return buildResult(action, dataFixed, nil, 0, errorSelectionRejected)
		}
		validated, validateErr := protocol.ValidateStoredSubmission(submission)
		if validateErr != nil || validated.PlaintextCommitment != reference.PlaintextCommitment || submission.Vendor != reference.Vendor || submission.SubmissionNonce.Cmp(reference.SubmissionNonce) != 0 || validated.RulesHash != request.RulesHash || submission.ChainID.Cmp(request.ChainID) != 0 || submission.Market != request.Market || submission.ExtensionID.Cmp(request.ExtensionID) != 0 || submission.CodeVersion != request.CodeVersion || submission.TenderID.Cmp(request.TenderID) != 0 || submission.Rules.CeilingXrpMicros != request.PublicCeilingXrp.Uint64() || submission.Rules.BidDeadline != request.BidDeadline || submission.Rules.FtsoFeedID != request.FtsoFeedID {
			return buildResult(action, dataFixed, nil, 0, errorSelectionRejected)
		}
		if index == 0 {
			rules = submission.Rules
		}
		credentials := make([]protocol.Credential, len(submission.Credentials))
		for credentialIndex, credential := range submission.Credentials {
			credentials[credentialIndex] = protocol.Credential{CredentialType: credential.CredentialType, Issuer: credential.Issuer, ValidUntil: credential.ValidUntil, Nonce: credential.Nonce, Signature: credential.Signature}
		}
		bids = append(bids, protocol.PrivateBid{BidID: reference.BidID, Vendor: submission.Vendor, QuoteCurrency: submission.QuoteCurrency, PriceMicros: submission.PriceMicros, DeliveryDays: submission.DeliveryDays, WarrantyDays: submission.WarrantyDays, Credentials: credentials})
		bindings = append(bindings, protocol.CredentialDomainBinding{ChainID: submission.ChainID, Market: submission.Market, ExtensionID: submission.ExtensionID, CodeVersion: submission.CodeVersion, TenderID: submission.TenderID, RulesHash: validated.RulesHash, Vendor: submission.Vendor})
	}
	winner, found, selectErr := protocol.SelectWinner(rules, bindings, bids, protocol.FtsoSnapshot{Value: request.FtsoValue, Decimals: request.FtsoDecimals}, request.BidDeadline)
	if selectErr != nil {
		return buildResult(action, dataFixed, nil, 0, errorSelectionRejected)
	}
	result := protocol.SelectionResult{SchemaVersion: protocol.SelectionSchemaVersion, ChainID: request.ChainID, Market: request.Market, ExtensionID: request.ExtensionID, CodeVersion: request.CodeVersion, TenderID: request.TenderID, RulesHash: request.RulesHash, OrderedBidRoot: request.OrderedBidRoot, QuorumBitmap: request.QuorumBitmap, FtsoFeedID: request.FtsoFeedID, FtsoValue: request.FtsoValue, FtsoDecimals: request.FtsoDecimals, FtsoTimestamp: request.FtsoTimestamp, CloseBlock: request.CloseBlock, WinnerBidID: new(big.Int), Winner: common.Address{}, WinningAmountXrp: new(big.Int), ResultNonce: request.ResultNonce, Expiry: request.ResultExpiry}
	if found {
		result.WinnerBidID = winner.BidID
		result.Winner = winner.Vendor
		result.WinningAmountXrp = new(big.Int).SetUint64(winner.WinningAmountXrpMicros)
	}
	data, err := protocol.EncodeSelectionResult(result)
	if err != nil {
		return buildResult(action, dataFixed, nil, 0, errorInternal)
	}
	return buildResult(action, dataFixed, data, 1, "")
}

func (e *Extension) processDirectAction(action teetypes.Action) (int, []byte) {
	direct, err := processorutils.Parse[teetypes.DirectInstruction](action.Data.Message)
	if err != nil {
		return http.StatusBadRequest, []byte(errorActionEnvelope)
	}
	if direct.OPType != teeutils.ToHash(config.OPTypeVeilBidBid) || direct.OPCommand != teeutils.ToHash(config.OPCommandSubmitV1) {
		return http.StatusNotImplemented, []byte("UNSUPPORTED_DIRECT_OPERATION")
	}
	dataFixed := &instruction.DataFixed{OPType: direct.OPType, OPCommand: direct.OPCommand}
	result := e.processPrivateBid(action, dataFixed, direct.Message)
	body, err := json.Marshal(result)
	if err != nil {
		return http.StatusInternalServerError, []byte(errorInternal)
	}
	return http.StatusOK, body
}

func (e *Extension) processPrivateBid(action teetypes.Action, dataFixed *instruction.DataFixed, ciphertext []byte) teetypes.ActionResult {
	if e.tee == nil || e.sealed == nil || e.now == nil {
		return buildResult(action, dataFixed, nil, 0, errorTeeUnavailable)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	plaintext, err := e.tee.Decrypt(ctx, ciphertext)
	if err != nil {
		return buildResult(action, dataFixed, nil, 0, errorBidDecode)
	}
	var submission protocol.BidSubmission
	if err := protocol.DecodeBidSubmission(plaintext, &submission); err != nil {
		return buildResult(action, dataFixed, nil, 0, errorBidDecode)
	}
	validated, err := protocol.ValidateSubmission(submission, uint64(e.now().Unix()))
	if err != nil {
		return buildResult(action, dataFixed, nil, 0, errorBidRejected)
	}
	if _, err := e.sealed.PutOnce(validated.SealedSlot, ciphertext); err != nil {
		if errors.Is(err, sealedstore.ErrSlotConflict) {
			return buildResult(action, dataFixed, nil, 0, errorBidConflict)
		}
		return buildResult(action, dataFixed, nil, 0, errorInternal)
	}
	teeID, err := e.tee.Identity(ctx)
	if err != nil {
		return buildResult(action, dataFixed, nil, 0, errorTeeUnavailable)
	}
	receipt := protocol.BidReceipt{
		SchemaVersion: protocol.BidSchemaVersion, ChainID: submission.ChainID, Market: submission.Market,
		ExtensionID: submission.ExtensionID, CodeVersion: submission.CodeVersion, TenderID: submission.TenderID,
		Vendor: submission.Vendor, SubmissionNonce: submission.SubmissionNonce, RulesHash: validated.RulesHash,
		PlaintextCommitment: validated.PlaintextCommitment, TeeID: teeID, Expiry: submission.ReceiptExpiry,
	}
	signingMessage, err := protocol.BidReceiptSigningMessage(receipt)
	if err != nil {
		return buildResult(action, dataFixed, nil, 0, errorInternal)
	}
	receipt.Signature, err = e.tee.Sign(ctx, signingMessage)
	if err != nil {
		return buildResult(action, dataFixed, nil, 0, errorTeeUnavailable)
	}
	data, err := protocol.EncodeBidReceipt(receipt)
	if err != nil {
		return buildResult(action, dataFixed, nil, 0, errorInternal)
	}
	return buildResult(action, dataFixed, data, 1, "")
}

func (e *Extension) processFoundationPing(action teetypes.Action, dataFixed *instruction.DataFixed) teetypes.ActionResult {
	var request types.FoundationRequest
	if err := types.DecodeFoundationRequest(dataFixed.OriginalMessage, &request); err != nil {
		return buildResult(action, dataFixed, nil, 0, errorDecode)
	}
	if request.SchemaVersion != config.FoundationSchemaVersion {
		return buildResult(action, dataFixed, nil, 0, errorSchema)
	}
	if request.ChainID == nil || request.ChainID.Cmp(big.NewInt(config.Coston2ChainID)) != 0 {
		return buildResult(action, dataFixed, nil, 0, errorChain)
	}
	if request.Market == (common.Address{}) {
		return buildResult(action, dataFixed, nil, 0, errorMarket)
	}
	if request.RequestNonce == (common.Hash{}) {
		return buildResult(action, dataFixed, nil, 0, errorNonce)
	}
	if request.PayloadHash == (common.Hash{}) {
		return buildResult(action, dataFixed, nil, 0, errorPayloadHash)
	}

	bindingHash, err := types.FoundationBindingHash(request)
	if err != nil {
		return buildResult(action, dataFixed, nil, 0, errorInternal)
	}
	data, err := types.EncodeFoundationResponse(types.FoundationResponse{
		SchemaVersion: request.SchemaVersion,
		ChainID:       request.ChainID,
		Market:        request.Market,
		RequestNonce:  request.RequestNonce,
		PayloadHash:   request.PayloadHash,
		BindingHash:   bindingHash,
	})
	if err != nil {
		return buildResult(action, dataFixed, nil, 0, errorInternal)
	}

	e.mu.Lock()
	e.processedActions++
	e.lastBindingHash = bindingHash
	e.mu.Unlock()

	return buildResult(action, dataFixed, data, 1, "")
}
