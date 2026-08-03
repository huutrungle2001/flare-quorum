# VeilBid Flare Build Plan

> Status: Planned. Feasibility Gates A–E are the active prerequisite.

## 1. Delivery strategy

The repository retains the verified Sepolia/Nox release as pre-hackathon
baseline and builds the Flare edition in new workspaces. This prevents package,
artifact, deployment, and evidence ambiguity while allowing the existing UI,
indexer, relay, and documentation patterns to be reused deliberately.

## 2. Target stack

- Network: Flare Testnet Coston2 (`114`), followed by Flare Mainnet only after
  testnet acceptance and explicit approval.
- Contracts: Solidity with the official Flare starter/periphery contract pattern.
- Confidential compute: Flare Compute Extension based on the official FCC
  scaffold and supported TEE/proxy stack.
- Extension implementation: Go by default; TypeScript is acceptable only if the
  selected official framework path supports every required production check.
- Client: React, viem/wagmi-compatible Flare network integration, injected
  wallets, and FCC public-key/encryption utilities.
- Asset: supported Coston2 test token first, then official FTestXRP.
- Automation: stateless public close/request/result/finalize relay.
- State: Flare chain events plus rebuildable caches; no application database.

Versions must be pinned from the chosen official examples at Gate A and recorded
in lockfiles and evidence. Do not copy historical Nox versions into the Flare
stack.

## 3. Milestones

### Milestone 0 — transition documentation

- [x] Record Sepolia/Nox as the pre-hackathon baseline.
- [x] Select Confidential Compute Apps as the primary bounty.
- [x] Define the public/private boundary for public FXRP settlement.
- [x] Define source priority, gates, target architecture, and evidence policy.
- [x] Publish the transition commit to the private Summer Signal repository.

### Milestone 1 — FCC feasibility

- [ ] Scaffold `apps/fcc-extension/` from an official FCC example.
- [ ] Scaffold `packages/flare-contracts/` with Coston2 configuration.
- [ ] Pass Gate A registered result verification.
- [ ] Pass Gate B ECIES bid round trip.
- [ ] Pass Gate C deterministic private selection.
- [ ] Pass Gate D public escrow settlement.
- [ ] Pass Gate E recovery.

Exit: a minimal two-vendor Coston2 lifecycle finalizes only through a registered
TEE-signed result and exposes no losing plaintext.

### Milestone 2 — production Flare contracts

- [ ] Implement `VeilBidFlareMarket` tender lifecycle.
- [ ] Implement ordered bid commitments and immutable submission slots.
- [ ] Implement FCC request/result state and signer/code-version policy.
- [ ] Implement escrow conservation, zero-winner refund, and replay guards.
- [ ] Implement non-transferable public award receipt.
- [ ] Add unit, invariant, signature, root-binding, lifecycle, and adversarial
  tests.

Exit: no function accepts an independent winner decision and no forbidden
plaintext state exists outside the TEE.

### Milestone 3 — product migration

- [ ] Generate `packages/flare-bindings` from canonical Flare artifacts.
- [ ] Switch the main web judge path to Coston2.
- [ ] Implement FCC key discovery, ECIES encoding, and encrypted bid submission.
- [ ] Implement buyer funding, vendor submission, public close, result polling,
  finalization, and recovery.
- [ ] Make unavailable/indexing/proxy states explicit without mock fallback.
- [ ] Preserve wallet-free tender and evidence inspection.

Exit: the complete Coston2 judge path is usable and responsive.

### Milestone 4 — FAssets interoperability

- [ ] Pass Gate F using FTestXRP.
- [ ] Add FAssets registry/address discovery.
- [ ] Add buyer funding and winner payout UX.
- [ ] Add an XRP redemption path or guided proof-backed handoff.
- [ ] Verify a real Coston2 lifecycle and document public settlement privacy.

Exit: FAssets is essential to an XRP-native procurement journey, allowing the
project to select the Interoperable Asset Products bounty.

### Milestone 5 — advanced Flare features

- [ ] Add fixed-schema private multi-criteria scoring.
- [ ] Add FTSO snapshot normalization if multi-currency bids are shipped.
- [ ] Add an FDC-bound milestone/payment release if a supported data source is
  shipped.
- [ ] Add a Flare Smart Account journey if the operator path is available and
  independently verified.
- [ ] Evaluate multi-TEE threshold result approval.

Each checkbox requires its own acceptance evidence. Features that do not pass
remain roadmap items and are excluded from judge claims.

### Milestone 6 — Coston2 release

- [ ] Deploy a new release from a clean, pushed source commit.
- [ ] Record contract addresses, extension ID, code/version hash, registered TEE
  identities, transactions, blocks, and immutable wiring.
- [ ] Verify source/runtime mapping and constructor/configuration state.
- [ ] Run two-vendor, invalid, tie, no-valid, replay, expiry, outage/recovery,
  and settlement tests.
- [ ] Publish generated bindings and sanitized evidence together.
- [ ] Deploy frontend and relay; run desktop/mobile/keyboard smoke checks.

### Milestone 7 — submission

- [ ] Prepare a four-minute product demo.
- [ ] Show pre-hackathon versus new-work ledger.
- [ ] Publish accurate privacy and trust boundaries.
- [ ] Include Coston2 addresses, extension identity/code version, transactions,
  GitHub material, live app, roadmap, and user/partner feedback.
- [ ] Select only the bounties whose acceptance gates passed.

## 4. Validation commands

Exact Flare workspace commands will be added by the scaffold commit. The target
root interface is:

```bash
pnpm flare:compile
pnpm flare:test
pnpm flare:lint
pnpm flare:build
pnpm flare:bindings:check
pnpm flare:extension:test
pnpm flare:verify:coston2
pnpm flare:evidence:validate
```

These commands are planned names, not currently implemented scripts.

## 5. Scope controls

- FCC selection and verified finalization come before FAssets, FDC, FTSO, or
  Smart Accounts.
- Do not rebuild confidential ERC-7984 semantics under a new name in the MVP.
- Do not add multi-currency scoring without deterministic fixed-point tests and
  a supported FTSO feed set.
- Do not add FDC unless a contract decision truly depends on the attested data.
- Do not add a database for canonical lifecycle or hidden bid storage.
- Do not add autonomous AI custody, subjective scoring, or winner authority.
