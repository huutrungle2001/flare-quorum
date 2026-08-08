// Package config contains the public wire constants and server configuration.
package config

import (
	"os"
	"strconv"
	"time"
)

const (
	// Version is the FCC manager wire/code version. The independently pinned
	// application image release is recorded in coston2-foundations.json.
	Version                 = "0.2.2"
	FoundationSchemaVersion = uint16(1)
	Coston2ChainID          = int64(114)

	OPTypeVeilBidFoundation = "VEILBID_FOUNDATION"
	OPCommandPingV1         = "PING_V1"
	OPTypeVeilBidBid        = "VEILBID_BID"
	OPCommandSubmitV1       = "SUBMIT_V1"
	OPTypeVeilBidSelection  = "VEILBID_SELECTION"
	OPCommandSelectV1       = "SELECT_V1"
	FoundationDomain        = "VEILBID_FCC_FOUNDATION_V1"

	TimeoutShutdown = 5 * time.Second
)

var (
	ExtensionPort        = 8080
	SignPort             = 9090
	SealedStoreDirectory = "/var/lib/veilbid/sealed"
)

func init() {
	if value, err := strconv.Atoi(os.Getenv("EXTENSION_PORT")); err == nil {
		ExtensionPort = value
	}
	if value, err := strconv.Atoi(os.Getenv("SIGN_PORT")); err == nil {
		SignPort = value
	}
	if value := os.Getenv("SEALED_STORE_DIR"); value != "" {
		SealedStoreDirectory = value
	}
}
