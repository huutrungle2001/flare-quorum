# FlareQuorum — Summer Signal submission

> Confidential procurement for XRP and Flare treasuries, powered by Flare
> Confidential Compute.

For copy-ready form fields, start with
[`README-FIRST.md`](README-FIRST.md) and
[`FLAREQUORUM-DORAHACKS-FORM.md`](FLAREQUORUM-DORAHACKS-FORM.md).

## Submission overview

| Required field | Submission |
|---|---|
| Project name | **FlareQuorum** |
| Selected bounties | **Confidential Compute Apps**; **Interoperable Asset Products** |
| Short description | Transparent procurement rules and FTestXRP escrow with encrypted vendor offers, deterministic private FCC scoring, threshold-signed selection, and public settlement evidence |
| Target users | XRP-native treasury operators, Flare DAOs/procurement teams, vendors protecting losing commercial terms, and auditors inspecting the result binding |
| Working demo | [flare-quorum.vercel.app](https://flare-quorum.vercel.app) |
| Wallet-free evidence | [Auditor workspace](https://flare-quorum.vercel.app/flare?role=evidence) |
| Source and technical material | [GitHub repository](https://github.com/huutrungle2001/flare-quorum) · [architecture](../../docs/architecture.md) · [verification](../../docs/verification.md) |
| Deployment | Flare Coston2 (`114`), verified V2 manifest |
| New-work disclosure | [`NEW-WORK-LEDGER.md`](NEW-WORK-LEDGER.md) |
| Roadmap | [Short roadmap](#roadmap) · [full plan](../../PLAN.md) |

FlareQuorum solves a concrete procurement problem: public offers expose vendor
strategy, while a conventional private server can secretly alter the winner.
The product makes rules, escrow, machine policy, commitments, result binding,
and settlement public while keeping losing price, delivery, warranty, and
qualification terms inside the intended confidential-compute boundary.

This is unaudited Coston2 software using disposable test assets and simulated
FCC machines. It is not a hardware-backed TEE, mainnet, production-security,
or private-token-transfer claim.

## Why users need it

- **Treasuries and procurement teams** get transparent rules, bounded escrow,
  deterministic selection, and a public award trail without operating a
  trusted winner service.
- **Vendors** can compete without revealing losing commercial terms to the
  buyer, other vendors, a finalizer, or the public evidence interface.
- **Auditors and ecosystem reviewers** can inspect the rule hash, ordered bid
  root, frozen FCC identity set, FTSO snapshot, matching result signers, and
  payout conservation without a wallet or bid-decryption capability.

The initial product wedge is technical and professional-service procurement by
XRP-native treasuries, Flare ecosystem teams, DAOs, and grants operations.

## Judge path — two minutes

1. Open [Public](https://flare-quorum.vercel.app). Confirm Coston2 V2, the
   market, FTestXRP, FCC extension, three machine fingerprints, and threshold.
2. Open [Auditor](https://flare-quorum.vercel.app/flare?role=evidence). Inspect
   the public rules hash, 3-of-3 receipt custody, ordered bid root, FTSO
   snapshot, 2-of-3 matching result signers, award/refund status, and escrow
   conservation. No bid payload is fetched.
3. Open [Buyer](https://flare-quorum.vercel.app/flare?role=buyer). Review direct
   FTestXRP funding and the XRP/FDC/Smart Account mint-and-fund path.
4. Open [Private Bids](https://flare-quorum.vercel.app/flare?role=vendor). Review
   the approved-wallet gate, public brief, machine binding, session-only bid
   inputs, and encrypted three-receipt path.
5. Open [Activity](https://flare-quorum.vercel.app/flare?role=finalizer). Confirm
   that close, FCC compute, and award/refund remain explicit public checkpoints
   and that completed actions cannot be replayed from the UI.

The working app is the canonical demo link required by the submission brief.
Judges can inspect a finalized lifecycle without test funds or credentials.

## Why the Flare integration is essential

| Flare capability | Essential product responsibility | Current evidence |
|---|---|---|
| Flare Confidential Compute | Receives encrypted offers, verifies private qualification inputs, compares eligible bids, and selects the deterministic winner; the browser/buyer/finalizer cannot provide a winner | [`market-v2-refresh-multi-vendor-success.json`](../../evidence/coston2/market-v2-refresh-multi-vendor-success.json) |
| Coston2 contracts | Freeze rules and machine identities, conserve escrow, verify threshold results, and record award/refund state | [`coston2.release.json`](../../packages/flare-contracts/deployments/coston2.release.json) |
| FAssets / FTestXRP | Provides the XRP-backed test asset for mint, escrow, payout, and the official `RedemptionRequested` boundary | [`fassets-redemption.release.json`](../../evidence/coston2/fassets-redemption.release.json) |
| FDC | Proves the XRPL payment authorizing the XRP-native mint-and-fund operation | [`gate-g-smart-account.json`](../../evidence/coston2/gate-g-smart-account.json) |
| FTSOv2 | Freezes XRP/USD at close so private XRP/USD offers use one public conversion checkpoint | [`gate-c-e-f-three-vendor.json`](../../evidence/coston2/gate-c-e-f-three-vendor.json) |
| Flare Smart Accounts | Atomically binds the XRPL instruction, direct mint, approval, and tender funding without FlareQuorum custody | [`gate-g-smart-account.json`](../../evidence/coston2/gate-g-smart-account.json) |

Removing FCC restores operator winner authority. Removing the interoperability
path breaks the demonstrated XRP-native funding/settlement journey. These are
product dependencies, not decorative protocol calls.

## Existing project and Summer Signal work

| Category | Boundary | Evidence and user value |
|---|---|---|
| Existed before | Historical Sepolia/Nox confidential procurement, Safe funding, web, relay, bindings, and evidence | Retained under `packages/contracts/`, `packages/chain-bindings/`, and `evidence/sepolia/`; never used as Coston2 proof |
| Newly built | Go FCC extension, private ingress, signed receipt quorum, Flare market/contracts, Coston2 bindings, and role workspaces | Makes FCC selection and public verification part of a usable Flare product |
| Ported | Public explorer, role shell, and stateless recovery patterns | Preserves useful product behavior while changing the chain and compute trust model |
| Integrated | FAssets/FTestXRP, FDC, FTSOv2, and Smart Accounts | Creates one XRP-native funding, scoring, payout, and redemption story |
| Improved | Multi-criteria scoring, 3-of-3 bid custody, 2-of-3 result agreement, strict replay domains, bounded refunds, and rolling machine replacement | Prevents weaker receipt sets, client winners, stale retries, and indefinite escrow lock |

The full commit- and artifact-level disclosure is in
[`NEW-WORK-LEDGER.md`](NEW-WORK-LEDGER.md).

## Verified deployment

| Fact | Value |
|---|---|
| Network | Flare Coston2, chain `114` |
| Market | [`0xE1252D445ee86ED78C1da2bD5f1bF4a69bF476AC`](https://coston2-explorer.flare.network/address/0xE1252D445ee86ED78C1da2bD5f1bF4a69bF476AC) |
| Award receipt | [`0xA0249F4204503dcB9FE3A3153d7D48936E7a4Ac3`](https://coston2-explorer.flare.network/address/0xA0249F4204503dcB9FE3A3153d7D48936E7a4Ac3) |
| FTestXRP | [`0x0b6A3645c240605887a5532109323A3E12273dc7`](https://coston2-explorer.flare.network/address/0x0b6A3645c240605887a5532109323A3E12273dc7) |
| FCC manager | [`0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE`](https://coston2-explorer.flare.network/address/0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE) |
| FCC release | extension `66142`, code version `v0.2.2`, three simulated machines, 3-of-3 bid receipts, 2-of-3 result |
| Release authority | [`packages/flare-contracts/deployments/coston2.release.json`](../../packages/flare-contracts/deployments/coston2.release.json) |

The verified V2 manifest, generated bindings, hosted consumers, and sanitized
evidence identify the same release. V1 and Sepolia/Nox remain historical only.

## Technical execution and evidence

- Three-vendor private-selection success:
  [`market-v2-refresh-multi-vendor-success.json`](../../evidence/coston2/market-v2-refresh-multi-vendor-success.json)
- One-result-endpoint outage with threshold finalization:
  [`market-v2-refresh-one-result-outage.json`](../../evidence/coston2/market-v2-refresh-one-result-outage.json)
- Invalid private credential rejected by all three machines, then corrected:
  [`market-v2-refresh-invalid-credential.json`](../../evidence/coston2/market-v2-refresh-invalid-credential.json)
- Bounded pre-dispatch and post-dispatch refunds:
  [`market-v2-undispatched-refund.json`](../../evidence/coston2/market-v2-undispatched-refund.json) and
  [`market-v2-selection-expired-refund.json`](../../evidence/coston2/market-v2-selection-expired-refund.json)
- Rolling three-machine replacement and exact current binding:
  [`fcc-market-v2-machines-refresh.json`](../../evidence/coston2/fcc-market-v2-machines-refresh.json)
- Hosted web, accessibility, and owner-operated website acceptance:
  [`web-v2-production-smoke.json`](../../evidence/coston2/web-v2-production-smoke.json),
  [`web-v2-keyboard-accessibility.json`](../../evidence/coston2/web-v2-keyboard-accessibility.json), and
  [`website-acceptance.release.json`](../../evidence/coston2/website-acceptance.release.json)

Evidence contains public identifiers, hashes, blocks, statuses, commitments,
and Boolean assertions. It excludes losing bid plaintext/ciphertext,
credentials, wallet/TEE keys, signatures forbidden by policy, and provider
credentials.

## Product validation and distribution

The project owner completed the release-facing Buyer, Public, Private Bids,
Activity, and Auditor journeys on the deployed Coston2 website after the final
cross-workspace synchronization fixes. No blocking defect was observed in that
tested scope; Gate H records this as owner-operated acceptance.

Independent buyer interviews, vendor usability studies, pilots, adoption, and
traction are not claimed. They remain explicit post-Summer Signal work in
[`VALIDATION-PLAN.md`](VALIDATION-PLAN.md). This boundary avoids converting
self-testing into external-user evidence.

## Roadmap

1. Conduct external treasury interviews and vendor usability sessions, then
   pursue one honest Coston2 design-partner pilot.
2. Expand browser-native XRP recovery, wallet coverage, live fault injection,
   and longer-retention privacy/log reviews.
3. Replace simulated FCC operation with a hardware-backed, independently
   reviewed deployment model before production-value custody.
4. Validate mainnet FXRP mint/redemption and formal security assumptions.
5. Extend the proven procurement foundation toward milestone-based treasury
   execution using objective FDC attestations, bounded release/refund, and the
   same private-offer threshold discipline.

## Honest release boundary

Complete: verified V2 runtime/wiring, encrypted three-machine ingress, atomic
all-three bid receipts, deterministic private scoring, FTSO binding, two-TEE
finalization, FTestXRP conservation, XRP-native FDC/Smart Account funding,
official FAssets redemption request, both bounded refund paths, hosted app and
ingress, replacement recovery, and owner-operated website acceptance.

Not claimed: hardware-backed TEEs, same-identity restoration, confidential
ordinary token transfers, instant underlying XRP redemption payout, verified
service delivery, formal audit, production security, mainnet readiness,
external user validation, partnership, adoption, or traction.

## Reproduce public checks

```bash
corepack pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm build
pnpm evidence:validate
pnpm flare:judge:check
```

Live write harnesses require explicit operator configuration and should not be
rerun merely to inspect the submission. The checked-in sanitized evidence and
wallet-free deployed app are the public judge path.
