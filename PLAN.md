# VeilBid Flare Championship Execution Plan

> Status: Phase 0, Gates 0–A, live Gate-B ingress/replay, the core Gates C–F
> lifecycle, and Gate G pass on Coston2. Three stable Railway FCC origins accept encrypted bids and
> return domain-bound receipts; a three-bid, two-signature lifecycle proves
> common quorum, private scoring, threshold finalization, FTSO binding, and
> exact FTestXRP settlement. The XRP-native run also proves an XRPL `0xFE`
> payment, FDC proof, Smart Account direct mint, and atomic tender funding.
> Same-identity restart recovery remains open under the supported simulated
> runtime; Gate H and release hardening remain open.
>
> Objective: build the strongest credible Summer Signal submission by making
> FCC private computation and XRP interoperability inseparable from one usable
> procurement product. Winning cannot be guaranteed; every gate below is chosen
> to maximize usefulness, Flare depth, technical credibility, clarity, and
> evidence of new work.

The supplied competition requirements are preserved in
[`docs/original/hackathon-brief.md`](docs/original/hackathon-brief.md) and translated into submission gates in
[`docs/hackathon-brief.md`](docs/hackathon-brief.md).

## 1. Championship product

**Product:** VeilBid Flare

**One-line pitch:** XRP treasuries fund procurement from XRPL, vendors submit
private multi-criteria offers, a quorum of Flare TEEs selects the best eligible
offer under a public deterministic rule, and the winner receives FXRP with a
publicly verifiable award.

**Primary users:**

- XRP-native companies and treasury operators purchasing technical,
  operational, or professional services.
- Flare ecosystem DAOs and grant/procurement teams.
- Vendors protecting losing prices, delivery terms, and qualification data.

**Selected bounty strategy:**

- Confidential Compute Apps: mandatory primary submission.
- Interoperable Asset Products: selected only after the complete XRP -> Smart
  Account -> FXRP escrow -> FCC award -> FXRP/XRP exit lifecycle passes.

## 2. Non-negotiable product path

The judge demo is one end-to-end story, not a protocol showcase menu:

```text
XRPL payment + 0xFE user-op commitment
        |
FDC verifies payment; Smart Account mints FXRP
        |
PersonalAccount atomically creates and funds tender
        |
vendors privately submit ECIES bids to fixed FCC TEE quorum
        |
threshold-signed bid receipts become the public ordered bid root
        |
close captures XRP/USD FTSO snapshot
        |
TEEs verify credentials and score price/delivery/warranty
        |
2-of-3 matching TEE results finalize public FXRP settlement
        |
winner follows official FXRP redemption path to XRP
```

The minimal 1-of-1 price-only lifecycle is a feasibility artifact, not the final
product.

## 3. Accepted architecture

All open design questions are resolved in
[`docs/architecture-decisions.md`](docs/architecture-decisions.md). Key choices:

- Private off-chain bid ingress; no permanent ciphertext on-chain.
- TEE-signed bid receipts and an on-chain ordered commitment root.
- Three fixed machines per tender; common bid quorum and two matching results.
- Frozen machine/key/code policy after opening.
- Sealed TEE state with public-chain rollback detection.
- Deterministic credential-gated price/delivery/warranty scoring.
- XRP and USD quote currencies with an official XRP/USD FTSO snapshot.
- FTestXRP-only championship escrow and public settlement.
- XRP-native atomic mint-and-fund through Smart Account opcode `0xFE` and FDC.
- Foundry/Solidity contracts, Go FCC extension, generated TypeScript bindings.
- Non-upgradeable market and no admin winner/escrow authority.

## 4. Workstreams and gates

### Phase 0 — external access and pinned foundations

- [x] Confirm organizer-supported FCC environment, indexer access, proxy
  requirements, and whether at least three registered TEE machines are
  available for one extension.
- [x] Confirm real confidential hardware versus simulated TEE judge policy.
- [x] Pin the official FCC scaffold commit and add a VeilBid tee-proxy release
  recipe whose official source archive, builder, and runtime are checksum or
  digest pinned.
- [x] Build that recipe on `linux/amd64`, verify the executable OCI manifest
  and extracted binary digest, and record sanitized Gate 0 image evidence.
- [x] Pin and build the VeilBid FCC extension image, keep production
  attestation as its safe default, and verify its binary, sealed-store volume,
  launch policy, and absence of embedded runtime secrets.
- [x] Align `tee-node v0.0.23` with the exact version resolved by the pinned
  proxy and record the upstream identity-restart limitation without persisting
  a raw TEE private key.
- [x] Apply [`docs/fcc-coston2-operations.md`](docs/fcc-coston2-operations.md):
  resolve live `FlareTeeManager`, enforce the organizer minimum TEE/proxy
  revisions, use a fresh extension ID and `rRap`, and reach machine status `2`.
- [x] Obtain and locally configure current read-only Coston2 indexer
  credentials without committing or printing them.
- [x] Configure three persistent Railway HTTPS origins with independent FCC
  machine identities; quick-tunnel URLs remain forbidden for registration.
- [x] Pin Go, Foundry, Solidity, Node, pnpm, viem, and Flare periphery versions.
- [x] Record official Coston2 registry, FCC, FAssets, FTSO, and Smart Account
  discovery paths without hardcoding undocumented addresses.
- [x] Obtain disposable Coston2, XRPL testnet, and executor identities.

Exit: every external dependency is reachable or recorded as a blocker before
product code depends on it.

### Phase 1 — FCC vertical feasibility

- [x] Create `apps/fcc-extension` from the pinned scaffold and replace the
  greeting sample with a deterministic, public-safe `PING_V1` foundation
  operation using the organizer-supported `tee-node` runtime line.
- [x] Create `packages/flare-contracts` with a minimal instruction sender whose
  ABI tuple and binding vector match the Go extension; deploy V1 on Coston2 and
  verify its runtime plus both live manager/registry constructor bindings.
  Keep V1 unregistered and use the tested constant-time V2 replacement for the
  fresh Gate-A registration.
- [x] Send and verify a domain-correct Coston2 result.
- [x] Implement private bid ingress through the supported proxy/TEE path and
  verify live three-machine authenticated ciphertext-only receipts; same-
  identity restart recovery remains open.
- [x] Return and verify TEE-signed `BidReceipt` values in the local extension
  harness and live registered-TEE ingress; body-log and restart evidence remain
  open.
- [x] Prove sealed persistence across process restart in the local sealed-store
  tests; live three-machine recovery remains open.
- [x] Prove three-machine selection and two matching signatures in the live
  Coston2 lifecycle; same-identity restart recovery remains a Gate-B limitation.

Exit: private data never crosses the public path and a registered TEE result is
verified on-chain.

### Phase 2 — deterministic procurement protocol

- [x] Freeze `BID_SCHEMA_V1`, `BID_RECEIPT_V1`, `SCORING_V1`, and
  `SELECTION_RESULT_V1` schemas in the Go/Solidity protocol fixtures.
- [x] Generate or drift-check Go/Solidity/TypeScript representations (Flare
  ABI is generated from Foundry output; protocol bindings are drift-tested).
- [x] Implement machine-set/key/code-version tender binding.
- [x] Implement receipt bitmap, common quorum, ordered root, and first-accepted
  tie rule.
- [x] Implement credential issuer/type/signature validation.
- [x] Implement checked fixed-point price, delivery, and warranty penalties.
- [x] Add deterministic golden vectors shared by Go, Solidity, and TypeScript
  for ordered roots and selection-result digests.
- [x] Run invalid, tie, permutation, boundary, overflow, and malformed-schema
  suites.

Exit: independent deterministic models and real TEEs produce the same winner
for every golden vector without exposing losing fields.

### Phase 3 — Flare market and escrow

- [x] Implement the local `VeilBidFlareMarket` lifecycle and exact FTestXRP
  escrow model; live Coston2 proof remains required by the phase exit.
- [x] Resolve FTestXRP/AssetManager through supported Flare tooling and verify
  the live FTestXRP escrow path.
- [x] Implement contract-canonical public scoring policy plus conditional FTSO
  XRP/USD snapshot, official feed, freshness, decimals, and bounds locally.
- [x] Implement asynchronous close/request/result/finalize recovery locally.
- [x] Verify distinct threshold signers over the exact same domain digest in
  Foundry; registered live-machine verification remains pending.
- [x] Implement and unit-test winner payout, buyer remainder, zero-winner
  refund, and receipt.
- [ ] Add unit, fuzz, invariant, reentrancy, signer, root, nonce, and expiry tests.

Exit: a two-vendor Coston2 tender settles FTestXRP only through threshold FCC
selection and conserves the public escrow.

### Phase 4 — XRP-native buyer journey

- [x] Derive the user's PersonalAccount and current nonce.
- [x] Build the approval + create/fund `PackedUserOperation`.
- [x] Commit the user-op hash in an XRPL testnet `0xFE` payment memo.
- [x] Freeze the official Smart Account `0xFE` packed-user-operation builder and
  recovery `0xE0` memo encoder in the Flare bindings (local vectors only; no
  XRPL payment or FDC proof has been claimed).
- [x] Add the official nested `IXRPPayment.Proof` binding, domain/memo/payment
  validator, and `executeDirectMintingWithData` encoder (local codec vectors
  only; no FDC proof has been claimed).
- [x] Implement the dedicated fail-closed funding executor: XRPL three-ledger
  finality, registry discovery, live FDC fee/request/round/finalization, DA raw
  proof decoding, fee-aware amount validation, PersonalAccount/nonce checks,
  exact approve/create batch, delayed-mint classification, and three-event
  success proof (live Gate G evidence is recorded; delayed/stuck recovery UX
  remains open).
- [x] Obtain and verify the FDC `XRPPayment` proof.
- [x] Execute `executeDirectMintingWithData` atomically.
- [ ] Handle delayed mint, duplicate nonce, hash mismatch, and stuck-mint
  recovery UX.
- [ ] Add direct EVM funding as a recovery/developer path, not the flagship demo.

Exit: an XRPL-native buyer creates and funds the canonical tender without a
custodial VeilBid signer.

### Phase 5 — product UI and automation

- [x] Add fail-closed Coston2 public-market and XRP funding consumer adapters;
  the browser route remains on the verified Sepolia baseline until a Flare
  release manifest and live gates pass.
- [ ] Replace the Sepolia judge path with verified Coston2 bindings.
- [ ] Build XRP-native Buyer, EVM Buyer, Vendor, Public, Activity, and Evidence
  workspaces.
- [ ] Show verified extension, code version, TEE identities/key fingerprints,
  quorum, rule version, FTSO snapshot, and result digest.
- [ ] Build sealed bid composer with no plaintext persistence.
- [ ] Build public result/settlement and FXRP redemption journey.
- [x] Implement and unit-test stateless close/request/result/finalize relay and
  ciphertext-only vendor ingress; live Coston2 operation remains pending.
- [ ] Add explicit RPC/FCC/proxy/FDC/FTSO unavailable and recovery states.
- [ ] Complete responsive, keyboard, reduced-motion, and privacy-copy review.

Exit: every core role can complete its journey and judges can verify a finalized
tender without a wallet.

### Deferred after the core lifecycle — Buyer Brief clarity pass

This is intentionally scheduled after the live protocol gates and before the
judge-package UX pass. It improves buyer comprehension without changing the
confidential bid or settlement boundary:

- [ ] Add a structured Buyer Brief with title, category, public goal,
  acceptance criteria, delivery deadline, budget/asset, vendor eligibility,
  scoring weights, and optional vendor questions.
- [ ] Show a clear public/private map: brief and rules are public; bids,
  private answers, credentials, and losing commercial terms remain inside FCC.
- [ ] Commit the immutable `rulesHash` on-chain and explain it in the buyer and
  evidence views so a buyer cannot silently change the rules after bidding.
- [ ] Add judge-facing copy and examples that explain the procurement story in
  one screen without weakening the fail-closed privacy claims.

### Phase 6 — security and release evidence

- [ ] Publish exact source/runtime mapping and Coston2 release manifest.
- [ ] Verify extension image/code hash, governance, machines, and key policy.
- [ ] Run two-vendor and three-vendor lifecycles.
- [ ] Run invalid credential, invalid bid, tie, zero-winner, replay, wrong-domain,
  wrong-root, stale-FTSO, signer-loss, proxy restart, and competing-relay drills.
- [ ] Record gas, latency, bid-ingress, close-to-result, and recovery benchmarks.
- [ ] Run current/full-history secret and privacy-output scans.
- [ ] Generate Flare bindings and reject all drift.
- [ ] Deploy web/relay and record desktop/mobile/keyboard smoke evidence.

Exit: canonical manifest, bindings, source, runtime, extension, UI, and evidence
all agree and contain no confidential material.

### Phase 7 — product validation and distribution

- [ ] Conduct at least five structured interviews with XRP/DAO treasury users.
- [ ] Conduct at least five vendor usability tests.
- [ ] Recruit at least one pilot buyer or ecosystem design partner.
- [ ] Record problems, decisions, and changes without inventing traction.
- [ ] Publish a short integration guide for other procurement/treasury teams.
- [ ] Prepare Telegram/community updates and request Flare technical feedback.

Exit: the submission contains real user evidence, not only technical claims.

### Phase 8 — judge package

- [ ] Live Coston2 app and wallet-free finalized tender.
- [ ] Four-minute video following the single flagship journey.
- [ ] Architecture diagram and 60-second privacy/trust explanation.
- [ ] Before/after work ledger with commits and evidence.
- [ ] Contract addresses, extension ID, code hash, TEE identities, and transactions.
- [ ] Clear bounty selection and explanation of why every Flare integration is
  essential.
- [ ] Roadmap limited to credible mainnet, audit, liveness, and pilot work.

Exit: a judge can understand usefulness in 30 seconds, verify Flare depth in
two minutes, and reproduce the public path from the repository.

## 5. Quality bars

### Product

- No feature exists only to mention a Flare protocol.
- Flagship journey begins on XRPL and ends with an XRP-redeemable award.
- Multi-criteria inputs solve a real procurement need and remain deterministic.
- The app is usable on mobile and understandable without protocol knowledge.

### Confidentiality

- No bid plaintext or ciphertext is permanently published on-chain.
- No plaintext enters browser persistence, analytics, proxy logs, or evidence.
- TEE trust is explicit; no zero-knowledge or perfect-privacy claim.
- Winner and winning settlement amount are explicitly public.

### Correctness

- Client, buyer, relay, and admin cannot supply or override winner.
- Every bid and result is fully domain-bound and replay-protected.
- Threshold signers are distinct, registered, tender-fixed, and code-version
  compatible.
- Contract settlement conserves escrow exactly once.

### Reliability

- Every asynchronous checkpoint resumes from public state.
- Machine/key loss follows the frozen quorum policy.
- No mock success appears after dependency failure.
- External dependencies have health, timeout, and failure evidence.

### Submission truth

- Historical Sepolia/Nox work is separated from Summer Signal work.
- Only executed Coston2 capabilities are marked complete.
- Simulated TEE, organizer infrastructure, and residual trust are disclosed.
- Traction and feedback claims include real sources or remain absent.

## 6. Stop conditions

Stop and redesign before full build if:

- private bid ingress cannot be supported by the FCC environment;
- a signed result cannot be verified against a registered TEE identity;
- the extension cannot seal/recover bid state without plaintext storage;
- no common TEE quorum can hold every accepted bid;
- Smart Account/FDC direct mint cannot atomically fund the market;
- FTSO snapshot units/freshness cannot be deterministically bound;
- FTestXRP settlement cannot conserve escrow;
- the UI or relay must calculate a winner.

An optional feature may be removed after its isolated gate fails, but removal of
FCC selection, FTestXRP settlement, or the XRP-native flagship journey changes
the championship product and requires Product Plan approval.

## 7. Current status

| Area | Status |
|---|---|
| Product thesis | DECIDED |
| Architecture decisions | DECIDED |
| Documentation transition | COMPLETE |
| Official version pinning | PASSED for Gate 0 — core source/toolchain/discovery, pinned proxy/extension images, stable public origins, and live TEE stack are recorded |
| FCC foundation operation | LIVE PASSED — deterministic `PING_V1` result verified on Coston2 with registered signer/domain |
| FCC private ingress | LIVE PARTIAL — three-machine authenticated direct ingress, ECIES encryption, receipt binding, exact-retry idempotence, and changed-ciphertext rejection pass; supported same-identity restart recovery remains open |
| Multi-TEE quorum | LIVE PASSED for one three-bid lifecycle — atomic 3-of-3 receipts, common root, two matching frozen-TEE signatures, and one-machine resilience assertions recorded; same-identity restart remains open |
| Flare contracts | LIVE CANDIDATE PASSED — Coston2 market, FTestXRP escrow, FTSO snapshot, award receipt, and recovery wiring are exercised; canonical release verification remains open |
| FAssets/FDC/Smart Account journey | LIVE PASSED Gate G — disposable XRPL payment, FDC proof, Smart Account direct mint, and atomic tender funding are recorded in `gate-g-smart-account.json` |
| FTSO scoring | LIVE PASSED for the championship lifecycle — XRP/USD snapshot is bound to private multi-criteria selection and public settlement |
| Coston2 deployment/evidence | IN PROGRESS — Gates 0–G evidence recorded; Gate-B restart, release consistency, adversarial suites, UI, and Gate H remain open |
| User research/traction | NOT STARTED |

Implementation begins with Phase 0 and Phase 1. No later phase may be reported
as complete until its exit evidence exists.
