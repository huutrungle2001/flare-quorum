# Settlement Relay

> Release boundary: `cli.js` retains the historical Sepolia/Nox runner.
> `flare-cli.js` is the isolated Coston2/FCC runner and never reads or falls
> back to the Sepolia manifest.

Stateless, permissionless funding confirmation, close, and public-proof/finalize
automation, including the proof-derived zero-winner refund outcome. It uses public chain state only
and does not hold private decryption or buyer authority.

The core planner confirms exact funding first, then prioritizes proof-ready
`finalize` actions and `close` actions, including early close when all approved
vendors have bid. The runner processes actions sequentially under one shared
budget, rereads state before each action, and classifies a failed competing
write as a benign race only after another canonical state read confirms that
the action was resolved.

Structured results contain only the action kind, public tender ID, outcome,
public transaction hash, and an allowlisted reason code. Handles, proofs,
private keys, plaintext bids, balances, and raw provider errors are excluded.

## Coston2 boundary

The Coston2 runner reads canonical tender state and plans `close`, `request`,
expired-attempt `retry`, and `finalize` actions. It simulates every write,
submits sequentially under a bounded action budget, and waits for a successful
receipt. Finalization polls three distinct HTTPS FCC proxy URLs, validates the
pinned `ActionResponse` schema and `TEE_ACTION_RESULT` signature domain, and
requires two distinct tender-fixed TEE identities to sign identical canonical
selection bytes. Unavailable, malformed, split, expired, or weak responses
remain pending; there is no synthetic result or success fallback.

Write modes require an explicit verified Coston2 deployment, dedicated
finalizer key, three public proxy URLs, extension semantic version, and current
FCC instruction fee. URLs with credentials, query strings, fragments, or
non-TLS public transport are rejected. The finalizer has no bid-decryption
capability and raw proxy bodies are bounded and never logged.

### Ciphertext-only vendor ingress

`flare-ingress-cli.js` is the server-side bridge between the browser and the
three authenticated FCC `/direct` endpoints. `GET
/flare/ingress/tenders/:tenderId/machines` publishes only the three public
encryption keys after rereading one Coston2 block and matching the market's
immutable manager, production status, extension ID, code hash, registered
proxy URL, TEE identity, and frozen key fingerprint.
`POST /flare/ingress/bids` accepts only the strict EIP-712-authorized ciphertext
envelope and returns only the public action ID, target TEE ID, and expiry.
`GET /flare/ingress/tenders/:tenderId/machines/:machineIndex/results/:actionId`
polls one action and returns only a verified, TEE-signed bid receipt payload;
pending proxy results remain HTTP 202. `GET /health` is a public readiness
probe that rereads a configured finalized public tender and validates all three
frozen machine identities, code hash, registered URLs, and key fingerprints
before returning only tender status and Boolean readiness fields. The
hosted v2 judge ingress is
`https://veilbid-flare-ingress-production.up.railway.app`; its browser origin
allowlist is the separate v2 Vercel deployment.

The server authenticates the vendor before doing admission RPC reads, bounds
request and proxy-response bodies, rate limits the socket peer, uses exact
origin CORS, keeps all three `/direct` API keys server-side, disables redirects,
and strips the proxy response that contains the ciphertext. It never persists
or logs a request body. A vendor calls the endpoint separately for all three
tender-frozen machines, obtains three TEE-signed receipts through the result
flow, and submits the atomic receipt set on-chain.

### Hash-verified public Buyer Brief registry

`PUT /flare/public-briefs/:metadataHash` accepts only the versioned public
Buyer Brief schema and only from the configured browser origin (or server-side
tooling without an `Origin` header). It recomputes the canonical hash before an
atomic, immutable write. `GET` returns the same public-safe preimage. The
browser independently parses and hashes the response before displaying it.

The schema contains title, category, objective, acceptance criteria, optional
vendor questions, asset, deadline, and approved vendor addresses. Unknown
keys—including bid values, ciphertext, credentials, salts, signatures, wallet
material, and FDC proofs—are rejected. Missing or corrupt entries fail closed;
no content is inferred from the hash.

## Commands

Build first, then load the root `.env.local`:

```bash
pnpm --filter @flarequorum/settlement-relay build
node --env-file-if-exists=.env.local apps/relay/dist/cli.js dry-run
node --env-file-if-exists=.env.local apps/relay/dist/cli.js health
node --env-file-if-exists=.env.local apps/relay/dist/cli.js once
node --env-file-if-exists=.env.local apps/relay/dist/cli.js poll

# Coston2/FCC lifecycle
pnpm flare:relay:health
pnpm flare:relay:health-server
pnpm flare:relay:dry-run
pnpm flare:relay:once
pnpm flare:relay:poll

# XRP-native Smart Account funding (server-side, disposable executor only)
pnpm flare:funding:health
pnpm flare:funding:execute < funding-job.json
pnpm flare:funding:resume < delayed-checkpoint.json

# Ciphertext-only FCC ingress server
pnpm flare:ingress
```

The Coston2 commands use:

```text
COSTON2_RPC_URL
FLARE_MARKET_ADDRESS
FLARE_MARKET_DEPLOYMENT_BLOCK
FLARE_DEPLOYMENT_STATUS=verified
FLARE_FINALIZER_PRIVATE_KEY             # write modes only
FLARE_FCC_PROXY_URLS                    # exactly three comma-separated URLs
FLARE_FCC_EXTENSION_VERSION
FLARE_FCC_INSTRUCTION_FEE_WEI
FLARE_ACTION_BUDGET                     # 1 by default, maximum 100

# Hosted health server (read-only mode; no signer or proxy credentials)
FLARE_HEALTH_HOST                        # 127.0.0.1 by default
FLARE_HEALTH_PORT                        # PORT fallback, 8787 by default

# Additional server-only ingress configuration
FLARE_TEE_MANAGER                       # verified market constructor binding
FLARE_FCC_DIRECT_API_KEYS               # three comma-separated values; never VITE_*
FLARE_INGRESS_WEB_ORIGIN                # exact HTTPS web origin
FLARE_INGRESS_HOST                      # loopback by default
FLARE_INGRESS_PORT                      # 8788 by default; PORT is fallback
FLARE_INGRESS_HEALTH_TENDER_ID          # finalized public tender for fail-closed health checks
FLARE_PUBLIC_BRIEF_DIR                  # persistent public-safe registry directory
```

The browser receives only the public `VITE_FLARE_INGRESS_URL` origin and may
optionally receive a separate `VITE_FLARE_PUBLIC_BRIEF_URL` origin. It never
receives the direct proxy API keys, indexer credentials, or any TEE secret.

`health` and `dry-run` remain read-only. `once` and `poll` are intentionally
disabled while the release status is `planned`; local tests do not override
this production gate.

`health-server` keeps a read-only Coston2 process alive for a hosted health
check. It serves `/live` for process liveness and `/health` for chain/market
readiness without requiring a finalizer key or exposing FCC credentials. A
settlement deployment must use `poll` only after the dedicated signer, three
FCC proxies, extension version, and instruction fee are configured.

`dry-run` and `health` require only `SEPOLIA_RPC_URL`. `once` and `poll`
require a dedicated gas-funded `FINALIZER_PRIVATE_KEY`. Runtime consumers use
the verified canonical release manifest. The
`FLAREQUORUM_ALLOW_UNVERIFIED_DEPLOYMENT` escape exists only for historical test
manifests and must remain false for release operation.

Polling exposes chain readiness through the hosted health server at `GET
/health` and process liveness at `GET /live` on `127.0.0.1:8787` by default.
Hosted deployments set `FLARE_HEALTH_HOST=0.0.0.0` and supply `PORT`. The v2
Flare service must be separate from any historical Sepolia relay and should
publish its own Railway domain after its Coston2 environment is configured.
Each cycle rebuilds
the finalized public index in bounded RPC ranges; it keeps no database or
confidential checkpoint. A zero winner ID follows the same `finalizeTender`
call and produces the contract's full-refund outcome.

Railway is the only continuously scheduled runner for the canonical release.
A maintainer may run `pnpm finalizer:once` manually from another environment
when recovering an eligible tender; competing callers are handled through
canonical state rereads and simulation.
