# VeilBid Flare Product Plan

> Status: Approved direction; implementation and Coston2 verification pending.

## 1. Product identity

- Name: VeilBid Flare
- Tagline: Confidential Procurement for XRP and Flare Treasuries
- Primary bounty: Confidential Compute Apps
- Conditional secondary bounty: Interoperable Asset Products
- Development network: Flare Testnet Coston2 (`114`)
- Core integration: Flare Confidential Compute (FCC)
- Economic integration target: FAssets/FTestXRP/FXRP

## 2. Problem

Procurement buyers need public rules and accountable awards, while vendors need
commercial offers protected from competitors. Public bids leak information;
private servers make the operator the unreviewable decision maker.

VeilBid lets vendors encrypt offers to an attested TEE. A reproducible Flare
Compute Extension evaluates the public rule privately and returns a minimally
disclosed, signed result. A Flare contract verifies the result before it can
change canonical tender or escrow state.

## 3. Target users

Primary users:

- XRP-native businesses, DAOs, and treasury operators purchasing services.
- Flare ecosystem teams running vendor or grant procurement.
- Vendors that do not want losing commercial terms published.

Secondary users:

- Auditors reviewing rule, code-version, result, and settlement evidence.
- Permissionless finalizers maintaining lifecycle progress.
- XRPL users interacting through Flare Smart Accounts in the extended release.

## 4. Value proposition

> A buyer can run a publicly governed tender funded with an interoperable XRP
> asset while a Flare TEE privately evaluates vendor offers and the contract
> accepts only the signed result of the agreed computation.

## 5. Release tiers

### Tier 1 — mandatory confidential-compute product

- Coston2 tender contract and public lifecycle.
- Buyer escrow in one supported test asset.
- One to eight public approved vendor addresses.
- ECIES-encrypted immutable bid packages.
- FCC extension for nonzero/ceiling eligibility and deterministic minimum.
- Result signature verification against a registered TEE identity.
- Winner and winning settlement amount public at finalization.
- Full refund if no bid satisfies the encrypted rule.
- Wallet-free explorer and permissionless recovery.

### Tier 2 — meaningful interoperable asset product

- FTestXRP escrow and payout on Coston2.
- FXRP discovery through the official Flare contract registry.
- User-visible mint/fund or redemption journey tied to procurement.
- FDC-backed proof of relevant XRPL payment/redemption state where the
  application itself needs that proof.

Only after Tier 2 passes may the project select the Interoperable Asset Products
bounty.

### Tier 3 — differentiation

- Confidential multi-criteria scoring under a public rules hash.
- FTSOv2 close-time price snapshot for approved multi-currency normalization.
- Milestone settlement using an FDC Payment or Web2Json proof.
- XRP-native tender actions through Flare Smart Accounts.
- Threshold result approval across multiple registered TEE identities.

## 6. Public and private data

| Data | Visibility |
|---|---|
| Tender ID, buyer, metadata hash/URI, ceiling, deadline | Public |
| Approved vendor and submitting vendor addresses | Public |
| Rule hash and supported extension/code version | Public |
| Encrypted bid payload or payload reference | Public ciphertext; never evidence content |
| Bid commitment and ordered bid root | Public |
| Price, delivery, qualification, and scoring inputs | Private inside the TEE |
| Eligibility and comparison intermediates | Private inside the TEE |
| Signed result envelope | Public minimum disclosure |
| Winner | Public after finalization |
| Winning amount paid with ordinary FTestXRP/FXRP | Public at finalization |
| Losing bid values | Private by default |
| Transactions, status, receipt, extension ID, code hash | Public |

The product must state that TEE operators and FCC infrastructure are inside the
confidentiality/correctness trust boundary. It does not claim cryptographic
privacy against a compromised TEE.

## 7. User journeys

### Buyer

1. Connect on Coston2 and choose a supported payment asset.
2. Publish metadata, public ceiling, deadline, vendor allowlist, and rule hash.
3. Escrow enough FTestXRP or the current supported test asset.
4. Wait for the tender to become `Open` only after funding is confirmed.
5. Monitor public participation without seeing vendor plaintext.
6. Let any finalizer close the tender and request FCC computation.
7. Verify the registered TEE signer, rule/bid-root binding, winner, and payout.
8. Recover unused escrow or a no-valid-bid refund according to terminal state.

### Vendor

1. Inspect tender rules, TEE identity/code version, ceiling, and deadline.
2. Fetch and validate the intended TEE encryption key through the approved FCC
   discovery path.
3. Encode the canonical bid schema, bind it to the tender/vendor/nonce, and
   ECIES-encrypt it.
4. Submit the ciphertext commitment before the deadline.
5. Confirm that public state shows participation but not plaintext terms.
6. If selected, receive the public FTestXRP/FXRP settlement and optionally
   redeem FXRP to an XRPL address.

### Public finalizer

1. Close a ready tender and freeze its ordered bid root.
2. Request the configured FCC selection action.
3. Poll the proxy for a result without receiving plaintext bid data.
4. Submit the result envelope and signature to the market.
5. Treat competing writes as benign only after rereading canonical state.

### XRP-native buyer — extended release

1. Construct a supported Flare Smart Account custom instruction.
2. Authorize it with an XRPL payment/memo flow.
3. Let the operator/FDC deliver the instruction to the buyer's Flare account.
4. Create or fund the tender without requiring the user to manage FLR directly.

## 8. Scoring rule

Tier 1 uses a deterministic lowest-valid-price rule:

```text
valid = price > 0 && price <= publicCeiling
winner = earliest submitted bid with the lowest valid price
```

Tier 3 may add fixed-point weighted scoring. Every supported field, range,
normalization rule, tie rule, and weight must be fixed before bidding and
committed in `rulesHash`. The client cannot provide an independent winner.

## 9. Non-goals for the first Flare release

- Confidential ERC-20 transfer amounts.
- Hidden vendor identity, timing, transaction graph, or public metadata.
- Arbitrary AI or subjective winner selection.
- Verification that real-world services were delivered without an explicit FDC
  integration and supported evidence source.
- KYC, legal arbitration, collusion resistance, or anonymous credentials.
- Mainnet-value custody, production security, or formal audit claims.
- Use of every Flare protocol solely to increase an integration count.

## 10. Acceptance criteria

| Area | Completion condition |
|---|---|
| Confidential input | Plaintext bid is absent from calldata, storage, events, proxy logs, and evidence |
| FCC decision | Registered extension decrypts and computes the winner inside the TEE |
| Result authenticity | Market verifies domain-separated signature from an approved registered TEE identity |
| Result binding | Chain, market, extension, tender, rule hash, bid root, close checkpoint, nonce, and expiry are checked |
| Correctness | Invalid bids lose; lower valid bid wins; earlier valid bid wins ties |
| Settlement | Winner receives public winning amount; buyer receives public remainder, or full refund for zero winner |
| Replay | Duplicate bid/result/finalization cannot change terminal state |
| Recovery | Mined close/request state survives browser, relay, or proxy restart |
| Public UX | Judge can verify a finalized Coston2 tender without a wallet |
| Evidence | Sanitized Coston2 identifiers and lifecycle assertions agree with deployed source and bindings |
| New work | Pre-hackathon Sepolia baseline and Summer Signal Flare work are clearly separated |

## 11. Submission narrative

The submission must explicitly state:

- Before Summer Signal: verified VeilBid on Sepolia using iExec Nox, ERC-7984,
  Safe, web/relay/console, and historical evidence.
- During Summer Signal: new Coston2 contracts, FCC extension, ECIES bid path,
  TEE result verification, Flare UI/bindings, and Coston2 evidence.
- Additional work, if complete: FAssets settlement/redemption, FDC milestone or
  XRP payment proof, FTSO normalization, and Smart Account onboarding.
