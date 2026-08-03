package extension

import (
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"sync"

	"github.com/ethereum/go-ethereum/common"
	"github.com/flare-foundation/go-flare-common/pkg/tee/instruction"
	"github.com/flare-foundation/tee-node/pkg/processorutils"
	teetypes "github.com/flare-foundation/tee-node/pkg/types"
	teeutils "github.com/flare-foundation/tee-node/pkg/utils"

	"github.com/huutrungle2001/veilbid-flare/apps/fcc-extension/internal/config"
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
)

type Extension struct {
	mu     sync.RWMutex
	Server *http.Server

	processedActions uint64
	lastBindingHash  common.Hash
}

func New(extensionPort, _ int) *Extension {
	extension := &Extension{}
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
