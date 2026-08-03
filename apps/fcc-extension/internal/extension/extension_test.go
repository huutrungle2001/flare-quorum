package extension

import (
	"encoding/json"
	"math/big"
	"net/http"
	"strings"
	"testing"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/flare-foundation/go-flare-common/pkg/tee/instruction"
	teetypes "github.com/flare-foundation/tee-node/pkg/types"
	teeutils "github.com/flare-foundation/tee-node/pkg/utils"

	"github.com/huutrungle2001/veilbid-flare/apps/fcc-extension/internal/config"
	"github.com/huutrungle2001/veilbid-flare/apps/fcc-extension/pkg/types"
)

var (
	testMarket      = common.HexToAddress("0x1000000000000000000000000000000000000001")
	testNonce       = common.HexToHash("0x1234")
	testPayloadHash = common.HexToHash("0xabcd")
)

func buildTestAction(opType, opCommand common.Hash, originalMessage []byte) teetypes.Action {
	type dataFixed struct {
		InstructionID      common.Hash    `json:"instructionId"`
		TeeID              common.Address `json:"teeId"`
		Timestamp          uint64         `json:"timestamp"`
		RewardEpochID      uint32         `json:"rewardEpochId"`
		OPType             common.Hash    `json:"opType"`
		OPCommand          common.Hash    `json:"opCommand"`
		Cosigners          []string       `json:"cosigners"`
		CosignersThreshold uint64         `json:"cosignersThreshold"`
		OriginalMessage    hexutil.Bytes  `json:"originalMessage"`
	}

	message, _ := json.Marshal(dataFixed{
		OPType:          opType,
		OPCommand:       opCommand,
		OriginalMessage: originalMessage,
	})
	return teetypes.Action{Data: teetypes.ActionData{
		ID:            common.HexToHash("0x5678"),
		SubmissionTag: teetypes.Submit,
		Message:       message,
	}}
}

func validRequest() types.FoundationRequest {
	return types.FoundationRequest{
		SchemaVersion: config.FoundationSchemaVersion,
		ChainID:       big.NewInt(config.Coston2ChainID),
		Market:        testMarket,
		RequestNonce:  testNonce,
		PayloadHash:   testPayloadHash,
	}
}

func encodeRequest(t *testing.T, request types.FoundationRequest) []byte {
	t.Helper()
	arguments := abi.Arguments{types.FoundationRequestArg}
	encoded, err := arguments.Pack(request)
	if err != nil {
		t.Fatalf("encode request: %v", err)
	}
	return encoded
}

func runFoundation(t *testing.T, extension *Extension, request types.FoundationRequest) teetypes.ActionResult {
	t.Helper()
	action := buildTestAction(
		teeutils.ToHash(config.OPTypeVeilBidFoundation),
		teeutils.ToHash(config.OPCommandPingV1),
		encodeRequest(t, request),
	)
	status, body := extension.processAction(action)
	if status != http.StatusOK {
		t.Fatalf("expected HTTP 200, got %d: %s", status, body)
	}
	var result teetypes.ActionResult
	if err := json.Unmarshal(body, &result); err != nil {
		t.Fatalf("decode action result: %v", err)
	}
	return result
}

func decodeResponse(t *testing.T, data []byte) types.FoundationResponse {
	t.Helper()
	var response types.FoundationResponse
	if err := types.DecodeFoundationResponse(data, &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return response
}

func TestFoundationPingProducesDeterministicDomainBinding(t *testing.T) {
	request := validRequest()
	first := runFoundation(t, &Extension{}, request)
	second := runFoundation(t, &Extension{}, request)

	if first.Status != 1 || first.Log != resultLogOK {
		t.Fatalf("unexpected first result: status=%d log=%q", first.Status, first.Log)
	}
	if string(first.Data) != string(second.Data) {
		t.Fatal("identical requests on distinct machines must produce identical result data")
	}

	response := decodeResponse(t, first.Data)
	expected, err := types.FoundationBindingHash(request)
	if err != nil {
		t.Fatalf("compute expected binding: %v", err)
	}
	if response.BindingHash != expected {
		t.Fatalf("binding mismatch: got %s want %s", response.BindingHash, expected)
	}
	if response.SchemaVersion != request.SchemaVersion ||
		response.ChainID.Cmp(request.ChainID) != 0 ||
		response.Market != request.Market ||
		response.RequestNonce != request.RequestNonce ||
		response.PayloadHash != request.PayloadHash {
		t.Fatalf("response does not reproduce the request domain: %+v", response)
	}
}

func TestFoundationBindingChangesForEveryDomainField(t *testing.T) {
	base := validRequest()
	baseHash, err := types.FoundationBindingHash(base)
	if err != nil {
		t.Fatal(err)
	}

	mutations := map[string]func(*types.FoundationRequest){
		"schema": func(value *types.FoundationRequest) { value.SchemaVersion++ },
		"chain":  func(value *types.FoundationRequest) { value.ChainID = big.NewInt(115) },
		"market": func(value *types.FoundationRequest) {
			value.Market = common.HexToAddress("0x2000000000000000000000000000000000000002")
		},
		"nonce":   func(value *types.FoundationRequest) { value.RequestNonce = common.HexToHash("0x9999") },
		"payload": func(value *types.FoundationRequest) { value.PayloadHash = common.HexToHash("0x8888") },
	}
	for name, mutate := range mutations {
		t.Run(name, func(t *testing.T) {
			candidate := validRequest()
			mutate(&candidate)
			candidateHash, err := types.FoundationBindingHash(candidate)
			if err != nil {
				t.Fatal(err)
			}
			if candidateHash == baseHash {
				t.Fatalf("%s is not bound", name)
			}
		})
	}
}

func TestFoundationRejectsInvalidPublicDomainWithoutEchoingPayload(t *testing.T) {
	cases := map[string]struct {
		mutate func(*types.FoundationRequest)
		code   string
	}{
		"schema": {func(request *types.FoundationRequest) { request.SchemaVersion = 2 }, errorSchema},
		"chain":  {func(request *types.FoundationRequest) { request.ChainID = big.NewInt(1) }, errorChain},
		"market": {func(request *types.FoundationRequest) { request.Market = common.Address{} }, errorMarket},
		"nonce":  {func(request *types.FoundationRequest) { request.RequestNonce = common.Hash{} }, errorNonce},
		"payload": {func(request *types.FoundationRequest) {
			request.PayloadHash = common.Hash{}
		}, errorPayloadHash},
	}

	for name, testCase := range cases {
		t.Run(name, func(t *testing.T) {
			request := validRequest()
			testCase.mutate(&request)
			result := runFoundation(t, &Extension{}, request)
			if result.Status != 0 || result.Log != "error: "+testCase.code {
				t.Fatalf("unexpected rejection: status=%d log=%q", result.Status, result.Log)
			}
			if len(result.Data) != 0 {
				t.Fatalf("rejected request leaked result data: %x", result.Data)
			}
		})
	}
}

func TestFoundationRejectsMalformedABIWithAllowlistedError(t *testing.T) {
	action := buildTestAction(
		teeutils.ToHash(config.OPTypeVeilBidFoundation),
		teeutils.ToHash(config.OPCommandPingV1),
		[]byte("secret-looking-invalid-payload"),
	)
	status, body := (&Extension{}).processAction(action)
	if status != http.StatusOK {
		t.Fatalf("expected action envelope, got HTTP %d", status)
	}
	var result teetypes.ActionResult
	if err := json.Unmarshal(body, &result); err != nil {
		t.Fatal(err)
	}
	if result.Log != "error: "+errorDecode || strings.Contains(string(body), "secret-looking") {
		t.Fatalf("unsafe error response: %s", body)
	}
}

func TestUnknownOperationAndMalformedEnvelopeFailClosed(t *testing.T) {
	t.Run("operation type", func(t *testing.T) {
		action := buildTestAction(teeutils.ToHash("UNKNOWN"), teeutils.ToHash(config.OPCommandPingV1), nil)
		status, _ := (&Extension{}).processAction(action)
		if status != http.StatusNotImplemented {
			t.Fatalf("got %d", status)
		}
	})
	t.Run("operation command", func(t *testing.T) {
		action := buildTestAction(teeutils.ToHash(config.OPTypeVeilBidFoundation), teeutils.ToHash("UNKNOWN"), nil)
		status, _ := (&Extension{}).processAction(action)
		if status != http.StatusNotImplemented {
			t.Fatalf("got %d", status)
		}
	})
	t.Run("envelope", func(t *testing.T) {
		status, body := (&Extension{}).processAction(teetypes.Action{Data: teetypes.ActionData{
			ID:      common.HexToHash("0x1"),
			Message: []byte("not-json"),
		}})
		if status != http.StatusBadRequest || string(body) != errorActionEnvelope {
			t.Fatalf("status=%d body=%q", status, body)
		}
	})
}

func TestStateContainsOnlyPublicDiagnostics(t *testing.T) {
	extension := &Extension{}
	_ = runFoundation(t, extension, validRequest())
	request := httptestRequest(t)
	recorder := newResponseRecorder()
	extension.stateHandler(recorder, request)

	var response types.StateResponse
	if err := json.Unmarshal(recorder.body, &response); err != nil {
		t.Fatal(err)
	}
	if response.State.ProcessedActions != 1 || response.State.LastBindingHash == (common.Hash{}) {
		t.Fatalf("unexpected state: %+v", response.State)
	}
}

// The tiny wrappers keep this test independent of an external HTTP listener.
type responseRecorder struct {
	header http.Header
	body   []byte
	status int
}

func newResponseRecorder() *responseRecorder    { return &responseRecorder{header: make(http.Header)} }
func (r *responseRecorder) Header() http.Header { return r.header }
func (r *responseRecorder) Write(body []byte) (int, error) {
	r.body = append(r.body, body...)
	return len(body), nil
}
func (r *responseRecorder) WriteHeader(status int) { r.status = status }

func httptestRequest(t *testing.T) *http.Request {
	t.Helper()
	request, err := http.NewRequest(http.MethodGet, "/state", nil)
	if err != nil {
		t.Fatal(err)
	}
	return request
}

var _ = instruction.DataFixed{}
