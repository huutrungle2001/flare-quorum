# VeilBid Flare Championship Build Plan

> Status: Phase 0, Gates 0–A, live Gate-B ingress/replay, the core Gates C–F
> lifecycle, and Gate G pass with three registered Coston2 FCC machines and a verified XRP-native
> lifecycle. Same-identity simulated-TEE restart, release hardening, product
> UX, and Gate H remain open.

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
- [~] Pass Gates 0–B: Gate 0/A and live three-machine private ingress/replay
  pass; same-identity sealed recovery remains open under the supported
  simulated tee-node runtime.

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
- [x] Implement XRP-native executor and EVM buyer paths; delayed XRP minting
  now has public-safe checkpoint/resume, while browser XRPL signing remains
  intentionally outside the app.
- [x] Implement Activity recovery and public Evidence workspace.
- [x] Migrate relay and console to Flare bindings.

### Milestone 5 — verification and production presentation

- [x] Deploy and verify canonical Coston2 contracts/extension/machine policy.
- [~] Run full live/adversarial/recovery suites; core live lifecycles and one-
  endpoint recovery pass, while same-identity restart and complete fault drills
  remain open. Local rejection coverage and read-only Coston2 terminal/invalid-
  terms calls are recorded without promoting them to stateful live evidence.
- [~] Publish sanitized evidence and performance benchmarks; release evidence and
  public receipt/block timing are current, while independent bid-ingress timing
  and broader fault-drill evidence remain open.
- [x] Deploy web and relay; verify desktop/mobile/keyboard behavior.
- [ ] Complete user research, vendor tests, and pilot outreach.
- [ ] Pass Gate H.

### Milestone 6 — submission

- [x] Publish live app, demo video, technical materials, Coston2 addresses,
  extension/code/machine identifiers, work ledger, and roadmap.
- [ ] Select Confidential Compute Apps.
- [ ] Select Interoperable Asset Products only after the exact XRP-native
  lifecycle evidence passes.
- [x] Complete the repository/evidence/hosted-runtime claim, privacy, and
  secret review; user-validation and organizer submission decisions remain
  external.

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
