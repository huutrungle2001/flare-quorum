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

	"github.com/huutrungle2001/veilbid-flare/apps/fcc-extension/internal/config"
	"github.com/huutrungle2001/veilbid-flare/apps/fcc-extension/internal/sealedstore"
	"github.com/huutrungle2001/veilbid-flare/apps/fcc-extension/internal/teeclient"
	"github.com/huutrungle2001/veilbid-flare/apps/fcc-extension/pkg/protocol"
	"github.com/huutrungle2001/veilbid-flare/apps/fcc-extension/pkg/types"
)

const (
	errorActionEnvelope = "INVALID_ACTION_ENVELOPE"
	errorDecode         = "INVALID_FOUNDATION_REQUEST"
	errorSchema         = "UNSUPPORTED_SCHEMA_VERSION"
	errorChain          = "UNSUPPORTED_CHAIN"
	errorMarket         = "INVALID_MARKET"
	errorNonce          = "INVALID_REQUEST_NONCE"
	errorPayloadHash    = "INVALID_PAYLOAD_HASH"
	errorInternal       = "INTERNAL_ERROR"
	errorBidDecode      = "INVALID_PRIVATE_BID"
	errorBidRejected    = "PRIVATE_BID_REJECTED"
	errorBidConflict    = "PRIVATE_BID_CONFLICT"
	errorTeeUnavailable = "TEE_CRYPTO_UNAVAILABLE"
)

type teeCrypto interface {
	Decrypt(context.Context, []byte) ([]byte, error)
	Sign(context.Context, []byte) ([]byte, error)
	Identity(context.Context) (common.Address, error)
}

type sealedBidStore interface {
	PutOnce(common.Hash, []byte) (bool, error)
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
