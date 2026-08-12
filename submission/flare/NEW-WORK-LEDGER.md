# FlareQuorum — before/after work ledger

This ledger separates the pre-existing Sepolia/Nox product from work built for
Summer Signal. Commit IDs refer to the FlareQuorum repository's `main` branch.

| Category | Summer Signal / Flare work | Evidence / release authority | User benefit |
| --- | --- | --- | --- |
| Pre-existing baseline | Sepolia/Nox/Safe/ERC-7984 market, app, relay, and historical evidence | `packages/contracts/`, `packages/chain-bindings/`, `evidence/sepolia/` | Preserves the original procurement thesis without relabeling it as Flare; the current browser does not expose this route |
| Newly built | Go FCC extension, ECIES private ingress, signed bid receipts, common quorum, multi-criteria FCC selection, Flare market | `apps/fcc-extension/`, `packages/flare-contracts/`, `evidence/coston2/gate-c-e-f-three-vendor.json` | Keeps vendor prices private while making the result independently verifiable |
| Newly built | Coston2 bindings, release manifest, hosted ingress, Buyer/Vendor workspaces, public Evidence ledger | `packages/flare-bindings/`, `apps/relay/`, `apps/web/`, `evidence/coston2/web-v2-production-smoke.json` | Gives a judge a usable wallet-free path and explicit write boundaries |
| Newly built | Public-safe Buyer `0xFE` job/memo preview with read-only PersonalAccount/nonce discovery | `apps/web/src/flare/FlareXrpFundingPanel.tsx`, `evidence/coston2/web-v2-xrp-funding-draft.json` | Makes the XRP-native handoff understandable without browser custody or XRPL secrets |
| Newly built | Optional GemWallet XRPL Testnet Payment signer/submitter with network/address checks and public-hash-only handoff | `apps/web/src/flare/xrplWallet.ts`, `apps/web/test/xrpl-wallet.test.ts` | Lets a buyer approve the exact memo in a browser wallet without exposing a seed or signed private material |
| Integrated | FTestXRP escrow, XRP/USD FTSO close snapshot, FXRP AssetManager discovery | `evidence/coston2/gate-c-e-f-three-vendor.json`, `packages/flare-contracts/deployments/coston2.release.json` | Settlement is tied to official Flare asset and price infrastructure |
| Integrated | XRPL `0xFE`, FDC `XRPPayment`, Smart Account direct mint and atomic tender funding | `evidence/coston2/gate-g-smart-account.json` | XRP-native buyers can fund the same procurement market without FlareQuorum custody |
| Improved | Domain binding, code/key fingerprints, threshold result checks, recovery states, secret/evidence scans | `docs/architecture-decisions.md`, `evidence/coston2/three-vendor-recovery.release.json` | Retries and outages cannot silently change the tender or manufacture a winner |
| Live hardening | Result-collection outage drill: one endpoint unavailable, two frozen machines finalize | `evidence/coston2/three-vendor-recovery.release.json`, commit `03c51a3` | Demonstrates threshold liveness without weakening the quorum |
| Live hardening | Read-only hosted runtime-log review across the three FCC services and ingress; forbidden-material scan runs in memory only | `evidence/coston2/hosted-runtime-log-review.json`, commit `5c743ab` | Adds an auditable privacy check without publishing runtime bodies or credentials |
| Live hardening | Current-scaffold rolling replacement and exact active-machine preflight target the consumer-selected V2 extension | `evidence/coston2/fcc-market-v2-machines-refresh.json` | Prevents stale identity, route, version, or expired availability from being mistaken for FCC readiness |
| Release hardening | V2 added bounded pre-dispatch recovery and passed success, outage, credential-negative, both refund, deployment-consistency, promotion, and consumer-switch gates | `packages/flare-contracts/deployments/coston2.release.json`, `evidence/coston2/market-v2-deployment-consistency.json` | Prevents external quorum loss before first dispatch from locking buyer escrow indefinitely while preserving threshold winner authority |
| Release hardening | Market lifecycle preflight is repeatable after a prior evidence/state record, while execute mode still refuses overwrite | `tooling/flare/market-lifecycle-guards.mjs`, `tooling/test/market-lifecycle-guards.test.mjs` | Lets operators re-check live readiness without weakening immutable evidence safety |
| Release hardening | Independent wall-clock measurement of direct FCC acknowledgment and signed bid-receipt retrieval across all three hosted machines | `tooling/flare/ingress-benchmarks.mjs`, `evidence/coston2/bid-ingress-benchmark.release.json`, commit `f53a034` | Gives judges an honest operational latency sample without exposing bid material |
| Release hardening | Hosted V2 ingress health rereads finalized chain state and fails closed on stale machine identity, code, URL, or key bindings | `apps/relay/src/flare-ingress.ts`, `evidence/coston2/flare-ingress-v2-production.json` | A public readiness check cannot silently outlive the frozen FCC trust boundary |
| Live hardening | Organizer-supported rolling recovery replaced and re-registered all three product TEE identities, safely retired stale rotation, and completed tender 23 on the new set | `evidence/coston2/fcc-replacement-recovery.json`, `evidence/coston2/gate-c-e-f-v023-live-lifecycle.json` | Proves operational recovery without exporting keys, patching the runtime, or mutating an existing tender's frozen set |
| Privacy hardening | Browser checks the Coston2 vendor allowlist before fetching TEE keys or sending any encrypted bid, with a clear no-ingress error | `apps/web/src/flare/flareBidIngress.ts`, `evidence/coston2/web-v2-production-smoke.json`, commit `b355ee5` | An unapproved wallet never causes private ciphertext to reach the FCC quorum |
| Recovery UX | Reload-safe browser checkpoint retains only public XRPL payment recovery fields, offers explicit resume, and supports explicit forget | `apps/web/src/flare/fundingCheckpoint.ts`, `apps/web/src/flare/FlareXrpFundingPanel.tsx`, `apps/web/test/flare-explorer.test.tsx`, `apps/web/scripts/smoke-flare-funding-checkpoint.mjs`, `evidence/coston2/web-v2-xrp-funding-checkpoint.json`, commits `c122392`, `b2311f0`, `3051cde` | A buyer can reopen and explicitly resume the same public payment handoff after a reload without custody or confidential persistence |

## Current release boundary and roadmap

The supported recovery model is replacement registration rather than
same-identity restoration. The recorded FAssets lifecycle reaches the official
redemption-request boundary rather than asserting an instant underlying XRP
payout. Gate H remains `NOT_RUN`, so interviews and pilot outcomes are absent
from current claims. The checked-in four-minute captioned demo is a public
smoke-capture walkthrough and does not replace those records.

V2 deployment, both refund paths, refreshed FCC machines, promotion, and the
consumer switch are complete and represented by the canonical manifest and
current evidence. Browser-native XRP executor recovery, broader wallet
coverage, and additional stateful live fault drills remain post-Summer Signal
hardening rather than current release claims.
