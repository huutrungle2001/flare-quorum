# VeilBid Flare Championship Product Plan

> Status: Product and architecture direction approved; the verified Coston2
> market, FCC extension/quorum, FTestXRP settlement, Gate G XRP-native funding
> evidence, hosted ingress, and public/EVM role surfaces are implemented. XRP
> browser funding/recovery, redemption UX, and user validation remain open.

## 1. Product identity

- Name: VeilBid Flare
- Tagline: Confidential Procurement for XRP and Flare Treasuries
- Primary bounty: Confidential Compute Apps
- Secondary bounty target: Interoperable Asset Products
- Development network: Flare Testnet Coston2 (`114`)
- Settlement asset: official FTestXRP on Coston2; FXRP on Flare Mainnet roadmap
- Confidential compute: Flare Compute Extension with a target 2-of-3 TEE result
  threshold

## 2. Product thesis

XRP treasuries can hold and transfer value globally but do not have a native,
credible procurement workflow. Public offers leak vendor strategy; a private
server hides offers but asks participants to trust the operator's winner.

VeilBid Flare lets an XRP user fund a tender through a Flare Smart Account,
keeps vendor proposals inside attested TEEs, evaluates a public deterministic
multi-criteria rule, and settles an XRP-backed asset only after a threshold of
registered machines agrees on the result.

## 3. Users

Primary:

- XRP-native companies and treasury operators buying services.
- Flare DAOs, grants teams, and ecosystem operations teams.
- Vendors protecting losing prices, delivery commitments, and qualifications.

Secondary:

- Auditors verifying public rules, machine/code policy, result binding, and
  settlement.
- Permissionless finalizers maintaining asynchronous lifecycle progress.
- Ecosystem integrators reusing the procurement contract or result schema.

## 4. Flagship journey

1. An XRPL user derives its Flare PersonalAccount and current nonce.
2. The buyer signs an XRPL payment whose `0xFE` memo commits to a
   `PackedUserOperation` containing FTestXRP approval plus tender creation.
3. FDC proves the XRPL payment; `executeDirectMintingWithData` mints FTestXRP and
   atomically executes the user operation from the PersonalAccount.
4. The tender freezes public rules, credential issuers, three registered TEE
   identities/key fingerprints, and a 2-of-3 result threshold.
5. Each vendor ECIES-encrypts a canonical bid to the selected TEEs through
   private ingress. TEEs return signed receipts; only salted commitments and
   receipt signatures reach the chain.
6. The contract preserves a common machine quorum across every accepted bid and
   builds an ordered root.
7. Close captures the official XRP/USD FTSO snapshot.
8. TEEs validate credentials, normalize XRP/USD prices, apply the public
   price/delivery/warranty penalty, and sign a minimum result.
9. Anyone finalizes after two distinct registered machines sign the same digest.
10. Winner receives public FTestXRP payout; buyer receives public remainder, or
    a zero winner returns full escrow.
11. Winner can use the official FAssets redemption path to native XRP.

## 5. Mandatory championship scope

### Confidential procurement

- One to eight public approved vendors.
- Private bid ingress; no permanent ciphertext publication.
- Fixed schema with XRP/USD price, delivery, warranty, and signed credentials.
- Threshold TEE receipts before canonical bid acceptance.
- Ordered commitment root and first-accepted exact-tie rule.
- Deterministic eligibility and weighted scoring.
- 2-of-3 matching TEE result signatures.

### XRP interoperability

- Official FTestXRP discovery and exact escrow.
- XRP-native Smart Account `0xFE` mint-and-fund journey.
- FDC `XRPPayment` proof in the direct-mint execution path.
- XRP/USD FTSO close snapshot for currency normalization.
- Winner payout and buyer remainder/refund in FTestXRP.
- Guided official redemption from FXRP/FTestXRP flow to XRP where supported.

### Product and evidence

- Wallet-free public Coston2 explorer.
- Buyer, Vendor, Public Finalizer, Activity, and Evidence workspaces.
- Stateless result/finalization relay.
- Extension ID, code version, machine identities, quorum, rules, FTSO snapshot,
  result digest, settlement, and receipt evidence.
- Responsive, keyboard-operable, explicit unavailable/recovery states.
- User interviews, vendor usability tests, and at least one pilot/design partner
  target before submission.

## 6. Development-only vertical slice

A 1-of-1, price-only, generic-token lifecycle is permitted only to validate FCC
transport, signature, and recovery. It must never become the final judge path or
be described as the complete product.

## 7. Public and confidential data

| Data | Visibility |
|---|---|
| Tender, buyer, vendors, ceiling, deadline, rules | Public |
| Extension, code version, TEE identities/key fingerprints, threshold | Public |
| Bid plaintext, credentials, delivery, warranty, losing prices | Private inside intended TEEs |
| Bid ciphertext | Private transport/sealed storage; not published on-chain |
| Salted plaintext commitment and TEE bid receipts | Public |
| Ordered bid root and common quorum bitmap | Public |
| FTSO feed/value/decimals/timestamp at close | Public |
| Eligibility, normalization, component penalties | Private inside intended TEEs |
| Threshold result envelope/signatures | Public |
| Winner and winning FXRP amount | Public after finalization |
| Losing results | Private by default |
| Smart Account, XRPL transaction ID, user-op hash, nonce | Public cross-chain evidence |

TEE hardware/runtime, FCC relaying/proxy, code governance, and the extension are
inside the confidentiality and correctness boundary. The design is not a
zero-knowledge proof system.

## 8. Scoring V1

Hard eligibility requires:

- all required credential issuer signatures are valid;
- positive price at or below the FXRP ceiling after conversion;
- delivery at or below the public maximum;
- warranty at or above the public minimum;
- supported schema, currency, range, and nonce.

The public weights sum to `10_000` basis points. Lowest checked fixed-point
penalty wins:

```text
pricePenalty    = ceil(priceXrp * SCALE / ceilingXrp)
deliveryPenalty = deliveryDays * SCALE / maxDeliveryDays
warrantyPenalty = (maxWarrantyDays - min(warrantyDays, maxWarrantyDays))
                  * SCALE / (maxWarrantyDays - minWarrantyDays)

totalPenalty = priceWeight * pricePenalty
             + deliveryWeight * deliveryPenalty
             + warrantyWeight * warrantyPenalty
```

Exact constants, rounding, overflow bounds, and zero-denominator rules are
defined by `SCORING_V1` and shared golden vectors. No AI or post-close buyer
judgment is allowed.

## 9. Architecture decisions

All formerly open choices are accepted in
[`architecture-decisions.md`](architecture-decisions.md), including:

- private ingress and sealed state;
- TEE quorum/threshold;
- key rotation and version governance;
- deterministic schemas and roots;
- FTSO conversion;
- FTestXRP settlement;
- Smart Account/FDC funding;
- recovery and result retrieval;
- administration and evidence policy.

## 10. Non-goals

- Confidential ordinary ERC-20 transfer amounts.
- On-chain encrypted bid storage.
- Hidden vendor identity, participation, timing, or transaction graph.
- Arbitrary AI, natural-language, or subjective winner selection.
- Buyer/admin winner override or post-bid rule changes.
- Legal delivery verification, dispute arbitration, KYC, or collusion resistance.
- Production-value custody, formal audit, perfect privacy, or mainnet readiness.

## 11. Acceptance criteria

| Area | Championship completion condition |
|---|---|
| XRP onboarding | XRPL `0xFE` payment, FDC proof, direct mint, and tender funding execute atomically |
| Private ingress | No plaintext/ciphertext appears on-chain or in public logs/evidence |
| Bid acceptance | Signed receipts preserve a common threshold-capable machine quorum |
| FCC decision | Fixed TEE quorum executes credential-gated multi-criteria scoring |
| Result authenticity | Two distinct registered tender-fixed machines sign the same full-domain digest |
| FTSO | Supported fresh XRP/USD snapshot is fixed at close and bound to scoring/result |
| Escrow | Official FTestXRP award plus remainder/refund conserves ceiling exactly once |
| Recovery | Close/request/results resume after browser, relay, proxy, or one-machine outage |
| UX | Complete XRP Buyer, Vendor, Public, Activity, Evidence, and redemption journeys |
| Deployment | Runtime/source/registry/extension/code/machine/binding facts agree |
| Privacy | Secret and output scans find no forbidden bid, ciphertext, key, or credential material |
| New work | Every Flare artifact is separated from historical Sepolia/Nox work |
| Usefulness | Real buyer/vendor feedback and pilot/design-partner evidence is recorded honestly |

## 12. Submission message

> Before Summer Signal, VeilBid proved confidential price procurement on
> Sepolia with Nox. During Summer Signal, we rebuilt the protocol around Flare:
> XRP-native Smart Account funding, FAssets escrow, private FCC multi-criteria
> bids, FTSO normalization, threshold TEE result verification, and Coston2
> evidence. The winning payout is public; losing commercial offers remain inside
> the selected attested TEEs.
