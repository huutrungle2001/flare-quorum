# VeilBid Flare Contract Specification

> Status: Target interface. Names and fields may change through recorded
> feasibility decisions; nothing in this document is deployed on Coston2 yet.

## 1. Domain types

### Tender

```text
buyer
paymentToken
metadataHash
rulesHash
publicCeiling
bidDeadline
status
approvedVendors[]
bidCount
orderedBidRoot
closeBlock
extensionId
codeVersion
requestId
resultNonce
winnerBidId
winner
winningAmount
```

### Bid reference

```text
tenderId
bidId
vendor
ciphertextCommitment
submittedAt
submissionNonce
```

### Result envelope

```text
version
chainId
market
extensionId
codeVersion
tenderId
rulesHash
orderedBidRoot
closeBlock
winnerBidId
winner
winningAmount
resultNonce
expiry
```

## 2. States

```text
FundingPending -> Open -> Closed -> ComputePending -> ResultReady -> Awarded
       |           |                                     |          Refunded
       +-> Cancelled <-+
```

Every terminal transition is one-way. `ResultReady` may be represented as a
readiness condition rather than stored state if the FCC proxy is the result
transport; the verified digest and terminal state remain canonical on-chain.

## 3. Target functions

### Market writes

- `createTender(...)`
- `confirmFunding(tenderId)` or an atomic exact-balance-delta variant
- `submitEncryptedBid(tenderId, ciphertextOrReference, commitment, nonce)`
- `closeTender(tenderId)`
- `requestSelection(tenderId)`
- `finalizeTender(tenderId, resultEnvelope, teeSignature)`
- `cancelTender(tenderId)` within the explicitly permitted pre-bid boundary

### Market reads

- `getTender(tenderId)`
- `getBidReference(tenderId, bidId)`
- `getApprovedVendors(tenderId)`
- `canClose(tenderId)`
- `canRequestSelection(tenderId)`
- `validateResultDigest(tenderId, resultEnvelope)`
- `isApprovedTeeSigner(extensionId, codeVersion, signer)`

Exact FCC registry calls and interfaces are selected from the official scaffold
during Gate A. Local placeholder interfaces must be removed or pinned to a
verified upstream source before a release.

## 4. Tender validation

- Nonzero buyer, token, and metadata/rules hashes.
- Supported payment token only.
- Ceiling is nonzero and within an explicit bound.
- Future deadline within supported duration bounds.
- One to eight unique, nonzero approved vendors.
- Supported FCC extension and code version fixed before bidding.
- Exact escrow accounting before `Open`.
- Only buyer may cancel, and never after a bid or frozen close unless the
  documented policy explicitly proves it cannot disadvantage a vendor.

## 5. Bid submission validation

- Tender is `Open` and unexpired.
- Caller is an approved vendor and has no previous bid.
- Nonce is unused for this tender/vendor.
- Commitment is nonzero and ciphertext/reference satisfies size/format bounds.
- Public binding fields are included in the encrypted canonical schema.
- Submission ordering is deterministic and contributes to `orderedBidRoot`.

The contract cannot validate private price or scoring fields. That validation
is performed in the TEE and committed by the result signature.

## 6. Close and request

`closeTender`:

- Requires `Open` and deadline passed, or all approved slots submitted if early
  close is enabled.
- Freezes bid count, order, root, rule hash, and close checkpoint.
- Rejects further bids.

`requestSelection`:

- Requires a frozen tender without a terminal result.
- Selects TEE IDs only through the approved FCC mechanism.
- Sends an instruction containing the minimum public binding and the approved
  ciphertext retrieval references.
- Records public request identity/checkpoint for recovery.

## 7. Finalize validation

`finalizeTender` must:

1. Require the correct closed/compute state.
2. Recompute the domain-separated result digest.
3. Recover the signer and verify it is a registered, approved TEE for the fixed
   extension/code version.
4. Verify chain ID and market address.
5. Verify tender, rules hash, ordered bid root, and close block.
6. Verify the exact unused result nonce and nonexpired envelope.
7. For nonzero winner ID, map it to an existing bid/vendor and require envelope
   winner equality.
8. Require `winningAmount > 0 && winningAmount <= publicCeiling` for an award.
9. For zero winner ID, require zero address/amount and execute the full refund.
10. Mark nonce/terminal state before token transfer or receipt interaction.
11. Settle once and emit public evidence events.

The caller has no authority to alter envelope fields covered by the signature.

## 8. Settlement

Tier 1 uses ordinary ERC-20/FTestXRP transfers:

- Award: `winningAmount` to stored vendor and `ceiling - winningAmount` to buyer.
- No valid bid: full ceiling to buyer.
- Transfer amounts are public.
- Actual balance deltas must equal expected values or the supported token policy
  must reject the asset.

FAssets redemption is a separate user journey. It must not bypass terminal
accounting or make VeilBid custodian of XRPL secrets.

## 9. Invariants

- No public/client function independently selects winner or winning amount.
- Winner equals the vendor at the TEE-signed winner bid ID.
- Result binds the exact frozen bid set and rules.
- At most one accepted result nonce and terminal settlement per tender.
- Total award plus remainder/refund equals escrow.
- Zero/over-ceiling bid cannot produce a valid awarded result.
- Equal valid bids preserve the committed order tie rule.
- Only approved vendors submit, at most once.
- Losing plaintext and private scoring data do not appear in contract state or
  events.
- Untrusted finalizers cannot alter tender terms, signer policy, or result.
- Receipt owner equals the stored winner and receipt transfer/approval is
  disabled.

## 10. Events

Target public events:

- `TenderCreated`
- `TenderFunded`
- `EncryptedBidSubmitted`
- `TenderClosed`
- `SelectionRequested`
- `SelectionRetried`
- `TenderAwarded`
- `TenderRefunded`
- `TenderCancelled`
- `AwardReceiptMinted`

Events may include public IDs, commitments, hashes, addresses, amounts,
extension/code identifiers, status, and checkpoints. They must not include
plaintext losing bids, private documents, decryption keys, or raw sensitive
proxy responses.

## 11. Administration

- No admin winner override or arbitrary escrow withdrawal.
- Signer/code-version changes must not affect an already open or closed tender.
- Emergency controls, if required by FCC version governance, must be explicit,
  delayed where practical, and incapable of selecting a favorable result.
- Contracts remain non-upgradeable by default. Any upgradeability proposal
  requires a new threat model and migration/evidence plan.
