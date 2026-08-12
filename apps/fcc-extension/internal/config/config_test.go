package config

import (
	"strings"
	"testing"
)

func TestCustomOperationTypesDoNotUseReservedPrefix(t *testing.T) {
	for _, operationType := range []string{
		OPTypeFlareQuorumFoundation,
		OPTypeFlareQuorumBid,
		OPTypeFlareQuorumSelection,
	} {
		if strings.HasPrefix(operationType, "F_") {
			t.Fatalf("custom operation type %q uses reserved F_ prefix", operationType)
		}
	}
}
