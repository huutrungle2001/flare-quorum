# FlareQuorum Championship Execution Plan

> Status: Phase 0, Gates 0–A, live Gate-B ingress/replay, the core Gates C–F
> lifecycle, and Gate G pass on Coston2. Three stable Railway FCC origins accept encrypted bids and
> return domain-bound receipts; the current Railway ingress fronts that path for
> browser ciphertext, while a three-bid, two-signature lifecycle proves
> common quorum, private scoring, threshold finalization, FTSO binding, and
> exact FTestXRP settlement. The XRP-native run also proves an XRPL `0xFE`
> payment, FDC proof, Smart Account direct mint, and atomic tender funding.
> The organizer-confirmed restart model is replacement registration, not
> same-identity restoration; a full three-machine rolling replacement drill now
> passes on Coston2. A one-result-endpoint outage recovery, verified release, hosted
> ingress, public Evidence workspace, wallet-free Coston2 judge smoke, and
> read-only live negative guards are live. The unified Buyer deployment,
> wallet-ready XRP Payment/job preview, hosted desktop/mobile/keyboard smokes,
> and captioned judge video are shipped. Browser-native signing and
> executor recovery plus additional stateful fault-drill breadth are planned
> post-Summer Signal hardening; Gate H user validation remains `NOT_RUN`.
> A review found that the verified V1 market can remain `Closed` indefinitely
> when its first selection dispatch cannot obtain two active frozen TEEs. The
> side-by-side `FlareQuorumMarketV2` candidate now has bounded pre-dispatch
> recovery, comprehensive contract tests, a verified live deployment, fresh
> extension `66142`, three fresh production machines, a passed live three-vendor
> success lifecycle, a passed one-result-endpoint outage recovery, and a passed
> live invalid-credential rejection/retry drill. Its real
> undispatched-refund tender is waiting for the fixed
> on-chain grace before promotion can be verified. V1 remains the canonical
> Coston2 submission release and consumer default. A separate optional
> post-dispatch recovery tender (`5`) is also live in `ComputePending` and is
> honestly `WAITING` for its own fixed first-dispatch grace; it adds fault
> breadth but is not a new promotion blocker.
> The 2026-08-12 FCC known-good recheck adds a new judge-time operations blocker:
> status `2` is insufficient while availability is expired, and the current V1
> runtime predates the dependency set pinned by current scaffold `main`. Local
> preflight now verifies provider `POST /instruction` reachability, `<6h`
> availability, one identity per endpoint, and exact scaffold pins. Refresh the
> three machines by rolling replacement and record new evidence before the next
> public deployment; do not rewrite the historical V1 evidence.
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

**Product:** FlareQuorum

**One-line pitch:** XRP treasuries fund procurement from XRPL, vendors submit
private multi-criteria offers, a quorum of Flare TEEs selects the best eligible
offer under a public deterministic rule, and the winner receives FTestXRP on
Coston2 with a publicly verifiable award.

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
- [x] Pin the official FCC scaffold commit and add a FlareQuorum tee-proxy release
  recipe whose official source archive, builder, and runtime are checksum or
  digest pinned.
- [x] Build that recipe on `linux/amd64`, verify the executable OCI manifest
  and extracted binary digest, and record sanitized Gate 0 image evidence.
- [x] Pin and build the FlareQuorum FCC extension image, keep production
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
  verify live three-machine authenticated ciphertext-only receipts; replacement
  registration is the supported restart model and its rolling live drill passes.
- [x] Return and verify TEE-signed `BidReceipt` values in the local extension
  harness and live registered-TEE ingress; the public-safe hosted-log review and
  supported replacement evidence are recorded.
- [x] Prove sealed persistence across process restart in the local sealed-store
  tests; live recovery replaces and re-registers all three identities without
  claiming unsupported same-identity restoration.
- [x] Prove three-machine selection and two matching signatures in the live
  Coston2 lifecycle; an existing tender remains fail-closed if two frozen
  identities are lost.

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
- [x] Add unit, fuzz, reentrancy, signer, root, nonce, and expiry tests.
- [x] Add a dedicated stateful multi-tender conservation harness covering
  award, zero-winner refund, and cancellation outcomes.

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
- [x] Handle delayed mint, duplicate nonce, hash mismatch, and stuck-mint
  recovery through a public-safe executor checkpoint and `flare:funding:resume`;
  duplicate payments, nonce drift, quote drift, and commitment drift fail closed.
- [x] Persist a browser-safe XRP funding checkpoint containing only the public
  XRPL owner, payment hash, wallet ID, and executor fee so a reload can rebuild
  the same public payment handoff without retaining a secret, bid, or ciphertext.
- [x] Add direct EVM funding as a recovery/developer path, not the flagship demo;
  the Buyer workspace keeps it explicitly labeled as EVM recovery.

Exit: an XRPL-native buyer creates and funds the canonical tender without a
custodial FlareQuorum signer.

### Phase 5 — product UI and automation

- [x] Build the two-shell Flare UI: a standalone landing page and a separate
  FlareQuorum-style tender room with a fixed left workspace/asset rail. The rail
  exposes Public, unified Buyer, Private Bids, Activity, and Auditor, plus
  compact wallet assets, help, and the Coston2 faucet. One global refresh action
  and wallet access remain in the header; Sepolia-only vcUSDC controls are
  omitted and FXRP redemption stays contextual to the winning vendor workspace.

- [x] Add fail-closed Coston2 public-market and XRP funding consumer adapters;
  the browser route is now backed by the verified Coston2 release.
- [x] Replace the Sepolia judge path with verified Coston2 bindings for `/` and
  `/flare`; `/room` remains explicitly historical.
- [x] Build the current-release role workspaces: the wallet-free Public dossier,
  unified Buyer with direct Coston2 and XRP-native funding choices, Vendor,
  Public Finalizer, and Auditor/Evidence paths. The Buyer includes a wallet-ready
  public-safe XRP `0xFE` Payment/job/memo preview, optional GemWallet Testnet
  signing/submission, and explicit reload-safe public checkpoint resume. The old
  `?role=treasury` URL remains a compatibility alias into Buyer. Hosted
  production, role, mobile, 320px keyboard/accessibility, XRP draft, and
  reload-checkpoint smoke evidence pass. Browser-native executor recovery and
  broader wallet coverage remain a separate post-Summer Signal hardening track.
- [x] Show verified extension, code version, TEE identities/key fingerprints,
  quorum, rule version, FTSO snapshot, result digest, and sanitized FAssets/FDC/
  Smart Account bindings in the wallet-free Flare dossier.
- [x] Add dedicated Public Finalizer and Auditor/Evidence workspaces that reread
  finalized checkpoints and expose rules hash, per-bid receipt quorum, ordered
  root, FTSO snapshot, FCC binding, result digest, payout/remainder, and
  award/refund state without bid payloads. Browser writes are limited to
  canonical close/cancel/refund calls; FCC dispatch and result grouping remain
  relay-only.
- [x] Build the Coston2 sealed bid composer with browser-only ECIES encryption,
  three authenticated ingress requests, three signed receipt checks, and an
  atomic on-chain receipt submission; browser storage and public payloads never
  receive plaintext or ciphertext.
- [x] Build the public result/settlement and FXRP redemption journey: the
  awarded vendor can approve the exact FTestXRP amount and submit the official
  `redeemAmount` request to AssetManagerFXRP; live Coston2 evidence is recorded
  in `evidence/coston2/fassets-redemption.release.json`.
- [x] Implement and unit-test stateless close/request/result/finalize relay and
  ciphertext-only vendor ingress; the hosted v2 ingress health and result API
  are live on Railway, while write-settlement relay operation remains gated on a
  dedicated finalizer environment.
- [x] Add explicit RPC/FCC/proxy/FDC/FTSO unavailable and recovery states to the
  Flare reader, relay, funding, and ingress adapters.
- [x] Complete the responsive, keyboard, reduced-motion, privacy-copy, and
  role-workspace review; production desktop/mobile smoke and the 320px keyboard
  evidence pass in `evidence/coston2/web-production-smoke.json` and
  `evidence/coston2/web-keyboard-accessibility.json`. The public-safe XRP job
  preview and explicit reload-safe public checkpoint resume are live, while
  browser-native XRPL signing/submission remains explicitly outside the app
  custody boundary.

Exit: every core role can complete its journey and judges can verify a finalized
tender without a wallet.

### Deferred after the core lifecycle — Buyer Brief clarity pass

This is intentionally scheduled after the live protocol gates and before the
judge-package UX pass. It improves buyer comprehension without changing the
confidential bid or settlement boundary:

- [x] Add a structured Buyer Brief with title, category, public goal,
  acceptance criteria, delivery deadline, budget/asset, vendor eligibility,
  scoring weights, and optional vendor questions.
- [x] Show a clear public/private map: brief and rules are public; bids,
  private answers, credentials, and losing commercial terms remain inside FCC.
- [x] Commit the canonical brief hash plus immutable `rulesHash` on-chain and
  explain both in the buyer and evidence views so a buyer cannot silently
  change the rules after bidding.
- [x] Add judge-facing copy and examples that explain the procurement story in
  one screen without weakening the fail-closed privacy claims.

### Phase 6 — security and release evidence

- [x] Publish exact source/runtime mapping and the verified Coston2 release
  manifest.
- [x] Verify extension image/code hash, governance, machines, and key policy.
- [x] Run a two-vendor lifecycle with both encrypted bids, three-machine
  receipts, FCC selection, threshold finalize, and conserved FTestXRP; live
  evidence is `evidence/coston2/gate-c-e-f-two-vendor.json`.
- [x] Run a three-vendor lifecycle with the same private multi-criteria and
  threshold path; live evidence is
  `evidence/coston2/gate-c-e-f-three-vendor.json`.
- [x] Run the three-vendor recovery variant with one result endpoint
  intentionally unavailable; two remaining frozen TEE results finalized the
  tender in `evidence/coston2/three-vendor-recovery.release.json`.
- [x] Record the current-release invalid credential, invalid bid, tie,
  zero-winner, replay, wrong-domain, wrong-root, stale-FTSO, signer-loss, proxy
  restart, and competing-relay evidence boundary. Local Go/Forge/relay
  rejection suites are recorded in
  `evidence/local/flare-adversarial-coverage.json`; live read-only terminal and
  zero-term guard calls are recorded in
  `evidence/coston2/live-negative-calls.release.json`; the local Docker
  identity-rotation boundary and fail-closed two-machine-loss drill are
  recorded in `evidence/local/fcc-local-tee-restart-boundary.json` and
  `evidence/local/fcc-local-two-machine-loss.json`. Additional stateful
  Coston2 fault injection and live two-machine-loss drills are planned
  post-Summer Signal hardening; replacement-process recovery passes in
  `evidence/coston2/fcc-replacement-recovery.json`.
- [x] Record public gas, block-latency, close-to-result, recovery, and
  independently measured bid-ingress benchmarks from live Coston2 lifecycles in
  `evidence/coston2/performance-benchmarks.release.json` and
  `evidence/coston2/bid-ingress-benchmark.release.json`; the timings are
  operational measurements, not an SLA.
- [x] Run current/full-history secret and privacy-output scans.
- [x] Add the side-by-side `FlareQuorumMarketV2` local candidate with
  `closedAt`, a fixed undispatched refund grace, explicit refund reasons, and
  unit/fuzz/reentrancy/stateful conservation coverage without rewriting V1;
  public-safe local results are recorded in
  `evidence/local/flare-market-v2-liveness.json`.
- [x] Gate the V2 candidate in CI with pinned Slither `0.11.6`; fail on every
  unsuppressed medium/high finding and keep the two reviewed exceptions scoped
  to their exact detector and function.
- [x] Re-resolve `FtsoV2` from the live Flare registry before deployment or
  promotion, and reject any unexpected active FCC identity/route before machine
  registration; the complete post-registration set must be exactly three.
- [x] Deploy the isolated V2 candidate side-by-side, register fresh extension
  `66142` and exactly three fresh production machines, verify governance and
  runtime bindings, pass the live three-vendor encrypted-bid success lifecycle,
  and prove two remaining result endpoints still finalize when one is excluded,
  without changing V1. The undispatched-refund tender is closed and honestly remains
  `WAITING` until its fixed on-chain grace elapses; promotion and consumer
  switching remain separate gates.
- [x] Prove all three V2 machines reject a sealed bid signed by the wrong
  credential issuer, verify each signed rejection against its expected TEE,
  then accept the corrected credential on the same canonical slot without
  persisting credential, signature, plaintext, or ciphertext evidence.
- [x] Generate Flare bindings and reject all drift.
- [x] Deploy the current Flare web judge and record desktop/mobile/keyboard smoke evidence;
  the separate Coston2 write-relay deployment remains gated on its dedicated
  finalizer environment, and the browser ingress is a separate hosted Railway
  service with server-only FCC credentials. Its live `/health` route rereads
  finalized tender 23 and fails closed unless all three frozen machine
  identities, code version, URLs, and key fingerprints still match.

Exit: canonical manifest, bindings, source, runtime, extension, UI, and evidence
all agree and contain no confidential material.

### Phase 7 — product validation and distribution

- [ ] Conduct at least five structured interviews with XRP/DAO treasury users.
- [ ] Conduct at least five vendor usability tests.
- [ ] Recruit at least one pilot buyer or ecosystem design partner.
- [ ] Record problems, decisions, and changes without inventing traction.
- [x] Publish [`docs/integration-guide.md`](docs/integration-guide.md) for
  procurement/treasury teams and infrastructure partners.
- [x] Prepare [`submission/flare/COMMUNITY-UPDATE.md`](submission/flare/COMMUNITY-UPDATE.md)
  and [`submission/flare/VALIDATION-PLAN.md`](submission/flare/VALIDATION-PLAN.md);
  sending the draft and collecting organizer/user feedback are builder-
  controlled external actions and are not claimed as complete.

Exit: the submission contains real user evidence, not only technical claims.

### Phase 8 — judge package

- [x] Live Coston2 app and wallet-free finalized tender.
- [x] Four-minute captioned video following the single flagship journey is
  checked in at `submission/flare/flare-quorum-demo.mp4`; it uses live public
  smoke captures and states the testnet/simulated-TEE limits.
- [x] Architecture diagram and 60-second privacy/trust explanation in
  `submission/flare/PRIVACY-TRUST-TALK.md`.
- [x] Before/after work ledger with commits and evidence in
  `submission/flare/NEW-WORK-LEDGER.md`.
- [x] Contract addresses, extension ID, code hash, TEE identities, and
  transactions in `submission/flare/README.md`.
- [x] Clear bounty selection and explanation of why every Flare integration is
  essential in `submission/flare/README.md`.
- [x] Roadmap limited to credible mainnet, audit, liveness, and pilot work;
  future promotion criteria are explicitly separated from current gates.

Exit: a judge can understand usefulness in 30 seconds, verify Flare depth in
two minutes, and reproduce the public path from the repository.

### Gate classification at handoff

| Gate or track | Classification | Recorded state |
|---|---|---|
| Gates 0–G | Current Summer Signal technical acceptance | Passed with the cited Coston2 evidence |
| Gate H | Current product and user-validation gate | `NOT_RUN`; no interview, usability, or traction result is claimed |
| Organizer submission and bounty-selection actions | External submission actions | Builder-controlled; not an engineering pass/fail result |
| V2 live release promotion | Isolated current candidate track | Candidate address, extension, three fresh machines, governance, three-vendor success, one-result-endpoint outage recovery, and invalid-credential rejection/retry are live; refund is `WAITING` for its fixed on-chain grace, so no verified release or consumer switch is claimed |
| Additional live fault breadth and browser-native XRP recovery | Planned post-Summer Signal hardening | The current recorded drills and public-safe wallet handoff remain the submission boundary |
| Flare Treasury Exchange | Planned post-Summer Signal product expansion | Roadmap only |

### Phase 9 — isolated upgrades beyond the verified V1 release

This phase is separate from the verified V1 release. Its V2 candidate track may
produce current engineering evidence, but it must not be presented as a verified
or consumer-selected release until its own Coston2 gates pass. The Treasury
Exchange bullets remain a post-competition roadmap.

#### 9.0 — staged V2 release promotion

- [x] Deploy `FlareQuorumMarketV2` alongside the immutable verified V1 release.
- [x] Register a fresh FCC extension and exactly three fresh TEE machines
  without reusing or pausing the V1 machine set.
- Publish a V2-specific manifest and generated bindings only after source,
  runtime, registry, extension, code-version, machine, and signer checks agree.
- [x] Record the three-vendor flagship success lifecycle with public-safe Coston2 evidence.
- [x] Record a second three-vendor lifecycle where one result endpoint is
  excluded and the other two frozen identities still finalize the exact digest.
- [x] Record a live sealed-bid invalid-credential drill across all three fresh
  machines and prove a rejected attempt does not consume its canonical slot.
- Resume the already closed tender after its real 24-hour grace and record the
  bounded pre-dispatch full-refund lifecycle.
- Complete the separate post-dispatch tender `5` after chain timestamp
  `1786553311` and record `SelectionExpired`, exact escrow return, and no award;
  this optional fault proof is `WAITING`, not a V2 promotion requirement.
- Expand stateful Coston2 fault injection, live two-machine-loss coverage,
  and browser-native XRP recovery without weakening the current fail-closed
  boundary.
- Promote V2 only after its release gate passes; switching consumers remains
  a separate explicit release decision.

#### 9.1 — Flare Treasury Exchange direction

**Product direction:** evolve the private procurement engine into **Flare
Treasury Exchange**, a treasury execution network for intents that require a
private offer, objective completion proof, and cross-chain settlement. A buyer
intent describes the outcome, budget, deadline, and public acceptance policy;
approved vendors, solvers, or executors submit private offers; escrow releases
only against a frozen milestone proof.

The existing FlareQuorum market remains the championship vertical slice. Its
FCC ingress, receipt quorum, deterministic selection, FTSO binding, Smart
Account funding, FDC proof adapters, settlement, and public evidence are the
technical foundation. The historical predecessor repository remains read-only and
is never changed as part of this roadmap.

#### 9.2 — product discovery and boundary

- Interview treasury operators, DAO operations teams, and service
  providers to select one narrow pilot (for example, an on-chain deployment
  or XRPL payment operation) rather than a generic task marketplace.
- Define the public `INTENT_SCHEMA_V1`: objective, budget, asset, deadline,
  approved participants, milestone amounts, and deterministic acceptance
  predicates.
- Define the private `OFFER_SCHEMA_V1`: price, execution route, delivery
  estimate, credentials, and one-time nonce; preserve the same ciphertext,
  plaintext, and browser-persistence prohibitions as the championship path.
- Keep the product vocabulary explicit: `Intent`, `Offer`, `Milestone`,
  `Attestation`, `Release`, and `Refund`; do not silently relabel the current
  tender ABI or its historical evidence.

#### 9.3 — milestone escrow vertical slice

- Implement a separate non-upgradeable `MilestoneEscrow` or equivalent
  module whose public state contains only the intent, milestone amounts,
  deadlines, proof type, proof commitment, and release/refund state.
- Start with one objectively verifiable proof type (`EVMTransaction` or
  `XRPPayment`) and a two- or three-milestone flow. Add `Web2Json` only after
  an allowlisted source, transformation, freshness bound, and outage behavior
  are documented.
- Bind every release proof to chain, escrow, intent, milestone, recipient,
  amount, rules hash, attestation round, and one-time release nonce.
- Make timeout, failed proof, duplicate proof, replay, partial payout, and
  buyer cancellation/refund fail closed; conserve escrow exactly once.
- Keep milestone amounts public. Do not claim private token settlement or
  private payout amounts without a separately verified mechanism.

#### 9.4 — private offer and executor workflow

- Reuse the FCC private-ingress pattern, but create a new intent/offer
  domain and result schema instead of extending the championship tender
  winner ABI in place.
- Let FCC evaluate deterministic cost, route, credential, and deadline
  predicates; no browser, buyer, relay, or AI model may choose the executor.
- Preserve a common frozen machine quorum and threshold-signed result for
  executor selection, with fresh nonce/expiry recovery after proxy or machine
  failure.
- Add an executor workspace that can prepare a public-safe XRPL `0xFE`
  operation or an EVM action without receiving an XRPL secret or private bid.
- Use FTSO only for a fresh, explicitly bound conversion/risk input and FDC
  only for a verifiable external fact; every dependency must have an unavailable
  and recovery state.

#### 9.5 — XRP-native settlement and pilot

- Run the complete Coston2 path: XRPL Payment → FDC proof → Smart Account
  funding → private FCC offer selection → milestone attestation → FTestXRP or
  FXRP release → official redemption where supported.
- Add a public evidence view for intent hash, milestone proof, attestation
  round, release/refund conservation, result digest, and recovery checkpoints;
  never expose offer plaintext, ciphertext, or private credentials.
- Conduct at least five treasury interviews, five provider usability tests,
  and one honest design-partner pilot before claiming product usefulness.
- Publish a new-work ledger that separates the current FlareQuorum foundation,
  ported Flare components, and newly built Treasury Exchange contracts,
  extension commands, bindings, UI, and evidence.
- Treat mainnet FXRP, production custody, formal audit, SLA, and legal
  delivery arbitration as later roadmap items, not MVP claims.

**V2 track exit:** its separate verified release, fresh FCC identity set, live
success/refund evidence, and consumer-promotion decision all agree without
changing V1 authority.

**Treasury Exchange track exit:** one real Coston2 intent with at least two
private offers and two objective milestones completes selection, proof
verification, release or refund, and public-safe recovery without weakening any
championship privacy or threshold invariant.

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
| FCC private ingress | LIVE PASSED — three-machine authenticated direct ingress, ECIES encryption, receipt binding, exact-retry idempotence, changed-ciphertext rejection, and supported rolling replacement recovery pass |
| Multi-TEE quorum | LIVE PASSED for one three-bid lifecycle — atomic 3-of-3 receipts, common root, two matching frozen-TEE signatures, and one-machine resilience assertions recorded; replacements never mutate an existing frozen set |
| Flare contracts | V1 LIVE VERIFIED AND DEFAULT; V2 LIVE CANDIDATE — market `0xE1252D445ee86ED78C1da2bD5f1bF4a69bF476AC`, extension `66142`, three fresh production machines, governance, runtime/wiring, and three-vendor success lifecycle pass; refund is time-locked `WAITING`, so V2 is not yet a verified or consumer-selected release |
| FAssets/FDC/Smart Account journey | LIVE PASSED Gate G plus redemption request — disposable XRPL payment, FDC proof, Smart Account direct mint, atomic tender funding, official amount-based FTestXRP redemption request, and fail-closed delayed-mint checkpoint/resume are implemented; evidence is recorded in `gate-g-smart-account.json` and `fassets-redemption.release.json` |
| FTSO scoring | LIVE PASSED for the championship lifecycle — XRP/USD snapshot is bound to private multi-criteria selection and public settlement |
| Coston2 deployment/evidence | CURRENT RELEASE VALIDATED; GATE H IN PROGRESS — Gates 0–G and verified deployment evidence recorded; the unified Buyer deployment, wallet-free judge/role/accessibility/XRP smokes, fail-closed hosted ciphertext-ingress health, market-machine preflight, rolling FCC replacement recovery, and a read-only hosted runtime-log review pass; additional live fault breadth and browser-native XRP recovery are planned post-Summer Signal hardening, while Gate H user validation remains `NOT_RUN` |
| User research/traction | NOT STARTED |

Implementation begins with Phase 0 and Phase 1. No later phase may be reported
as complete until its exit evidence exists.
