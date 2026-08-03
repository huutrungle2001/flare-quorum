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

## Commands

Build first, then load the root `.env.local`:

```bash
pnpm --filter @veilbid/settlement-relay build
node --env-file-if-exists=.env.local apps/relay/dist/cli.js dry-run
node --env-file-if-exists=.env.local apps/relay/dist/cli.js health
node --env-file-if-exists=.env.local apps/relay/dist/cli.js once
node --env-file-if-exists=.env.local apps/relay/dist/cli.js poll

# Coston2/FCC lifecycle
pnpm flare:relay:health
pnpm flare:relay:dry-run
pnpm flare:relay:once
pnpm flare:relay:poll
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
```

`health` and `dry-run` remain read-only. `once` and `poll` are intentionally
disabled while the release status is `planned`; local tests do not override
this production gate.

`dry-run` and `health` require only `SEPOLIA_RPC_URL`. `once` and `poll`
require a dedicated gas-funded `FINALIZER_PRIVATE_KEY`. Runtime consumers use
the verified canonical release manifest. The
`VEILBID_ALLOW_UNVERIFIED_DEPLOYMENT` escape exists only for historical test
manifests and must remain false for release operation.

Polling exposes chain readiness at `GET /health` and process liveness at
`GET /live` on `127.0.0.1:8787` by default. Hosted deployments set
`FINALIZER_HEALTH_HOST=0.0.0.0` and supply `PORT`. The canonical Railway
service is linked to the repository's `main` branch, reads `railway.json`, and
publishes health at
`https://veilbid-relay-production.up.railway.app/health`. Each cycle rebuilds
the finalized public index in bounded RPC ranges; it keeps no database or
confidential checkpoint. A zero winner ID follows the same `finalizeTender`
call and produces the contract's full-refund outcome.

Railway is the only continuously scheduled runner for the canonical release.
A maintainer may run `pnpm finalizer:once` manually from another environment
when recovering an eligible tender; competing callers are handled through
canonical state rereads and simulation.
