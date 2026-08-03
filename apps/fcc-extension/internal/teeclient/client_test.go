package teeclient

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/ethereum/go-ethereum/accounts"
	"github.com/ethereum/go-ethereum/crypto"
)

func TestClientDecryptSignAndRecoverIdentity(t *testing.T) {
	key, err := crypto.HexToECDSA(strings.Repeat("22", 32))
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/decrypt":
			var input decryptRequest
			if err := json.NewDecoder(request.Body).Decode(&input); err != nil || len(input.EncryptedMessage) == 0 {
				http.Error(writer, "bad", http.StatusBadRequest)
				return
			}
			_ = json.NewEncoder(writer).Encode(decryptResponse{DecryptedMessage: []byte("private-bid")})
		case "/sign":
			var input signRequest
			if err := json.NewDecoder(request.Body).Decode(&input); err != nil {
				http.Error(writer, "bad", http.StatusBadRequest)
				return
			}
			signature, err := crypto.Sign(accounts.TextHash(crypto.Keccak256(input.Message)), key)
			if err != nil {
				http.Error(writer, "bad", http.StatusInternalServerError)
				return
			}
			_ = json.NewEncoder(writer).Encode(signResponse{Message: input.Message, Signature: signature})
		default:
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()

	client, err := newClient(server.URL, server.Client())
	if err != nil {
		t.Fatal(err)
	}
	plaintext, err := client.Decrypt(context.Background(), []byte{1, 2, 3})
	if err != nil || string(plaintext) != "private-bid" {
		t.Fatalf("decrypt: plaintext=%q err=%v", plaintext, err)
	}
	signature, err := client.Sign(context.Background(), []byte("receipt-preimage"))
	if err != nil || len(signature) != 65 {
		t.Fatalf("sign: length=%d err=%v", len(signature), err)
	}
	identity, err := client.Identity(context.Background())
	if err != nil || identity != crypto.PubkeyToAddress(key.PublicKey) {
		t.Fatalf("identity=%s err=%v", identity, err)
	}
}

func TestClientRejectsNonLoopbackAndRedactsBodies(t *testing.T) {
	if _, err := newClient("https://example.com:443", http.DefaultClient); err == nil {
		t.Fatal("accepted non-loopback TEE API")
	}
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		http.Error(writer, "private-bid-must-not-escape", http.StatusBadRequest)
	}))
	defer server.Close()
	client, err := newClient(server.URL, server.Client())
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.Decrypt(context.Background(), []byte{1})
	if err == nil || strings.Contains(err.Error(), "private-bid") {
		t.Fatalf("unsafe error: %v", err)
	}
}

func TestClientRejectsMutatedSignResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(writer).Encode(signResponse{Message: []byte("other"), Signature: make([]byte, 65)})
	}))
	defer server.Close()
	client, err := newClient(server.URL, server.Client())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.Sign(context.Background(), []byte("receipt")); err == nil {
		t.Fatal("accepted mutated sign response")
	}
}
