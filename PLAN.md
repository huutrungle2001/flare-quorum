# VeilBid Flare Championship Execution Plan

> Status: Phase 0 audit is implemented and pushed; FCC/TEE registration and
> external infrastructure gates remain open. Phase 1 foundation code is local
> and tested, but no Coston2 result is claimed until live evidence exists.
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

- [ ] Confirm organizer-supported FCC environment, indexer access, proxy
  requirements, and whether at least three registered TEE machines are
  available for one extension.
- [x] Confirm real confidential hardware versus simulated TEE judge policy.
- [x] Pin the official FCC scaffold commit and add a VeilBid tee-proxy release
  recipe whose official source archive, builder, and runtime are checksum or
  digest pinned.
- [x] Build that recipe on `linux/amd64`, verify the executable OCI manifest
  and extracted binary digest, and record sanitized Gate 0 image evidence.
- [ ] Apply [`docs/fcc-coston2-operations.md`](docs/fcc-coston2-operations.md):
  resolve live `FlareTeeManager`, enforce the organizer minimum TEE/proxy
  revisions, use a fresh extension ID and `rRap`, and reach machine status `2`.
- [ ] Obtain current indexer credentials and a named Cloudflare Tunnel or
  reserved ngrok domain; quick-tunnel URLs are forbidden for registration.
- [x] Pin Go, Foundry, Solidity, Node, pnpm, viem, and Flare periphery versions.
- [x] Record official Coston2 registry, FCC, FAssets, FTSO, and Smart Account
  discovery paths without hardcoding undocumented addresses.
- [ ] Obtain disposable Coston2, XRPL testnet, and executor identities.

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
- [ ] Send and verify a domain-correct Coston2 result.
- [x] Implement private bid ingress through the supported proxy/TEE path (local
  loopback crypto client and sealed store; live proxy proof remains open).
- [x] Return and verify one TEE-signed `BidReceipt` in the local extension
  harness; live registered-TEE verification remains open.
- [x] Prove sealed persistence across process restart in the local sealed-store
  tests; live three-machine recovery remains open.
- [ ] Prove three-machine selection and two matching signatures, or stop and
  document the exact infrastructure limitation.

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
- [ ] Resolve FTestXRP/AssetManager through supported Flare tooling.
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

- [ ] Derive the user's PersonalAccount and current nonce.
- [ ] Build the approval + create/fund `PackedUserOperation`.
- [ ] Commit the user-op hash in an XRPL testnet `0xFE` payment memo.
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
  success proof (local production-shaped tests only; Gate G remains unrun).
- [ ] Obtain the FDC `XRPPayment` proof.
- [ ] Execute `executeDirectMintingWithData` atomically.
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
| Official version pinning | IN PROGRESS — core source/toolchain/discovery and pinned proxy image checks pass; stable public origin and live TEE stack remain |
| FCC foundation operation | IMPLEMENTED LOCALLY — deterministic `PING_V1` tests pass; live Gate A not run |
| FCC private ingress | LOCAL IMPLEMENTATION — official direct envelope, browser/go-ethereum ECIES parity, EIP-712 ciphertext-only gateway authorization, atomic receipt verification, loopback decrypt/sign, and sealed restart/replay tests; no live proxy/TEE proof |
| Multi-TEE quorum | LOCAL IMPLEMENTATION — atomic 3-of-3 bid receipts, live identity/code/key rechecks, and 2-of-3 one-outage result path pass; live Gate C/E pending |
| Flare contracts | LOCAL IMPLEMENTATION — contract-derived/stored public scoring policy, FCC/FTestXRP/conditional-FTSO lifecycle, payout and recovery tests pass; no live deployment |
| FAssets/FDC/Smart Account journey | LOCAL EXECUTOR COMPLETE — live registry/FDC/direct-mint bindings pass; real XRPL payment, FDC proof, and Gate G execution pending |
| FTSO scoring | LOCAL CROSS-STACK IMPLEMENTATION — contract policy hash matches Go/TypeScript, XRP/USD conversion and scoring vectors pass; no live FCC/FTSO lifecycle |
| Coston2 deployment/evidence | NOT STARTED |
| User research/traction | NOT STARTED |

Implementation begins with Phase 0 and Phase 1. No later phase may be reported
as complete until its exit evidence exists.
