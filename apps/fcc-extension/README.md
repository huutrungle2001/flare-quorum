# VeilBid FCC extension

This Go module is the confidential-compute component of the Flare release. It
was bootstrapped from Flare's official `fce-extension-scaffold` at commit
`f48cafb889441a62e47c083f4be8dd7d3f456f83`, then upgraded to `tee-node`
`v0.0.24` because the scaffold's older runtime is below the organizer baseline.

The current foundation operation is deliberately public-safe. `PING_V1`
proves deterministic ABI decoding and binds the operation type, command,
Coston2 chain ID, market address, one-time request nonce, and an opaque payload
hash. It never accepts or returns a bid.

The local `pkg/protocol` feasibility model now locks the Solidity-compatible
ordered-root and bid-receipt vectors, canonical ABI encoding for
`BID_SCHEMA_V1`/`BID_RECEIPT_V1`, and checked `SCORING_V1` eligibility, issuer
credentials, XRP/USD conversion, penalties, and tie-breaking. That model is
connected locally to the official direct-action envelope. The handler accepts
only opaque ECIES, decrypts and signs through tee-node's loopback API, persists
only the original ciphertext in a replay-safe sealed slot, and returns a public
receipt. Unit/race/restart tests pass, but this is not a live FCC claim until a
registered Coston2 machine and proxy exercise the same path.

```bash
go test ./...
go vet ./...
go build ./...
```

The release image pins both stages by digest and defaults to production
attestation (`MODE=0`). Local simulation must explicitly set `MODE=1`. Runtime
ownership must come from `INITIAL_OWNER` or `FLARE_DEPLOYMENT_PRIVATE_KEY`; no
development key is embedded in source or the image. Production deployment must
mount a persistent private volume at `SEALED_STORE_DIR`; an ephemeral container
filesystem cannot satisfy restart recovery.

Build and verify the pinned release image from the repository root:

```bash
pnpm flare:extension:image:build
pnpm flare:extension:image:verify
```

The verifier compares the local executable OCI manifest and extracted binary
with `tooling/flare/coston2-foundations.json`. It also rejects an image that
defaults to simulation, lacks the sealed-store volume, changes the launch
policy, or embeds a runtime secret variable.
