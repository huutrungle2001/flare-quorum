// Package teeclient is the loopback-only client for tee-node's extension
// sign/decrypt API. Error values never include request or response bodies.
package teeclient

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/ethereum/go-ethereum/accounts"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

const (
	maxCiphertextBytes = 256 * 1024
	maxSigningBytes    = 64 * 1024
	identityProbe      = "VEILBID_TEE_IDENTITY_PROBE_V1"
)

type Client struct {
	baseURL string
	http    *http.Client
}

type decryptRequest struct {
	EncryptedMessage []byte `json:"encryptedMessage"`
}

type decryptResponse struct {
	DecryptedMessage []byte `json:"decryptedMessage"`
}

type signRequest struct {
	Message []byte `json:"message"`
}

type signResponse struct {
	Message   []byte `json:"message"`
	Signature []byte `json:"signature"`
}

func NewLocal(port int) (*Client, error) {
	if port < 1 || port > 65_535 {
		return nil, errors.New("invalid tee sign port")
	}
	return newClient("http://127.0.0.1:"+strconv.Itoa(port), &http.Client{Timeout: 5 * time.Second})
}

func newClient(baseURL string, httpClient *http.Client) (*Client, error) {
	parsed, err := url.Parse(baseURL)
	if err != nil || parsed.Scheme != "http" || parsed.User != nil || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, errors.New("invalid tee loopback URL")
	}
	hostname := parsed.Hostname()
	if ip := net.ParseIP(hostname); ip == nil || !ip.IsLoopback() {
		return nil, errors.New("tee sign API must use a loopback IP")
	}
	if parsed.Port() == "" || httpClient == nil {
		return nil, errors.New("invalid tee loopback client")
	}
	return &Client{baseURL: baseURL, http: httpClient}, nil
}

func (client *Client) Decrypt(ctx context.Context, ciphertext []byte) ([]byte, error) {
	if len(ciphertext) == 0 || len(ciphertext) > maxCiphertextBytes {
		return nil, errors.New("invalid ciphertext size")
	}
	requestBody, err := json.Marshal(decryptRequest{EncryptedMessage: ciphertext})
	if err != nil {
		return nil, errors.New("encode decrypt request")
	}
	var response decryptResponse
	if err := client.post(ctx, "/decrypt", requestBody, maxCiphertextBytes, &response); err != nil {
		return nil, fmt.Errorf("tee decrypt failed: %w", err)
	}
	if len(response.DecryptedMessage) == 0 || len(response.DecryptedMessage) > maxCiphertextBytes {
		return nil, errors.New("tee decrypt returned invalid plaintext size")
	}
	return response.DecryptedMessage, nil
}

func (client *Client) Sign(ctx context.Context, message []byte) ([]byte, error) {
	if len(message) == 0 || len(message) > maxSigningBytes {
		return nil, errors.New("invalid signing message size")
	}
	requestBody, err := json.Marshal(signRequest{Message: message})
	if err != nil {
		return nil, errors.New("encode sign request")
	}
	var response signResponse
	if err := client.post(ctx, "/sign", requestBody, 8*1024, &response); err != nil {
		return nil, fmt.Errorf("tee sign failed: %w", err)
	}
	if !bytes.Equal(response.Message, message) || !canonicalSignature(response.Signature) {
		return nil, errors.New("tee sign returned invalid response")
	}
	return response.Signature, nil
}

func (client *Client) Identity(ctx context.Context) (common.Address, error) {
	message := []byte(identityProbe)
	signature, err := client.Sign(ctx, message)
	if err != nil {
		return common.Address{}, err
	}
	digest := crypto.Keccak256(message)
	publicKey, err := crypto.SigToPub(accounts.TextHash(digest), signature)
	if err != nil {
		return common.Address{}, errors.New("recover tee identity")
	}
	identity := crypto.PubkeyToAddress(*publicKey)
	if identity == (common.Address{}) {
		return common.Address{}, errors.New("zero tee identity")
	}
	return identity, nil
}

func (client *Client) post(ctx context.Context, path string, requestBody []byte, responseLimit int64, destination any) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, client.baseURL+path, bytes.NewReader(requestBody))
	if err != nil {
		return errors.New("build tee request")
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := client.http.Do(request)
	if err != nil {
		return errors.New("tee request unavailable")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4*1024))
		return fmt.Errorf("tee HTTP status %d", response.StatusCode)
	}
	decoder := json.NewDecoder(io.LimitReader(response.Body, responseLimit+1))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return errors.New("decode tee response")
	}
	return nil
}

func canonicalSignature(signature []byte) bool {
	if len(signature) != crypto.SignatureLength {
		return false
	}
	r := new(big.Int).SetBytes(signature[:32])
	s := new(big.Int).SetBytes(signature[32:64])
	return crypto.ValidateSignatureValues(signature[64], r, s, true)
}
