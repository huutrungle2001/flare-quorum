# FlareQuorum Championship Product Plan

> Status: Product and architecture direction approved; the verified Coston2
> market, FCC extension/quorum, FTestXRP settlement, Gate G XRP-native funding
> evidence, hosted ingress, the unified Buyer and public role surfaces, the
> structured Buyer Brief, and an official amount-based redemption request are
> implemented. The
> server-side XRP funding checkpoint/resume path, optional GemWallet Testnet
> signing/submission, and public checkpoint resume are implemented; browser-
> native executor recovery, broader wallet coverage, and external user
> validation remain post-Summer Signal work. Owner-operated website acceptance
> passes for the current submission release.

## 1. Product identity

- Name: FlareQuorum
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

FlareQuorum lets an XRP user fund a tender through a Flare Smart Account,
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
- Public-safe delayed-mint checkpoint/resume that reuses the same XRPL payment
  and Smart Account nonce without accepting quote or domain drift.

### Product and evidence

- Wallet-free public Coston2 explorer.
- Buyer, Vendor, Public Finalizer, Activity, and Evidence workspaces.
- Stateless result/finalization relay.
- Extension ID, code version, machine identities, quorum, rules, FTSO snapshot,
  result digest, settlement, and receipt evidence.
- Responsive, keyboard-operable, explicit unavailable/recovery states.
- Owner-operated end-to-end website acceptance before submission.
- User interviews, vendor usability tests, and at least one pilot/design partner
  target after Summer Signal, before any external-validation or traction claim.

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
| Recovery | Close/request/results resume after browser, relay, proxy, or one-machine outage; XRP funding resumes from a public-safe delayed-mint checkpoint |
| UX | Complete XRP Buyer, Vendor, Public, Activity, Evidence, and redemption journeys |
| Deployment | Runtime/source/registry/extension/code/machine/binding facts agree |
| Privacy | Secret and output scans find no forbidden bid, ciphertext, key, or credential material |
| New work | Every Flare artifact is separated from historical Sepolia/Nox work |
| Website acceptance | Project owner completes the deployed Buyer, Public, Private Bids, Activity, and Auditor journeys without a blocking defect in the tested scope |

Real buyer/vendor feedback and pilot/design-partner evidence remain an honest
post-Summer Signal usefulness track, not a pre-submission technical gate.

## 12. Submission message

> Before Summer Signal, the historical predecessor proved confidential price procurement on
> Sepolia with Nox. During Summer Signal, we rebuilt the protocol around Flare:
> XRP-native Smart Account funding, FAssets escrow, private FCC multi-criteria
> bids, FTSO normalization, threshold TEE result verification, and Coston2
> evidence. The winning payout is public; losing commercial offers remain inside
> the selected attested TEEs.

## 13. Post-Summer Signal upgrades

The staged V2 track is complete: `FlareQuorumMarketV2` passed both time-locked
refund lifecycles, final bundle verification, refreshed three-machine FCC
lifecycles, promotion, and the explicit consumer switch. It is the canonical
Coston2 release; V1 remains historical rollback evidence. The remaining
post-Summer track is product discovery and hardening that may expand this
proven procurement foundation into Flare Treasury Exchange.

This roadmap supports the hackathon's clarity-and-future-potential criterion.
Its bullets are release or discovery criteria for later work, not incomplete
acceptance gates for the current submission.

### 13.1 Completed V2 release promotion

The repository preserves the address-free staged-release kit, immutable
promotion artifact, candidate deployment evidence, refreshed FCC identities,
verified authority chain, success/outage/credential drills, and both live
fixed-grace refund proofs. The canonical release manifest and generated
bindings select V2; the dedicated V1 manifest preserves the prior release.

### 13.2 Flare Treasury Exchange

The post-competition product direction is **Flare Treasury Exchange**. This is
an intentional expansion of the FlareQuorum foundation, not a claim that the
current championship release already implements an intent marketplace or
milestone execution network.

#### Product promise

Treasury teams publish an outcome-oriented intent, receive private offers from
approved vendors/solvers/executors, and fund an objective milestone workflow.
The selected executor is determined by registered FCC machines; FDC verifies
external completion facts; Smart Accounts and FAssets move the public escrow;
FTSO fixes any required currency/risk snapshot.

#### Product vocabulary

| Treasury Exchange | Current FlareQuorum foundation |
|---|---|
| `Intent` | public tender rules and Buyer Brief |
| `Offer` | private encrypted bid and TEE receipt quorum |
| `Milestone` | new objective release checkpoint |
| `Attestation` | FDC proof of XRPL/EVM/Web2Json completion |
| `Release` / `Refund` | public escrow conservation and settlement |
| `Executor` | selected vendor/solver under a threshold result |

The new intent/offer schemas and escrow module must be versioned separately from
the championship tender ABI. Historical Sepolia/Nox assets and the predecessor
repository remain read-only references.

#### First vertical slice

The first pilot should use one narrow, objectively verifiable operation, such
as an EVM deployment or an XRPL payment milestone. It should include two or
three milestones, public amounts and deadlines, private offer terms, a
two-of-three FCC result, an FDC proof, a timeout/refund path, and a public-safe
recovery checkpoint. Web2Json sources are a later extension after source
allowlisting, transformation, freshness, and outage semantics are proven.

#### Explicit boundaries

- No AI or subjective buyer override selects an executor.
- No private token settlement or hidden payout amounts are claimed.
- No ciphertext, plaintext offer, credential, XRPL secret, or wallet key is
  persisted in browser, public calldata, logs, or evidence.
- No legal delivery guarantee, KYC, dispute arbitration, or production custody
  claim is implied by an attested milestone.
