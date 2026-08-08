# VeilBid Flare — before/after work ledger

This ledger separates the pre-existing Sepolia/Nox product from work built for
Summer Signal. Commit IDs refer to the Flare v2 repository's `main` branch.

| Category | Flare v2 work | Evidence / release authority | User benefit |
| --- | --- | --- | --- |
| Pre-existing baseline | Sepolia/Nox/Safe/ERC-7984 market, app, relay, and historical evidence | `packages/contracts/`, `evidence/sepolia/`, `/room` | Preserves the original procurement thesis without relabeling it as Flare |
| Newly built | Go FCC extension, ECIES private ingress, signed bid receipts, common quorum, multi-criteria FCC selection, Flare market | `apps/fcc-extension/`, `packages/flare-contracts/`, `evidence/coston2/gate-c-e-f-three-vendor.json` | Keeps vendor prices private while making the result independently verifiable |
| Newly built | Coston2 bindings, release manifest, hosted ingress, Buyer/Vendor workspaces, public Evidence ledger | `packages/flare-bindings/`, `apps/relay/`, `apps/web/`, `evidence/coston2/web-production-smoke.json` | Gives a judge a usable wallet-free path and explicit write boundaries |
| Newly built | Public-safe Buyer `0xFE` job/memo preview with read-only PersonalAccount/nonce discovery | `apps/web/src/flare/FlareXrpFundingPanel.tsx`, `evidence/coston2/web-production-smoke.json` | Makes the XRP-native handoff understandable without browser custody or XRPL secrets |
| Newly built | Optional GemWallet XRPL Testnet Payment signer/submitter with network/address checks and public-hash-only handoff | `apps/web/src/flare/xrplWallet.ts`, `apps/web/test/xrpl-wallet.test.ts` | Lets a buyer approve the exact memo in a browser wallet without exposing a seed or signed private material |
| Integrated | FTestXRP escrow, XRP/USD FTSO close snapshot, FXRP AssetManager discovery | `evidence/coston2/gate-c-e-f-three-vendor.json`, `packages/flare-contracts/deployments/coston2.release.json` | Settlement is tied to official Flare asset and price infrastructure |
| Integrated | XRPL `0xFE`, FDC `XRPPayment`, Smart Account direct mint and atomic tender funding | `evidence/coston2/gate-g-smart-account.json` | XRP-native buyers can fund the same procurement market without VeilBid custody |
| Improved | Domain binding, code/key fingerprints, threshold result checks, recovery states, secret/evidence scans | `docs/architecture-decisions.md`, `evidence/coston2/three-vendor-recovery.release.json` | Retries and outages cannot silently change the tender or manufacture a winner |
| Live hardening | Result-collection outage drill: one endpoint unavailable, two frozen machines finalize | `evidence/coston2/three-vendor-recovery.release.json`, commit `03c51a3` | Demonstrates threshold liveness without weakening the quorum |
| Live hardening | Read-only hosted runtime-log review across the three FCC services and ingress; forbidden-material scan runs in memory only | `evidence/coston2/hosted-runtime-log-review.json`, commit `5c743ab` | Adds an auditable privacy check without publishing runtime bodies or credentials |
| Live hardening | Market-machine preflight now targets the hosted product extension separately from the local foundation extension | `evidence/coston2/fcc-market-machine-preflight.json`, commit `b3f519e` | Prevents a foundation/product ID mix-up from falsely blocking registered machines |
| Release hardening | Market lifecycle preflight is repeatable after a prior evidence/state record, while execute mode still refuses overwrite | `tooling/flare/market-lifecycle-guards.mjs`, `tooling/test/market-lifecycle-guards.test.mjs` | Lets operators re-check live readiness without weakening immutable evidence safety |
| Release hardening | Independent wall-clock measurement of direct FCC acknowledgment and signed bid-receipt retrieval across all three hosted machines | `tooling/flare/ingress-benchmarks.mjs`, `evidence/coston2/bid-ingress-benchmark.release.json`, commit `f53a034` | Gives judges an honest operational latency sample without exposing bid material |
| Release hardening | Hosted ingress health rereads finalized tender 21 and fails closed on stale machine identity, code, URL, or key bindings | `apps/relay/src/flare-ingress.ts`, `evidence/coston2/flare-ingress-production.json`, commit `2a52447` | A public readiness check cannot silently outlive the frozen FCC trust boundary |
| Privacy hardening | Browser checks the Coston2 vendor allowlist before fetching TEE keys or sending any encrypted bid, with a clear no-ingress error | `apps/web/src/flare/flareBidIngress.ts`, `evidence/coston2/web-production-smoke.json`, commit `b355ee5` | An unapproved wallet never causes private ciphertext to reach the FCC quorum |

## Not claimed as complete

Same-identity simulated-TEE restart recovery, browser-native XRPL
interactive recovery and broader wallet coverage, instant FXRP/XRP payout, broad adversarial live drills, user interviews,
and pilot evidence remain explicit follow-up work. The checked-in four-minute
captioned demo is a public smoke-capture walkthrough; it is not evidence of
those remaining items. The submission must not present them as shipped
outcomes.
