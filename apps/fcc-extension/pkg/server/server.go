package server

import extension "github.com/huutrungle2001/veilbid-flare/apps/fcc-extension/internal/extension"

// StartExtension creates and starts the VeilBid extension server in a goroutine.
// Returns an error channel that receives any ListenAndServe failure (e.g., port already in use).
func StartExtension(extensionPort, signPort int) <-chan error {
	e := extension.New(extensionPort, signPort)
	errCh := make(chan error, 1)
	go func() {
		if err := e.Server.ListenAndServe(); err != nil {
			errCh <- err
		}
	}()
	return errCh
}
