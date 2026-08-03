# Settlement Relay

> Historical runtime note: the implemented relay currently targets the
> Sepolia/Nox baseline. A separate Coston2/FCC lifecycle will replace the judge
> path after it is implemented and verified.

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

The relay package also exposes an isolated `FlareLiveRelay` health reader and
`loadFlareRelayConfig` for the planned Coston2 market. It requires explicit
`COSTON2_RPC_URL`, market address, deployment block, and deployment status; it
never falls back to the Sepolia manifest. Flare write modes fail closed until a
`verified` Coston2 release and a dedicated finalizer account are configured.
The close/request/result/finalize Flare write path remains disabled until the
registered FCC result provider and release manifest exist.

## Commands

Build first, then load the root `.env.local`:

```bash
pnpm --filter @veilbid/settlement-relay build
node --env-file-if-exists=.env.local apps/relay/dist/cli.js dry-run
node --env-file-if-exists=.env.local apps/relay/dist/cli.js health
node --env-file-if-exists=.env.local apps/relay/dist/cli.js once
node --env-file-if-exists=.env.local apps/relay/dist/cli.js poll
```

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
