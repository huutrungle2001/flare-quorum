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
ordered-root vector and implements checked `SCORING_V1` eligibility, issuer
credentials, XRP/USD conversion, penalties, and tie-breaking. That model is not
yet connected to a private ingress/action handler and is not a live FCC claim.

```bash
go test ./...
go vet ./...
go build ./...
```

The release image pins both stages by digest and defaults to production
attestation (`MODE=0`). Local simulation must explicitly set `MODE=1`. Runtime
ownership must come from `INITIAL_OWNER` or `FLARE_DEPLOYMENT_PRIVATE_KEY`; no
development key is embedded in source or the image.
