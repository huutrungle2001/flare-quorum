# FlareQuorum

**Confidential procurement for XRP and Flare treasuries: private vendor
competition, deterministic FCC selection, and public settlement evidence.**

**Primary bounty:** Confidential Compute Apps

**Secondary selected bounty:** Interoperable Asset Products

## Product description

FlareQuorum is a working Coston2 procurement product for treasuries that need
both commercial confidentiality and a winner they can publicly justify. A
buyer publishes fixed qualification and scoring rules and escrows FTestXRP.
Approved vendors submit encrypted price, delivery, warranty, and credential
terms to three registered Flare Confidential Compute machines. The market
accepts a winner only when two distinct tender-fixed machines sign the same
fully bound result, then settles the public escrow exactly once.

The useful distinction is simple: procurement rules, commitments, machine
policy, result binding, winner, and settlement are public; losing commercial
offers remain inside the intended confidential-compute boundary. The buyer,
browser, relay, finalizer, and administrator never receive a winner-override
path.

The current release is unaudited, testnet-only software using registered
simulated FCC machines. It is not a hardware-backed TEE, mainnet,
production-security, private-token-transfer, or zero-knowledge claim.

## Target users

- **XRP-native companies and treasury operators** buying technical,
  operational, or professional services.
- **Flare DAOs, grants teams, and ecosystem operations** that need transparent
  rules, bounded escrow, and independently inspectable awards.
- **Vendors** that need to protect losing prices, delivery promises, warranty
  terms, and qualification data from buyers, competitors, and public viewers.
- **Auditors and permissionless finalizers** that need to verify the public
  lifecycle without spending authority or bid-decryption capability.

## Open these first

| Resource | Public link |
|---|---|
| Working application | <https://flare-quorum.vercel.app> |
| Wallet-free Auditor | <https://flare-quorum.vercel.app/flare?role=evidence> |
| Source repository | <https://github.com/huutrungle2001/flare-quorum> |
| Verified release manifest | <https://github.com/huutrungle2001/flare-quorum/blob/main/packages/flare-contracts/deployments/coston2.release.json> |
| New-work disclosure | <https://github.com/huutrungle2001/flare-quorum/blob/main/submission/flarequorum/NEW-WORK-LEDGER.md> |

The working application is the demo resource; no video is required for this
package.

## The problem and product usefulness

Public procurement exposes every vendor's price and operating terms. A
conventional private procurement server hides those bids, but it also asks all
participants to trust the operator not to alter eligibility, scoring, or the
winner. That is a poor trade for XRP and Flare treasuries that need competitive
pricing, accountable spending, and a durable audit trail.

FlareQuorum separates private competition from public accountability. The
buyer freezes deterministic rules before bidding. Vendors encrypt their offers
to a fixed machine set. FCC performs qualification, comparison, and selection
in the real settlement path. The contract verifies matching registered-machine
signatures, conserves the escrow, and publishes enough evidence for a third
party to check what was bound without learning losing bids.

## One procurement in seven steps

1. The buyer publishes a hash-verified public brief, approved vendor list,
   ceiling, deadline, credential policy, service bounds, and price/delivery/
   warranty weights.
2. The XRP-native path binds an XRPL Payment to an exact Smart Account user
   operation. FDC proves the payment, then direct minting atomically funds the
   tender in FTestXRP. A direct Coston2 funding path remains available.
3. Each approved vendor encrypts a canonical bid in browser memory to all three
   tender-fixed FCC machines. Plaintext and ciphertext are not placed in
   calldata, events, public evidence, analytics, or durable browser storage.
4. All three machines return signed receipts for the same salted commitment.
   Only the receipt set and commitment enter the canonical ordered bid root.
5. Close freezes a fresh public XRP/USD FTSOv2 snapshot. FCC validates private
   credentials and eligibility, normalizes XRP/USD prices, and applies the
   public deterministic multi-criteria score.
6. Anyone can finalize only after two distinct frozen machines sign the exact
   same result digest. The browser, buyer, relay, and finalizer cannot provide
   a winner.
7. The winner receives public FTestXRP, the buyer receives the exact remainder,
   and the official FAssets flow exposes the amount-based
   `RedemptionRequested` boundary back toward XRP.

## Why Flare is necessary

- **Flare Confidential Compute** is the decision engine, not an add-on. It
  receives encrypted offers, checks private qualifications, compares eligible
  bids, and selects the deterministic winner in the settlement path.
- **FDC** proves the exact external XRPL Payment that authorizes the
  XRP-native mint-and-fund operation instead of trusting a relay assertion.
- **Smart Accounts** bind the XRPL payment, proof owner, nonce, direct mint,
  approval, and tender creation into one exact user operation without
  FlareQuorum custody.
- **FAssets/FTestXRP** provide the XRP-backed test asset for mint, escrow,
  payout, and the official redemption-request path.
- **FTSOv2** freezes a fresh public XRP/USD conversion checkpoint at close so
  private XRP- and USD-denominated offers are compared under one immutable
  market fact.

Removing FCC restores operator winner authority. Removing FDC, Smart Accounts,
FAssets, or FTSO breaks the demonstrated XRP-native funding, normalized
selection, settlement, and exit story. These integrations form one product
lifecycle rather than a menu of protocol calls.

## Technical execution and what has run

The consumer-selected V2 release is deployed and runtime-verified on Coston2.
Sanitized live evidence records:

- a three-vendor encrypted-bid lifecycle with all-three custody and a
  threshold-signed award;
- finalization by two frozen machines while one result endpoint is excluded;
- rejection of an invalid private credential by all three machines, followed
  by a corrected submission on the same canonical slot;
- both pre-dispatch and post-dispatch fixed-grace full-refund paths, without a
  fabricated winner;
- XRPL Payment, FDC `XRPPayment` proof, Smart Account direct mint, and atomic
  tender funding;
- FTestXRP award conservation and an official amount-based FAssets
  `RedemptionRequested` event;
- rolling three-machine replacement for new tenders without exporting identity
  keys or mutating an existing tender's frozen machine set; and
- hosted Public, Buyer, Private Bids, Activity, and Auditor workspaces,
  including 320px/keyboard checks and owner-operated end-to-end acceptance.

Evidence stores public addresses, hashes, blocks, statuses, commitments,
transactions, and assertion booleans. It excludes bid plaintext/ciphertext,
credentials, salts, wallet or TEE keys, forbidden raw signatures, and provider
credentials. Dependency failures show unavailable or recovery states; they do
not trigger mock prices, bids, winners, attestations, or chain state.

## Verified Coston2 deployment

| Fact | Value |
|---|---|
| Network | Flare Coston2, chain ID `114` |
| FlareQuorumMarketV2 | [`0xE1252D445ee86ED78C1da2bD5f1bF4a69bF476AC`](https://coston2-explorer.flare.network/address/0xE1252D445ee86ED78C1da2bD5f1bF4a69bF476AC) |
| AwardReceipt | [`0xA0249F4204503dcB9FE3A3153d7D48936E7a4Ac3`](https://coston2-explorer.flare.network/address/0xA0249F4204503dcB9FE3A3153d7D48936E7a4Ac3) |
| FTestXRP | [`0x0b6A3645c240605887a5532109323A3E12273dc7`](https://coston2-explorer.flare.network/address/0x0b6A3645c240605887a5532109323A3E12273dc7) |
| FCC manager | [`0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE`](https://coston2-explorer.flare.network/address/0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE) |
| FCC release | extension `66142`, wire/code version `v0.2.2`, three simulated machines, 3-of-3 bid custody, 2-of-3 result agreement |
| Release authority | [`packages/flare-contracts/deployments/coston2.release.json`](../../packages/flare-contracts/deployments/coston2.release.json) |

The verified manifest, generated TypeScript bindings, hosted consumers, and
sanitized evidence identify the same V2 release. V1 remains historical
Coston2 rollback evidence. The Sepolia/Nox predecessor is historical
pre-hackathon baseline only and is never used as Flare proof.

## What existed before and what changed during Summer Signal

- **Existed before:** the historical Sepolia/Nox/Safe/ERC-7984 procurement
  market, app, relay, bindings, and evidence.
- **Newly built:** the Go FCC extension, ECIES private ingress, signed bid
  receipts, ordered common quorum, multi-criteria private selection, Flare
  market/contracts, generated Coston2 bindings, hosted ingress, and current
  role workspaces.
- **Ported:** the public explorer, role-based application shell, and stateless
  recovery patterns, with historical network routes removed from the current
  browser product.
- **Integrated:** FAssets/FTestXRP, FDC, FTSOv2, and Smart Accounts into the
  same XRP-native funding, scoring, payout, and redemption-request journey.
- **Improved:** deterministic qualification plus price/delivery/warranty
  scoring, 3-of-3 bid custody, 2-of-3 result agreement, strict domain/replay
  protection, bounded refunds, replacement recovery, fail-closed dependency
  states, cross-workspace synchronization, and public-safe evidence gates.

The commit- and artifact-level disclosure is published in
[`NEW-WORK-LEDGER.md`](NEW-WORK-LEDGER.md). Historical addresses, tests, and
evidence are not relabeled as Summer Signal work.

## Judge route

No wallet, test funds, or confidential input is required:

1. Open the working app and inspect the current Coston2 V2 market and a public
   finalized tender.
2. Open **Auditor** and verify the rules hash, all-three receipt custody,
   ordered bid root, frozen FTSO snapshot, two matching result signers, award,
   and escrow conservation.
3. Open **Buyer** to inspect direct FTestXRP funding and the XRPL/FDC/Smart
   Account mint-and-fund path.
4. Open **Private Bids** to see the approved-wallet gate, public brief, frozen
   machine binding, session-only bid fields, and three-receipt flow without
   submitting private data.
5. Open **Activity** to see explicit close, FCC compute, award/refund, and
   recovery checkpoints. Completed actions cannot be replayed from the UI.

## Testing and distribution status

Automated contract, extension, binding, relay, web, evidence-schema, privacy,
accessibility, build, and release-consistency checks pass for the recorded
submission boundary. The project owner also completed the deployed Buyer,
Public, Private Bids, Activity, and Auditor journeys without a blocking defect
in the tested scope.

The app and source are publicly accessible, but this is technical validation
and owner-operated acceptance—not independent cohort research, a pilot,
adoption, or traction. External buyer interviews, vendor usability sessions,
and design-partner outreach remain explicitly unrun rather than invented.

## Current limitations

FlareQuorum is Coston2-only, uses disposable test assets, and has not received a
formal security audit. Its registered machines use the organizer-supported
simulated FCC profile, not hardware-backed attestation. Ordinary FTestXRP/FXRP
amounts, addresses, timing, winner, and transaction graph are public. The
FAssets evidence reaches `RedemptionRequested`; it does not claim instant
underlying XRP payout. The system does not prove legal delivery, prevent
collusion, hide bidder participation, or provide a buyer dispute override.

## Roadmap and next steps

1. Conduct structured XRP/Flare treasury interviews and vendor usability
   sessions, then pursue one bounded Coston2 design-partner pilot.
2. Expand browser-native XRP recovery, wallet coverage, stateful live fault
   injection, and longer-retention privacy/log reviews.
3. Replace simulated operation with independently reviewed hardware-backed FCC
   machines before any production-value custody claim.
4. Commission contract and FCC security reviews and validate mainnet FXRP only
   after audited, value-capped release and incident controls exist.
5. Extend the proven private-offer foundation toward milestone-based treasury
   execution where objective FDC attestations control bounded public releases
   and refunds.
