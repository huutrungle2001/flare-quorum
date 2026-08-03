package sealedstore

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/ethereum/go-ethereum/common"
)

func TestStoreSurvivesRestartAndAcceptsExactRetry(t *testing.T) {
	directory := filepath.Join(t.TempDir(), "sealed")
	slot := common.HexToHash("0x1234")
	ciphertext := []byte{4, 8, 15, 16, 23, 42}

	first, err := Open(directory)
	if err != nil {
		t.Fatal(err)
	}
	created, err := first.PutOnce(slot, ciphertext)
	if err != nil || !created {
		t.Fatalf("first write: created=%v err=%v", created, err)
	}
	created, err = first.PutOnce(slot, ciphertext)
	if err != nil || created {
		t.Fatalf("exact retry: created=%v err=%v", created, err)
	}

	restarted, err := Open(directory)
	if err != nil {
		t.Fatal(err)
	}
	restored, err := restarted.Get(slot)
	if err != nil || string(restored) != string(ciphertext) {
		t.Fatalf("restart restore: value=%x err=%v", restored, err)
	}
}

func TestStoreRejectsSlotRewrite(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "sealed"))
	if err != nil {
		t.Fatal(err)
	}
	slot := common.HexToHash("0x1234")
	if _, err := store.PutOnce(slot, []byte{1}); err != nil {
		t.Fatal(err)
	}
	if _, err := store.PutOnce(slot, []byte{2}); !errors.Is(err, ErrSlotConflict) {
		t.Fatalf("rewrite error = %v", err)
	}
}

func TestStoreUsesPrivateFilesystemModesAndOpaqueName(t *testing.T) {
	directory := filepath.Join(t.TempDir(), "sealed")
	store, err := Open(directory)
	if err != nil {
		t.Fatal(err)
	}
	slot := common.HexToHash("0x1234")
	if _, err := store.PutOnce(slot, []byte{1, 2, 3}); err != nil {
		t.Fatal(err)
	}
	directoryInfo, err := os.Stat(directory)
	if err != nil {
		t.Fatal(err)
	}
	fileInfo, err := os.Stat(filepath.Join(directory, slot.Hex()[2:]+".ecies"))
	if err != nil {
		t.Fatal(err)
	}
	if directoryInfo.Mode().Perm() != 0o700 || fileInfo.Mode().Perm() != 0o600 {
		t.Fatalf("unsafe modes: directory=%o file=%o", directoryInfo.Mode().Perm(), fileInfo.Mode().Perm())
	}
}

func TestStoreRejectsUnsafeInputs(t *testing.T) {
	if _, err := Open("relative/path"); err == nil {
		t.Fatal("accepted relative sealed directory")
	}
	store, err := Open(filepath.Join(t.TempDir(), "sealed"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.PutOnce(common.Hash{}, []byte{1}); err == nil {
		t.Fatal("accepted zero slot")
	}
	if _, err := store.PutOnce(common.HexToHash("0x1"), nil); err == nil {
		t.Fatal("accepted empty ciphertext")
	}
}
