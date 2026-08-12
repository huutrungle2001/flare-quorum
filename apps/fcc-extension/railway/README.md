# Railway simulated FCC machine

This image runs one Coston2 simulated FCC machine as three co-located
processes: the pinned Redis queue, the pinned official `tee-proxy`, and the
byte-identical FlareQuorum extension/`tee-node` binary. Deploy three independent
Railway services from this image to obtain three stable HTTPS origins and
three independently generated TEE identities.

This is Coston2 feasibility infrastructure. It is not hardware attestation and
must never be described as GCP Confidential Space or a production-security
deployment.

Secrets are supplied only as Railway runtime variables. The entrypoint renders
the proxy config into a mode-0600 runtime file and does not print values.

Required service variables:

- `FCC_INDEXER_HOST`, `FCC_INDEXER_PORT`, `FCC_INDEXER_DATABASE`
- `FCC_INDEXER_USER`, `FCC_INDEXER_PASSWORD`
- `PROXY_PRIVATE_KEY`, `FCC_DIRECT_API_KEY`
- `COSTON2_RPC_URL`
- `INITIAL_OWNER`, `EXTENSION_ID`
- `GOVERNANCE_SIGNERS`, `GOVERNANCE_THRESHOLD`
- `RAILWAY_DOCKERFILE_PATH=/apps/fcc-extension/railway/Dockerfile`

Attach a Railway volume at `/data` before registration. Upstream `tee-node`
v0.0.24 creates a new simulated identity whenever its process starts, so any
restart requires endpoint identity verification and re-registration. Do not
redeploy a registered machine during the demo window.

Providers send cosigned instructions directly to the selected service's
`POST /instruction` route on provider-facing port `6664`; `tee-proxy` does not
discover instructions from the indexer. The indexer remains required for
signing-policy and indexed protocol state. A port connect alone is not an
indexer health check: use `GET :6661/ready`, where `200` means current and a
`503` C-chain-delay response means it is actually behind. Never print the
rendered TOML or database variables.

After registration, require status `2`, availability younger than six hours,
one active identity per endpoint, and run the machine preflight to compare the
public `/info` identity, `/instruction` route, on-chain URL, and complete active
machine set. Status `2`, a successful dispatch transaction, or an HTTP listener
alone does not prove that the instruction can be consumed.
