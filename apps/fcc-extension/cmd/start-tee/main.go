// Command start-tee runs the tee-node and the Go extension as a single host
// process, without Docker. It backs `./scripts/start-services.sh --local`.
//
// This lives in the extension module (not tools/) because it links the Go
// extension in-process — it is a Go-path development convenience, not
// deployment tooling. tools/ must stay independent of any one language
// implementation so that it can deploy and test all of them; see
// docs/extension-contract.md.
//
// Consequently `--local` mode is Go-only. start-services.sh rejects it for
// other languages and points at Docker Compose instead.
package main

import (
	"bytes"
	"crypto/ecdsa"
	"encoding/json"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	extserver "github.com/huutrungle2001/veilbid-flare/apps/fcc-extension/pkg/server"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/flare-foundation/go-flare-common/pkg/logger"
	teeServer "github.com/flare-foundation/tee-node/pkg/server"
	teetypes "github.com/flare-foundation/tee-node/pkg/types"
)

// Port constants matching the extension-e2e configs.
const (
	ExtConfigurationPort = 5501 // TEE configuration port (proxyURL, initialOwner, extensionID)
	ExtProxyInternalPort = 6663 // Internal port: TEE polls actions from proxy queue
	ExtensionServerPort  = 7701 // TEE signing port: extension calls TEE for signing/encrypting
	ExtensionPort        = 7702 // Extension server port: TEE forwards POST /action here
)

func main() {
	extensionID := flag.String("extensionID", "", "extension ID (bytes32 hex)")
	flag.Parse()

	signalChan := make(chan os.Signal, 1)
	signal.Notify(signalChan, os.Interrupt, syscall.SIGTERM)

	if _, err := setOwnerAddress(); err != nil {
		logger.Fatalf("owner configuration failed: %v", err)
	}

	if *extensionID != "" {
		os.Setenv("EXTENSION_ID", *extensionID)
	}

	runExtension()

	sig := <-signalChan
	logger.Infof("Received %v signal, shutting down", sig)
}

func runExtension() {
	// Start tee-node in extension mode.
	go teeServer.StartServerExtension(ExtConfigurationPort, ExtensionServerPort, ExtensionPort)

	// Start extension server — fail fast if port binding fails.
	extErrCh := extserver.StartExtension(ExtensionPort, ExtensionServerPort)

	// Give server a moment to bind, then check for early failures.
	time.Sleep(100 * time.Millisecond)
	select {
	case err := <-extErrCh:
		logger.Fatalf("extension server failed to start: %v", err)
	default:
	}

	logger.Infof("Starting extension TEE on port %d", ExtConfigurationPort)

	time.Sleep(150 * time.Millisecond)

	err := setProxyURL(ExtConfigurationPort, ExtProxyInternalPort)
	if err != nil {
		logger.Fatalf("Error: %v", err)
	}
}

// setProxyURL points the freshly started node at the local extension proxy.
// Inlined from tools/pkg/fccutils so this command carries no dependency on the
// tools module.
func setProxyURL(configurationPort, proxyPort int) error {
	url := fmt.Sprintf("http://localhost:%d", proxyPort)
	request := teetypes.ConfigureProxyURLRequest{URL: &url}

	body, err := json.Marshal(request)
	if err != nil {
		return err
	}

	url = fmt.Sprintf("http://localhost:%d/proxy", configurationPort)
	logger.Infof("Setting proxy url on tee: %s", url)
	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	return nil
}

func setOwnerAddress() (common.Address, error) {
	owner := os.Getenv("INITIAL_OWNER")
	if owner != "" {
		if !common.IsHexAddress(owner) {
			return common.Address{}, fmt.Errorf("INITIAL_OWNER is not a valid address")
		}
		return common.HexToAddress(owner), nil
	}

	privateKeyString := os.Getenv("FLARE_DEPLOYMENT_PRIVATE_KEY")
	if privateKeyString == "" {
		return common.Address{}, fmt.Errorf("INITIAL_OWNER or FLARE_DEPLOYMENT_PRIVATE_KEY is required")
	}
	if strings.HasPrefix(privateKeyString, "0x") || strings.HasPrefix(privateKeyString, "0X") {
		privateKeyString = privateKeyString[2:]
	}
	var privateKey *ecdsa.PrivateKey
	privateKey, err := crypto.HexToECDSA(privateKeyString)
	if err != nil {
		return common.Address{}, fmt.Errorf("FLARE_DEPLOYMENT_PRIVATE_KEY is invalid")
	}

	ownerAddress := crypto.PubkeyToAddress(privateKey.PublicKey)
	if err := os.Setenv("INITIAL_OWNER", ownerAddress.String()); err != nil {
		return common.Address{}, fmt.Errorf("set INITIAL_OWNER: %w", err)
	}
	return ownerAddress, nil
}
