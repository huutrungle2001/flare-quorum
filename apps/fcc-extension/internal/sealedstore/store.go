// Package sealedstore persists only ECIES ciphertext encrypted to the local TEE
// identity. It never receives a plaintext bid or a decryption key.
package sealedstore

import (
	"crypto/subtle"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/ethereum/go-ethereum/common"
)

const MaxCiphertextBytes = 256 * 1024

var ErrSlotConflict = errors.New("sealed slot already contains different ciphertext")

type Store struct {
	directory string
}

func Open(directory string) (*Store, error) {
	if directory == "" || !filepath.IsAbs(directory) {
		return nil, errors.New("sealed store directory must be absolute")
	}
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return nil, fmt.Errorf("create sealed store: %w", err)
	}
	if err := os.Chmod(directory, 0o700); err != nil {
		return nil, fmt.Errorf("restrict sealed store: %w", err)
	}
	return &Store{directory: directory}, nil
}

// PutOnce is idempotent for an exact encrypted retry and rejects changing the
// ciphertext assigned to a canonical vendor/tender slot.
func (store *Store) PutOnce(slot common.Hash, ciphertext []byte) (bool, error) {
	if slot == (common.Hash{}) {
		return false, errors.New("sealed slot must be nonzero")
	}
	if len(ciphertext) == 0 || len(ciphertext) > MaxCiphertextBytes {
		return false, errors.New("invalid sealed ciphertext size")
	}
	path := store.path(slot)
	existing, err := os.ReadFile(path)
	if err == nil {
		if len(existing) == len(ciphertext) && subtle.ConstantTimeCompare(existing, ciphertext) == 1 {
			return false, nil
		}
		return false, ErrSlotConflict
	}
	if !errors.Is(err, os.ErrNotExist) {
		return false, fmt.Errorf("read sealed slot: %w", err)
	}

	temporary, err := os.CreateTemp(store.directory, ".pending-*")
	if err != nil {
		return false, fmt.Errorf("create sealed slot: %w", err)
	}
	temporaryPath := temporary.Name()
	committed := false
	defer func() {
		_ = temporary.Close()
		if !committed {
			_ = os.Remove(temporaryPath)
		}
	}()
	if err := temporary.Chmod(0o600); err != nil {
		return false, fmt.Errorf("restrict sealed slot: %w", err)
	}
	if _, err := temporary.Write(ciphertext); err != nil {
		return false, fmt.Errorf("write sealed slot: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		return false, fmt.Errorf("sync sealed slot: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return false, fmt.Errorf("close sealed slot: %w", err)
	}
	if err := os.Link(temporaryPath, path); err != nil {
		if errors.Is(err, os.ErrExist) {
			existing, readErr := os.ReadFile(path)
			if readErr == nil && len(existing) == len(ciphertext) && subtle.ConstantTimeCompare(existing, ciphertext) == 1 {
				return false, nil
			}
			return false, ErrSlotConflict
		}
		return false, fmt.Errorf("commit sealed slot: %w", err)
	}
	committed = true
	_ = os.Remove(temporaryPath)
	return true, nil
}

func (store *Store) Get(slot common.Hash) ([]byte, error) {
	if slot == (common.Hash{}) {
		return nil, errors.New("sealed slot must be nonzero")
	}
	ciphertext, err := os.ReadFile(store.path(slot))
	if err != nil {
		return nil, fmt.Errorf("read sealed slot: %w", err)
	}
	if len(ciphertext) == 0 || len(ciphertext) > MaxCiphertextBytes {
		return nil, errors.New("invalid stored ciphertext size")
	}
	return ciphertext, nil
}

func (store *Store) path(slot common.Hash) string {
	return filepath.Join(store.directory, slot.Hex()[2:]+".ecies")
}
