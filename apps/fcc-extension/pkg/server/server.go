package server

import extension "github.com/huutrungle2001/flare-quorum/apps/fcc-extension/internal/extension"

// StartExtension creates and starts the VeilBid extension server in a goroutine.
// Returns an error channel that receives any ListenAndServe failure (e.g., port already in use).
func StartExtension(extensionPort, signPort int) <-chan error {
	errCh := make(chan error, 1)
	e, err := extension.New(extensionPort, signPort)
	if err != nil {
		errCh <- err
		return errCh
	}
	go func() {
		if err := e.Server.ListenAndServe(); err != nil {
			errCh <- err
		}
	}()
	return errCh
}
