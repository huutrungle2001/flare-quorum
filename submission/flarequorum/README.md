# FlareQuorum — Summer Signal Judge Package

This is the only current submission package. It covers the verified,
consumer-selected Flare Coston2 V2 release. Obsolete VeilBid submission media,
recording guides, and drafts are intentionally excluded.

## Start here

| Resource | Link |
| --- | --- |
| Live app | [flare-quorum.vercel.app](https://flare-quorum.vercel.app) |
| Wallet-free evidence | [Auditor workspace](https://flare-quorum.vercel.app/flare?role=evidence) |
| Four-minute demo | [`flare-quorum-demo.mp4`](flare-quorum-demo.mp4) |
| Source | [github.com/huutrungle2001/flare-quorum](https://github.com/huutrungle2001/flare-quorum) |
| Verified manifest | [`coston2.release.json`](../../packages/flare-contracts/deployments/coston2.release.json) |
| Verification matrix | [`docs/verification.md`](../../docs/verification.md) |
| New-work ledger | [`NEW-WORK-LEDGER.md`](NEW-WORK-LEDGER.md) |
| Privacy boundary | [`PRIVACY-TRUST-TALK.md`](PRIVACY-TRUST-TALK.md) |
| Validation status | [`VALIDATION-PLAN.md`](VALIDATION-PLAN.md) |
| Website acceptance | [`website-acceptance.release.json`](../../evidence/coston2/website-acceptance.release.json) |

The app uses Coston2 chain ID `114` and disposable test assets. Public
inspection requires no wallet. This is simulated-TEE, unaudited hackathon
software, not a mainnet or production-security claim.

## Submission copy

> FlareQuorum lets XRP and Flare treasuries publish transparent procurement
> rules and escrow FTestXRP while approved vendors submit encrypted offers to
> three registered Flare Confidential Compute machines. The market pays only
> after two tender-fixed TEEs sign the same deterministic result.

Selected bounties:

- Primary: **Confidential Compute Apps**.
- Secondary: **Interoperable Asset Products**, supported by the recorded XRPL
  payment → FDC `XRPPayment` proof → Smart Account `0xFE` direct mint and
  fund → FTestXRP settlement → official FAssets redemption-request path.

FCC performs eligibility, comparison, and winner selection from sealed state.
The browser, buyer, relay, and finalizer cannot provide a winner. FTSO fixes the
XRP/USD close snapshot. FDC and Smart Accounts bind XRP-native funding, while
FAssets supplies the XRP-backed asset and redemption boundary.

## Verified deployment

| Fact | Value |
| --- | --- |
| Network | Flare Coston2, chain `114` |
| Market | [`0xE1252D445ee86ED78C1da2bD5f1bF4a69bF476AC`](https://coston2-explorer.flare.network/address/0xE1252D445ee86ED78C1da2bD5f1bF4a69bF476AC) |
| Award receipt | [`0xA0249F4204503dcB9FE3A3153d7D48936E7a4Ac3`](https://coston2-explorer.flare.network/address/0xA0249F4204503dcB9FE3A3153d7D48936E7a4Ac3) |
| FTestXRP | [`0x0b6A3645c240605887a5532109323A3E12273dc7`](https://coston2-explorer.flare.network/address/0x0b6A3645c240605887a5532109323A3E12273dc7) |
| FCC manager | [`0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE`](https://coston2-explorer.flare.network/address/0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE) |
| FCC release | extension `66142`, code version `v0.2.2`, three simulated TEEs, 2-of-3 result |

The canonical deployment authority is
[`packages/flare-contracts/deployments/coston2.release.json`](../../packages/flare-contracts/deployments/coston2.release.json).
The preserved V1 and Sepolia/Nox artifacts are historical evidence only.

## Two-minute judge path

1. Open the [public dossier](https://flare-quorum.vercel.app/) and confirm
   Coston2 V2, the market, FTestXRP, FCC extension, three machine fingerprints,
   and threshold.
2. Open [Auditor](https://flare-quorum.vercel.app/flare?role=evidence). Inspect
   the public rules hash, all-three receipt custody, ordered bid root, FTSO
   snapshot, matching result signers, award/refund status, and escrow
   conservation. No bid payload is fetched.
3. Open [Buyer](https://flare-quorum.vercel.app/flare?role=buyer) to see direct
   FTestXRP funding and the public-safe XRP/FDC/Smart Account handoff.
4. Open [Private Bids](https://flare-quorum.vercel.app/flare?role=vendor) to see
   the wallet gate, public brief, machine binding, session-only inputs, and
   encrypted three-receipt path.
5. Watch [`flare-quorum-demo.mp4`](flare-quorum-demo.mp4), then verify its
   checksum and capture facts in
   [`judge-demo-video.release.json`](../../evidence/coston2/judge-demo-video.release.json).

## Evidence highlights

- Current three-machine binding:
  `evidence/coston2/fcc-market-v2-machines-refresh.json`
- Three-vendor success:
  `evidence/coston2/market-v2-refresh-multi-vendor-success.json`
- One-result-endpoint outage recovery:
  `evidence/coston2/market-v2-refresh-one-result-outage.json`
- Live invalid-credential rejection and corrected retry:
  `evidence/coston2/market-v2-refresh-invalid-credential.json`
- Pre-dispatch and post-dispatch bounded refunds:
  `evidence/coston2/market-v2-undispatched-refund.json` and
  `evidence/coston2/market-v2-selection-expired-refund.json`
- XRP/FDC/Smart Account funding:
  `evidence/coston2/gate-g-smart-account.json`
- Official amount-based FAssets request:
  `evidence/coston2/fassets-redemption.release.json`, including the public
  `RedemptionRequested` boundary

Evidence records public addresses, hashes, blocks, statuses, commitments, and
assertion booleans. It excludes losing bid plaintext, ciphertext, credentials,
wallet or TEE keys, and service credentials.

## What is complete and what is not

Complete: verified V2 runtime/wiring, three-machine encrypted ingress, atomic
all-three bid receipts, deterministic private scoring, FTSO binding, two-TEE
finalization, FTestXRP conservation, XRP-native Gate G funding, FAssets
redemption request, both bounded refund paths, hosted app/ingress, and the
organizer-supported rolling replacement drill for new tenders.

Not claimed: hardware-backed TEE operation, same-identity restoration after a
restart, private token transfers, instant underlying XRP redemption payout,
formal audit, production security, mainnet readiness, or completed external
user/pilot validation. Gate H passes for the bounded owner-operated website
acceptance in `website-acceptance.release.json`. Five buyer interviews, five
vendor sessions, and one honest pilot/design-partner outcome remain `NOT_RUN`
post-Summer Signal work and no traction is claimed.

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
rerun merely to inspect the submission. The checked-in sanitized evidence is
the public judge path.
