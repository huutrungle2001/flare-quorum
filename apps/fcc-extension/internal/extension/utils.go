package extension

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/flare-foundation/go-flare-common/pkg/logger"
	"github.com/flare-foundation/go-flare-common/pkg/tee/instruction"
	teetypes "github.com/flare-foundation/tee-node/pkg/types"

	"github.com/huutrungle2001/veilbid-flare/apps/fcc-extension/internal/config"
)

const resultLogOK = "ok"

func (e *Extension) actionHandler(writer http.ResponseWriter, request *http.Request) {
	var action teetypes.Action
	decoder := json.NewDecoder(http.MaxBytesReader(writer, request.Body, 1<<20))
	if err := decoder.Decode(&action); err != nil {
		http.Error(writer, errorActionEnvelope, http.StatusBadRequest)
		return
	}

	logger.Infof("received action, ID: %s", action.Data.ID)
	status, body := e.processAction(action)
	logger.Infof("sending action result, ID: %s, HTTP status: %d", action.Data.ID, status)

	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_, _ = writer.Write(body)
}

func buildResult(
	action teetypes.Action,
	dataFixed *instruction.DataFixed,
	data []byte,
	status uint8,
	errorCode string,
) teetypes.ActionResult {
	result := teetypes.ActionResult{
		ID:            action.Data.ID,
		SubmissionTag: action.Data.SubmissionTag,
		Version:       config.Version,
		OPType:        dataFixed.OPType,
		OPCommand:     dataFixed.OPCommand,
		Data:          data,
		Status:        status,
	}
	if status == 1 {
		result.Log = resultLogOK
	} else {
		result.Log = fmt.Sprintf("error: %s", errorCode)
	}
	return result
}
