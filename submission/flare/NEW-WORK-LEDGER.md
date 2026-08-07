# VeilBid Flare — before/after work ledger

This ledger separates the pre-existing Sepolia/Nox product from work built for
Summer Signal. Commit IDs refer to the Flare v2 repository's `main` branch.

| Category | Flare v2 work | Evidence / release authority | User benefit |
| --- | --- | --- | --- |
| Pre-existing baseline | Sepolia/Nox/Safe/ERC-7984 market, app, relay, and historical evidence | `packages/contracts/`, `evidence/sepolia/`, `/room` | Preserves the original procurement thesis without relabeling it as Flare |
| Newly built | Go FCC extension, ECIES private ingress, signed bid receipts, common quorum, multi-criteria FCC selection, Flare market | `apps/fcc-extension/`, `packages/flare-contracts/`, `evidence/coston2/gate-c-e-f-three-vendor.json` | Keeps vendor prices private while making the result independently verifiable |
| Newly built | Coston2 bindings, release manifest, hosted ingress, Buyer/Vendor workspaces, public Evidence ledger | `packages/flare-bindings/`, `apps/relay/`, `apps/web/`, `evidence/coston2/web-production-smoke.json` | Gives a judge a usable wallet-free path and explicit write boundaries |
| Integrated | FTestXRP escrow, XRP/USD FTSO close snapshot, FXRP AssetManager discovery | `evidence/coston2/gate-c-e-f-three-vendor.json`, `packages/flare-contracts/deployments/coston2.release.json` | Settlement is tied to official Flare asset and price infrastructure |
| Integrated | XRPL `0xFE`, FDC `XRPPayment`, Smart Account direct mint and atomic tender funding | `evidence/coston2/gate-g-smart-account.json` | XRP-native buyers can fund the same procurement market without VeilBid custody |
| Improved | Domain binding, code/key fingerprints, threshold result checks, recovery states, secret/evidence scans | `docs/architecture-decisions.md`, `evidence/coston2/three-vendor-recovery.release.json` | Retries and outages cannot silently change the tender or manufacture a winner |
| Live hardening | Result-collection outage drill: one endpoint unavailable, two frozen machines finalize | `evidence/coston2/three-vendor-recovery.release.json`, commit `03c51a3` | Demonstrates threshold liveness without weakening the quorum |

## Not claimed as complete

Same-identity simulated-TEE restart recovery, browser-native XRP funding/recovery,
interactive FXRP redemption, broad adversarial live drills, user interviews,
and pilot evidence remain explicit follow-up work. The checked-in four-minute
captioned demo is a public smoke-capture walkthrough; it is not evidence of
those remaining items. The submission must not present them as shipped
outcomes.
