// Package config contains the public wire constants and server configuration.
package config

import (
	"os"
	"strconv"
	"time"
)

const (
	Version                 = "0.1.0"
	FoundationSchemaVersion = uint16(1)
	Coston2ChainID          = int64(114)

	OPTypeVeilBidFoundation = "VEILBID_FOUNDATION"
	OPCommandPingV1         = "PING_V1"
	FoundationDomain        = "VEILBID_FCC_FOUNDATION_V1"

	TimeoutShutdown = 5 * time.Second
)

var (
	ExtensionPort = 8080
	SignPort      = 9090
)

func init() {
	if value, err := strconv.Atoi(os.Getenv("EXTENSION_PORT")); err == nil {
		ExtensionPort = value
	}
	if value, err := strconv.Atoi(os.Getenv("SIGN_PORT")); err == nil {
		SignPort = value
	}
}
