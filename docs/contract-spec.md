# FlareQuorum Championship Contract Specification

> Status: The local Flare market slice implements canonical public scoring
> policy, receipt quorum, conditional close-time FTSO, canonical FCC
> action-result verification, and public-token escrow conservation. Private
> ingress, live FCC deployment, and Smart Account/FDC execution are now
> recorded on Coston2; restart/recovery limitations remain explicit, including
> the immutable frozen set of an already-open tender.

## 1. Core types

### Tender

```text
buyer
paymentToken               // official FTestXRP
metadataHash
rulesHash
publicCeilingXrp
bidDeadline
status
approvedVendors[]
bidCount
orderedBidRoot
commonQuorumBitmap
extensionId
codeVersion
teeIdentities[3]
teeKeyFingerprints[3]
resultThreshold            // 2
ftsoFeedId                 // XRP/USD when USD enabled
ftsoValue
ftsoDecimals
ftsoTimestamp
closeBlock
selectionStartedAt
selectionAttempt
requestId
resultNonce
winnerBidId
winner
winningAmountXrp
```

### Public scoring policy

```text
schemaVersion              // exactly 1
ceilingXrpMicros            // uint64 FTestXRP escrow ceiling
bidDeadline                 // bounded future unix seconds
allowXrp
allowUsd
ftsoFeedId                  // official Coston2 XRP/USD ID iff USD is enabled
maxDeliveryDays
minWarrantyDays
maxWarrantyDays
priceWeightBps
deliveryWeightBps
warrantyWeightBps           // all weights sum to 10_000
requiredCredentials[]       // at most four unique (type, issuer) pairs
```

The complete policy is stored on-chain. `rulesHash` is derived only as
`keccak256(abi.encode(RULES_DOMAIN, scoringPolicy))`; no client, relay, or
Smart Account job can supply an independent rule hash.

### Bid receipt

```text
schemaVersion
chainId
market
extensionId
codeVersion
tenderId
vendor
submissionNonce
rulesHash
plaintextCommitment
teeIdentity
receiptExpiry
signature
```

### Stored bid reference

```text
bidId
vendor
submissionNonce
plaintextCommitment
receiptBitmap
acceptedBlock
```

### Selection result

```text
schemaVersion
chainId
market
extensionId
codeVersion
tenderId
rulesHash
orderedBidRoot
commonQuorumBitmap
ftsoFeedId
ftsoValue
ftsoDecimals
ftsoTimestamp
closeBlock
winnerBidId
winner
winningAmountXrp
resultNonce
expiry
```

## 2. States

```text
FundingPending -> Open -> Closed -> ComputePending -> Awarded
       |           |                          \-----> Refunded
       +-> Cancelled <-+
```

Result readiness is derived from valid proxy results and threshold signatures,
not a caller-controlled contract state.

## 3. Target writes

- `createTender(TenderTerms)` where `TenderTerms` contains the complete public
  `ScoringPolicy`; an FTestXRP approval plus this call is the atomic Smart
  Account batch
- `submitBidReceipts(tenderId, receipts[3], signatures[3])`; the atomic set must
  contain every frozen machine and no partial receipt state is stored
- `closeTender(tenderId)`
- `requestSelection(tenderId)`
- `retrySelection(tenderId)` only after the signed-result window expires; it
  preserves the close checkpoint and creates a fresh attempt, nonce, and FCC
  request ID
- `finalizeTender(tenderId, SelectionResult, TeeSignature[])`
- `refundExpiredSelection(tenderId)` only for the buyer after the fixed
  24-hour grace measured from the first selection request
- `cancelTender(tenderId)` only inside the permitted pre-bid boundary

No write function accepts an independent winner, score, FTSO value, machine
replacement, or settlement amount.

Retry never changes rules, bids, root, quorum, machines, FTSO snapshot, or close
block. Timeout refund is a public failure terminal state, not a successful
selection fallback; it creates no award receipt and pays only the original
escrow back to the buyer.

## 4. Creation and funding

- Buyer is `msg.sender`, including a Flare PersonalAccount.
- Token equals official configured FTestXRP.
- Ceiling is nonzero and within release bounds.
- Future deadline is bounded.
- One to eight unique nonzero approved vendors.
- Scoring weights sum exactly to `10_000`.
- Numeric scoring bounds and credential issuer/type policy are valid.
- Extension/code version is approved for new tenders.
- Three distinct registered machines with three distinct public-key
  fingerprints are fixed.
- Threshold is exactly two in championship mode.
- XRP/USD feed ID is official when USD quotes are enabled.
- Exact FTestXRP ceiling reaches escrow before `Open`.
- The market derives `rulesHash` from the validated policy and exposes the
  immutable policy through `getScoringPolicy` at finalized blocks.

Generic assets and one-machine policy are accepted only by isolated feasibility
contracts, never the release market.

## 5. Receipt acceptance

`submitBidReceipts` requires:

1. Tender `Open` and unexpired.
2. Receipt schema version is exactly `1`.
3. Caller is approved vendor with no accepted bid.
4. Submission nonce is exact unused next nonce.
5. Every receipt reconstructs the canonical `BID_RECEIPT_V1` digest.
6. All three signers are distinct tender-fixed registered machines whose live
   status, extension, code hash, and public-key fingerprint still match.
7. Receipts agree on vendor, nonce, rule, and plaintext commitment.
8. Receipt expiry has not passed.
9. Valid signer bitmap is exactly `0x07`; a two-machine set is rejected.
10. Terminal bid reference is stored and ordered root updated once.

The contract never receives bid plaintext or ciphertext.

## 6. Close

`closeTender` requires deadline passed or all approved vendors accepted when
early close is enabled. It:

- freezes bid count, ordered root, common quorum, rules, and close block;
- rejects future bid receipts;
- reads and stores the hard-bound official Coston2 XRP/USD
  `0x015852502f55534400000000000000000000000000` value/decimals/timestamp when
  USD quotes are enabled;
- enforces positive value and configured freshness;
- performs no oracle call and stores a zero snapshot for XRP-only policy;
- advances to `Closed`.

The caller cannot supply the FTSO snapshot.

## 7. Selection request

`requestSelection`:

- requires `Closed` and no accepted terminal result;
- revalidates the frozen machine identities and targets the currently valid
  subset through official FCC contracts; at least two must remain;
- sends an ABI-encoded `SelectionRequest` tuple containing the exact public
  tender/root/rules/FTSO/close/result-nonce/expiry binding, the public ceiling
  and bid deadline needed by the extension's deterministic scoring policy, and
  the ordered public bid references (vendor, commitment, receipt bitmap,
  accepted block, and submission nonce). No bid quote, plaintext, or
  ciphertext is included;
- records request/action checkpoint for recovery;
- advances to `ComputePending`.

Re-requesting after expiry or delivery failure must preserve the same frozen
inputs and follow the documented FCC fee/replay policy.

## 8. Finalization

`finalizeTender`:

1. Reconstructs the current FCC-compatible domain-separated result digest.
2. Checks every result field against stored tender state.
3. Recovers distinct signers and revalidates tender-fixed production status,
   extension, attested code hash, public-key fingerprint, and common-quorum
   membership.
4. Requires at least two valid signatures over the exact same digest.
5. Requires current unused result nonce and nonexpired envelope.
6. Maps nonzero winner bid ID to the stored vendor and requires equality.
7. Requires positive winning amount at or below ceiling.
8. For zero winner, requires zero address/amount.
9. Marks nonce and terminal state before token/receipt interaction.
10. Pays winner/remainder or full refund exactly once.
11. Mints one non-transferable receipt only for an award.

Split result digests never reach threshold and cannot be chosen by the caller.

## 9. Scoring verification boundary

Private scoring is trusted to the threshold TEE extension. The contract verifies
public rule version, fixed inputs, identities, and threshold signatures; it
cannot recompute private eligibility. Shared golden vectors and code/image
verification provide implementation evidence, not a zero-knowledge proof.

## 10. Settlement

- Only official FTestXRP release asset.
- Award: `winningAmountXrp` to winner and
  `publicCeilingXrp - winningAmountXrp` to buyer.
- Zero winner: full ceiling to buyer.
- Checks-effects-interactions and reentrancy guard.
- Balance-delta verification when required by token behavior.
- No admin withdrawal, rescue, fee, or callback-based receipt mint.
- Winning amount is public.

## 11. Reads

- `getTender(tenderId)`
- `getApprovedVendors(tenderId)`
- `getBidReference(tenderId, bidId)`
- `getMachinePolicy(tenderId)`
- `getScoringPolicy(tenderId)`
- `getFtsoSnapshot(tenderId)`
- `canClose(tenderId)`
- `canRequestSelection(tenderId)`
- `resultDigest(tenderId, SelectionResult)`
- `validResultSignerBitmap(tenderId, digest, signatures)`

## 12. Invariants

- No plaintext or ciphertext bid exists in contract state, calldata, or event.
- Every accepted bid has a threshold-capable common machine quorum.
- Ordered root and first-accepted tie order never change after close.
- Machine/key/code/rule/threshold policy never changes after opening.
- Client, buyer, admin, and relay cannot choose winner or FTSO price.
- Two distinct compatible tender-fixed machines agree on accepted result.
- Winner equals stored vendor for signed bid ID.
- Total terminal transfer equals exact escrow once.
- Wrong domain/root/rules/feed/nonce/expiry cannot settle.
- Receipt owner equals winner and cannot transfer/approve the receipt.

## 13. Events

- `TenderCreated`
- `BidReceiptAccepted`
- `TenderClosed`
- `SelectionRequested`
- `SelectionRetried`
- `TenderAwarded`
- `TenderRefunded`
- `TenderCancelled`
- `AwardReceiptMinted`

Events expose commitments, signer bitmap, root, rules, FTSO snapshot, request,
result digest, winner, amount, and settlement evidence. They never expose bid
plaintext/ciphertext, credentials, TEE secrets, or sensitive proxy responses.

## 14. Governance

Non-upgradeable release contracts. Future-tender allowlists may be governed
through `Ownable2Step` or a small multisig, but governance cannot mutate live
tenders, lower threshold, override winner, decrypt bids, or withdraw escrow.
