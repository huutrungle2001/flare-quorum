# FlareQuorum Championship Build Plan

> Status: Phase 0, Gates 0–A, live Gate-B ingress/replay, the core Gates C–F
> lifecycle, and Gate G pass with three registered Coston2 FCC machines and a verified XRP-native
> lifecycle. The public release hardening and product UX are recorded; the
> supported replacement-TEE drill passes. Additional stateful fault breadth and
> browser-native XRP recovery are planned post-Summer Signal hardening; Gate H
> user validation remains `NOT_RUN`. The isolated V2 candidate is now live with
> its own market, extension, governance, three fresh machines, and passed
> three-vendor success lifecycle, one-result-endpoint outage recovery, and
> three-machine invalid-credential rejection/retry drill. Its
> refund tender is `WAITING` for the fixed 24-hour grace;
> V2 promotion remains separate from the verified V1 submission release.

The master execution checklist is [`PLAN.md`](../PLAN.md). This document records
workspace sequencing, deliverables, and release engineering.

## 1. Delivery strategy

Build one vertical flagship product rather than a minimal FCC demo plus optional
protocol widgets. Every production phase extends the same path:

```text
XRPL/FDC/Smart Account funding -> FTestXRP escrow -> private FCC bids ->
FTSO-bound multi-criteria scoring -> threshold result -> FXRP settlement/exit
```

The historical Sepolia/Nox release remains isolated baseline. New Flare code,
bindings, deployment, and evidence use separate authorities.

## 2. Pinned target stack

- Coston2 (`114`).
- Foundry and Solidity `0.8.27` for Flare contracts.
- Official FCC scaffold-derived Go extension and Docker stack.
- React, viem, and generated TypeScript bindings.
- Official Flare periphery/registry discovery.
- FTestXRP/AssetManager, XRP/USD FTSO, FDC, and Smart Accounts.
- Stateless Node relay and read-only console.

Exact versions and upstream commit/image digests are produced by Gate 0; version
placeholders are forbidden after that commit.

## 3. Workspace sequence

### Milestone 0 — championship planning

- [x] Preserve historical baseline.
- [x] Approve product thesis and flagship journey.
- [x] Resolve architecture decisions.
- [x] Define feasibility, verification, security, UX, evidence, and traction
  gates.
- [x] Publish private Summer Signal repository.

### Milestone 1 — FCC foundation

- [x] Pin official scaffold and toolchain.
- [x] Add `apps/fcc-extension`.
- [x] Add `packages/flare-contracts` feasibility sender/verifier.
- [x] Pass Gates 0–B: Gate 0/A, live three-machine private ingress/replay, and
  organizer-approved rolling replacement registration pass on Coston2.

### Milestone 2 — confidential procurement engine

- [x] Freeze cross-language schemas and golden vectors.
- [x] Implement bid receipts, common quorum, and ordered root.
- [x] Implement credential validation and `SCORING_V1`.
- [x] Implement three-machine selection and two-signature result threshold.
- [x] Pass Gates C–E with the live three-bid, common-quorum, private-scoring,
  and two-signature finalization evidence.

### Milestone 3 — Flare economic path

- [x] Implement production `VeilBidFlareMarket` and receipt.
- [x] Integrate FTestXRP escrow and FAssets exit.
- [x] Integrate XRP/USD FTSO snapshot and conversion.
- [x] Implement and live-verify the Smart Account `0xFE` plus FDC direct
  mint-and-fund executor.
- [x] Pass Gates F–G in the live Coston2 lifecycle.

### Milestone 4 — generated consumers

- [x] Add `packages/flare-bindings` and drift checks.
- [x] Migrate web judge path to Coston2.
- [x] Implement private vendor ingress and receipt UX.
- [x] Implement the unified Buyer with direct Coston2 and XRP-native executor
  paths; delayed XRP minting now has public-safe checkpoint/resume, and the
  optional GemWallet Testnet signer returns only a public payment hash while
  browser-native recovery is tracked as post-Summer Signal hardening.
- [x] Implement Activity recovery and public Evidence workspace.
- [x] Migrate relay and console to Flare bindings.

### Milestone 5 — verification and production presentation

- [x] Deploy and verify canonical Coston2 contracts/extension/machine policy.
- [x] Record the current-release live/adversarial/recovery boundary: core live
  lifecycles, one-endpoint recovery, and the replacement-TEE drill pass. Local
  rejection coverage,
  the Docker identity-rotation boundary,
  and read-only Coston2 terminal/invalid-terms calls are recorded without
  promoting them to stateful live evidence.
- [x] Publish current-release sanitized evidence and performance benchmarks,
  including public receipt/block timing and independent bid-ingress timing;
  broader fault-drill evidence belongs to the post-Summer hardening roadmap.
- [x] Deploy web and relay; verify desktop/mobile/keyboard behavior.
- [ ] Complete user research, vendor tests, and pilot outreach.
- [ ] Pass Gate H.

### Milestone 6 — submission

- [x] Publish live app, demo video, technical materials, Coston2 addresses,
  extension/code/machine identifiers, work ledger, and roadmap.
- Builder submission action: select Confidential Compute Apps as the primary
  bounty.
- Builder submission action: select Interoperable Asset Products using the
  already recorded XRP-native lifecycle evidence.
- [x] Complete the repository/evidence/hosted-runtime claim, privacy, and
  secret review; user-validation and organizer submission decisions remain
  external.

### Isolated V2 promotion and later hardening

- [x] Deploy V2 alongside V1 with a fresh extension and exactly three fresh
  machine identities.
- [x] Verify its candidate manifest and address-free bindings against source,
  runtime, registry, extension, code version, signer, and machine facts.
- [x] Record one live three-vendor flagship success lifecycle.
- [x] Record one live three-vendor lifecycle that finalizes with one result
  endpoint intentionally unavailable to the collector.
- [x] Record one live sealed-bid credential-negative lifecycle in which all
  three TEEs reject the wrong issuer and accept the corrected credential on the
  same canonical slot.
- Resume the closed refund tender after its real 24-hour grace and record the
  bounded pre-dispatch full-refund lifecycle before promotion.
- Resume optional post-dispatch tender `5` after chain timestamp `1786553311`
  and record the fixed-first-dispatch refund path. It is additional fault
  breadth and does not delay promotion once the required undispatched refund
  passes.
- Expand stateful live fault coverage and browser-native XRP recovery under
  the same public-safe, fail-closed release policy.
- Keep V1 consumer-selectable until the separate V2 promotion decision is
  explicitly approved.

## 4. Production packages

### `apps/fcc-extension`

- private ingress adapter;
- canonical schema and credential verification;
- sealed tender/bid state;
- deterministic scoring and result production;
- allowlisted logs and health;
- Go unit/model/Coston2 tests.

### `packages/flare-contracts`

- market, receipt, and exact FCC registry interfaces;
- bid receipt/result signature verification;
- ordered root/quorum/FTSO/escrow lifecycle;
- Foundry unit, fuzz, invariant, and live scripts;
- Coston2 deployment and source/runtime verification.

### `packages/flare-bindings`

- generated ABI/address/schema snapshots;
- event codecs and public index;
- readiness/result grouping rules;
- FTSO/FAssets/Smart Account domain types.

### Migrated applications

- web: complete user and judge journeys;
- relay: public close/request/threshold-result/finalize;
- console: public inspection only.

## 5. Target root commands

Commands are introduced with their owning workspaces and become release gates:

```bash
pnpm flare:compile
pnpm flare:test
pnpm flare:lint
pnpm flare:build
pnpm flare:schemas:check
pnpm flare:bindings:check
pnpm flare:extension:test
pnpm flare:test:coston2
pnpm flare:verify:coston2
pnpm flare:evidence:validate
pnpm flare:secret:scan
```

They are planned names until the corresponding scaffold commit implements them.

## 6. Scope controls

- No on-chain ciphertext fallback for the championship release.
- No one-of-one TEE judge claim when a multi-machine environment is available.
- No generic-token final demo.
- No manual price in an USD-enabled tender.
- No FDC call unrelated to the Smart Account/XRP user journey.
- No AI or subjective scoring.
- No app database as procurement authority.
- No feature marked complete without live evidence and user-visible value.
