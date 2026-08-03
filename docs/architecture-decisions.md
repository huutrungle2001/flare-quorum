# VeilBid Flare Architecture Decision Record

> Status: Accepted target decisions. Implementation evidence is still pending.
> These decisions replace the open alternatives in the initial transition plan.

## ADR-001 — Product shape

**Decision:** VeilBid Flare is a confidential multi-criteria procurement system
for XRP-native and Flare treasuries, not a price-only sealed auction.

The championship release must demonstrate one coherent lifecycle:

1. An XRP user mints FXRP and funds a tender through a Flare Smart Account, or
   an EVM buyer funds it directly.
2. Vendors privately submit signed bid receipts from a fixed FCC TEE quorum.
3. The TEE quorum verifies credentials, normalizes XRP/USD quotes through a
   fixed FTSO snapshot, evaluates the public deterministic rule, and agrees on
   one result digest.
4. The market verifies threshold TEE signatures and pays the winner in FTestXRP.
5. The winner can follow the official FAssets redemption path back to XRP.

**Reason:** This makes FCC, FAssets, FDC, FTSO, and Smart Accounts serve one user
story rather than appear as unrelated integrations.

## ADR-002 — Contract and extension toolchains

**Decision:** Use separate Flare workspaces:

- `packages/flare-contracts`: Foundry and Solidity `0.8.27`, aligned with the
  selected official FCC examples.
- `apps/fcc-extension`: Go implementation derived from the official
  `flare-foundation/fce-extension-scaffold`.
- `packages/flare-bindings`: generated ABI, address, event, and shared schema
  snapshots for TypeScript consumers.

The exact upstream scaffold commit, Go version, Foundry version, Docker image
digests, Flare interfaces, and registry addresses are pinned by the first
feasibility commit. Temporary local FCC interfaces are accepted only when they
exactly match a pinned official source and are drift-tested.

**Reason:** The historical Hardhat/Nox toolchain is incompatible with FCC's
runtime and would blur deployment authority.

## ADR-003 — Bid transport and permanent privacy

**Decision:** Plaintext and encrypted bid payloads do not go on-chain. Vendors
submit an ECIES-encrypted canonical bid through authenticated HTTPS to the
public proxy endpoint for each tender's selected TEE machines. Each TEE:

1. decrypts inside the confidential runtime;
2. validates chain, market, extension, tender, vendor, rule version, and nonce;
3. verifies any credential signatures;
4. seals the bid in TEE-controlled encrypted storage;
5. returns a signed `BidReceipt` containing only public binding and a salted
   plaintext commitment.

The vendor submits the receipt set to the market before the deadline. The chain
stores receipts and commitments, not ciphertext.

**Reason:** Official FCC guidance warns that encrypted secrets stored on-chain
remain permanently public and may be decrypted by future cryptanalytic
advances. Private ingress avoids permanent ciphertext publication.

**Constraint:** Gate B must prove that the supported FCC proxy/TEE deployment
can expose a hardened private-ingress path. If the official environment cannot
support it, the architecture returns to planning; an on-chain ciphertext
fallback is not considered championship-complete.

**Current transport mapping:** The pinned 2026 FCC proxy exposes API-key
protected `POST /direct`, removes the queued action body after the TEE fetches
it, and exposes the signed `ActionResult` separately. VeilBid uses that direct
queue only for opaque ECIES. The API key remains server-side; a vendor-facing
gateway authenticates the vendor request without learning the plaintext. The
extension calls only tee-node's loopback `/decrypt` and `/sign` endpoints and
stores the original ECIES bytes in a private persistent volume keyed by a hash
of chain/market/extension/tender/vendor. Exact ciphertext retry is idempotent;
a different ciphertext for the same slot fails. This mapping remains local
evidence until proxy body-log inspection and a real machine restart pass Gate
B.

## ADR-004 — Canonical bid schema

**Decision:** Use a versioned deterministic binary schema shared by generated
Solidity, Go, and TypeScript representations:

```text
schemaVersion
chainId
market
extensionId
codeVersion
tenderId
vendor
submissionNonce
rules                 // canonical public SCORING_V1 policy; rulesHash is derived
receiptExpiry
quoteCurrency       // XRP or USD in the championship release
price               // uint64, 6 decimal fixed point
deliveryDays        // uint16
warrantyDays        // uint16
credentialSet       // bounded issuer/type/signature tuples
salt                // 128-bit or stronger random value
```

The rules tuple fixes the escrow ceiling, deadline, enabled quote currencies,
FTSO feed, service bounds, three weights, and at most four required credential
issuer/type pairs. Its hash is `keccak256(abi.encode(RULES_DOMAIN, rules))`.
Carrying the preimage lets the TEE validate policy without trusting a relay;
the contract and public metadata expose the same non-secret policy.

The plaintext commitment is
`keccak256(abi.encode(BID_DOMAIN, canonicalBidTuple))`. The random salt prevents
practical enumeration of low-range bid values. `BID_RECEIPT_V1` separately
binds its schema version, chain, market, extension, code, tender, derived rules
hash, vendor, nonce, plaintext commitment, TEE identity, and expiry. The
receipt signature is excluded from its own digest.

Unsupported fields, currencies, encodings, duplicate credentials, and unknown
schema versions fail closed.

## ADR-005 — TEE selection, quorum, and result trust

**Decision:** The championship release uses three registered TEE identities and
requires two matching result signatures.

- The market obtains or validates three registered machines for the fixed
  extension/code version before a tender opens.
- Machine identities and public-key fingerprints are frozen per tender.
- A bid may enter `Accepted` only if its receipt bitmap preserves a common
  two-machine quorum across every accepted bid.
- `commonQuorumBitmap` begins with all selected machines and is intersected with
  each bid's valid receipt bitmap.
- Close is permitted only while the bitmap contains at least two machines.
- Selection instructions target the fixed common quorum.
- Finalization requires two distinct approved machines to sign the exact same
  result digest.

One-machine FCC execution is allowed only for Gate A/B development and must be
labeled `1-of-1 development mode`. It cannot satisfy the championship release
gate unless the organizer-provided infrastructure makes multiple registered
machines unavailable, in which case the limitation must be disclosed and the
submission claim reduced.

**Reason:** Threshold agreement reduces single-machine correctness and
availability risk without pretending that TEE computation is zero knowledge.

## ADR-006 — Key rotation and code upgrades

**Decision:** No encryption key, machine set, extension ID, result threshold, or
code version changes after a tender becomes `Open`.

- New versions apply only to new tenders.
- A machine can be removed before the first accepted bid if the remaining set
  still meets policy and the buyer republishes the tender binding.
- After a bid is accepted, recovery can use only machines already inside the
  frozen common quorum.
- Losing quorum after close produces an explicit liveness failure; it never
  enables a buyer-chosen winner or timeout refund.

Extension governance may approve new versions for future tenders but has no
winner override, escrow withdrawal, or retroactive tender mutation.

## ADR-007 — TEE sealed state and recovery

**Decision:** Every TEE persists only sealed/encrypted tender state. The public
chain remains the canonical index of accepted bid commitments and receipt
ordering.

The sealed state includes:

- exact canonical plaintext bid bytes;
- commitment and receipt sequence;
- tender/rules binding;
- monotonic local checkpoint.

The TEE exposes no plaintext backup endpoint. Restore is permitted only through
the FCC-supported confidential key/state recovery mechanism for the same
extension and approved code version. The chain's ordered receipt root is used
to detect missing, duplicated, or rolled-back sealed state.

The application has no plaintext database. Proxy Redis is queue/cache state,
not procurement authority.

## ADR-008 — Ordered receipt root and tie rule

**Decision:** The contract assigns a one-indexed bid ID when a threshold-valid
receipt set is accepted and updates:

```text
EMPTY_ROOT = keccak256("VEILBID_EMPTY_BID_ROOT_V1")
ROOT_DOMAIN = keccak256("VEILBID_BID_ROOT_V1")
root_0 = EMPTY_ROOT
root_n = keccak256(abi.encode(
  ROOT_DOMAIN,
  root_n-1,
  tenderId,
  bidId,
  vendor,
  plaintextCommitment,
  receiptBitmap,
  acceptedBlock
))
```

The earliest accepted bid wins an exact score tie. TEE implementations rebuild
the same root from signed receipts and reject state mismatch before scoring.

## ADR-009 — Deterministic multi-criteria scoring

**Decision:** Use hard eligibility plus a public weighted penalty. No AI,
natural-language judgment, or buyer-supplied post-close scoring is allowed.

Eligibility:

- valid issuer signatures for every required credential type;
- price converts to a positive XRP amount at or below escrow ceiling;
- delivery days at or below public maximum;
- warranty days at or above public minimum;
- all numeric inputs within fixed schema bounds.

Weights are basis points summing exactly to `10_000`:

```text
pricePenalty    = ceil(priceXrp * SCALE / ceilingXrp)
deliveryPenalty = deliveryDays * SCALE / maxDeliveryDays
warrantyPenalty = (maxWarrantyDays - min(warrantyDays, maxWarrantyDays))
                  * SCALE / (maxWarrantyDays - minWarrantyDays)

totalPenalty =
    priceWeightBps    * pricePenalty
  + deliveryWeightBps * deliveryPenalty
  + warrantyWeightBps * warrantyPenalty
```

`SCORING_V1` fixes `SCALE = 1_000_000_000`, weights to unsigned basis points
that sum to `10_000`, and XRP/USD quote inputs to unsigned six-decimal units.
USD payout conversion is
`ceil(usdMicros * 10^ftsoDecimals / ftsoValue)` for nonnegative FTSO decimals,
with the algebraically equivalent denominator adjustment for negative
decimals. Supported FTSO decimals are `[-18, 18]`; an invalid shared snapshot
fails the whole selection and can never be converted into a zero-winner refund.

At most four credentials are allowed, with exactly one for every distinct
required `(credentialType, issuer)` pair and no extras. Each issuer signs the
Ethereum signed-message hash of a canonical digest binding chain, market,
extension, code, tender, rules, vendor, type, validity, and nonce. Credentials
must remain valid at the frozen evaluation checkpoint. Signatures must be
canonical low-S secp256k1 signatures.

All intermediate arithmetic uses checked arbitrary-precision integers in the
Go reference, with the final payout bounded to `uint64` and the public escrow
ceiling. Lowest total penalty wins; the lower canonical bid ID wins an exact
tie. The result publishes winner and FXRP payout, not losing inputs or component
penalties.

## ADR-010 — FTSO price snapshot

**Decision:** Championship tenders accept XRP- or USD-denominated bids and settle
in FTestXRP/FXRP. At close, the market captures the official `XRP/USD` FTSO feed:

- feed ID;
- value;
- decimals;
- timestamp;
- close block.

The feed must be positive and within the configured freshness bound. The exact
snapshot is included in the FCC instruction and signed result. The TEE converts
USD quotes to XRP with checked integer math and rounds the winner payout upward
to avoid underpaying the vendor. XRP quotes require no conversion.

FTSO is unavailable only when the tender enables USD quotes. A stale/unavailable
snapshot pauses close rather than accepting a manual price.

## ADR-011 — Asset and settlement

**Decision:** The championship release supports only official FTestXRP on
Coston2, resolved through supported Flare registry/periphery tooling. A generic
ERC-20 is permitted for early Gate D tests but cannot appear in the final judge
lifecycle.

- Buyer escrows a public XRP-denominated ceiling.
- Winner receives the public converted FXRP amount.
- Buyer receives the public remainder.
- Zero winner refunds the full escrow.
- Fee-on-transfer or rebasing tokens are unsupported.
- Settlement state changes before external token calls.
- Winner can redeem FXRP through the official FAssets flow; VeilBid never holds
  an XRPL secret.

Ordinary token amounts and the final winning price are public.

## ADR-012 — XRP-native buyer and FDC role

**Decision:** The flagship buyer journey uses the Flare Smart Accounts `0xFE`
hash-committed custom instruction flow.

The XRPL user:

1. derives its deterministic Flare PersonalAccount and nonce;
2. builds a `PackedUserOperation` containing FTestXRP approval plus
   `createTender`/funding calls;
3. commits the operation hash in an XRPL payment memo;
4. supplies the operation bytes to the executor;
5. relies on an FDC `XRPPayment` proof and `executeDirectMintingWithData` to
   atomically mint FXRP and execute the tender calls.

The contract treats the PersonalAccount as buyer. XRPL transaction ID, user-op
hash, sender, and nonce provide the cross-chain audit trail. An EVM wallet path
remains available for vendor operations and recovery.

**Reason:** FDC, FAssets, and Smart Accounts become one meaningful onboarding
and funding capability rather than decorative integrations.

## ADR-013 — Result retrieval and finalization

**Decision:** Close and finalization are asynchronous and permissionless:

1. `closeTender` freezes receipt root, common quorum, FTSO snapshot, and close
   checkpoint.
2. `requestSelection` sends the fixed action to every TEE in the common quorum.
   The action message is a versioned tuple. It carries only public tender
   policy/checkpoint fields and ordered bid references; sealed bid payloads are
   fetched by the extension from its private store using a domain-separated
   slot. The request also freezes a one-hour result expiry so every machine
   signs the same envelope.
3. A stateless relay polls public proxy endpoints for results.
4. It groups results by digest and submits signatures only when the configured
   threshold agrees.
5. The market reconstructs the domain-separated digest, validates distinct
   registered signers, and settles once.

The relay stores only public request IDs, result digests, signatures, and
transactions. A browser or competing relay can resume from chain state.

## ADR-014 — Signature domain

**Decision:** Bid receipts and selection results use separate EIP-712-compatible
domains or an equivalently exact FCC-supported domain-separated digest.

Result binding includes:

```text
schemaVersion, chainId, market, extensionId, codeVersion,
tenderId, rulesHash, orderedBidRoot, commonQuorumBitmap,
ftsoFeedId, ftsoValue, ftsoDecimals, ftsoTimestamp,
closeBlock, winnerBidId, winner, winningAmount,
resultNonce, expiry
```

The verification code follows the current FCC node signing convention,
including its action-result prefix and chain binding. Recovering a raw payload
hash without the FCC domain is forbidden.

## ADR-015 — Administration and deployment

**Decision:** Contracts are non-upgradeable. An `Ownable2Step` or small
multisig-controlled registry may approve extension/code versions and asset/feed
policies for future tenders only. It cannot:

- modify an existing tender;
- decrypt a bid;
- choose or replace a winner;
- lower a result threshold after bidding;
- withdraw escrow;
- bypass FTSO/FCC/FAssets validation.

Every release records exact runtime bytecode, constructor arguments, Flare
registry addresses, FTestXRP/AssetManager, FTSO feed ID, Smart Account
controller, extension ID, code version, machine identities, and thresholds.

## ADR-016 — Evidence and product claims

**Decision:** A capability is submission-ready only when a real Coston2 judge
lifecycle exercises it. The final demo must show:

- XRP-signed Smart Account mint-and-fund;
- three TEE identities and the accepted quorum, or a prominently disclosed
  infrastructure limitation;
- two or more private multi-criteria bids;
- FTSO snapshot and deterministic signed result;
- threshold on-chain verification and FTestXRP settlement;
- FXRP redemption path;
- negative tamper/replay evidence;
- no mock or silent fallback.

No document may claim private settlement, anonymous vendors, verified service
delivery, zero-knowledge correctness, formal audit, or mainnet readiness.

## ADR-017 — FCC upstream drift and runtime pins

**Decision:** Treat the official FCC scaffold and examples as source references,
not automatically current runtime lockfiles. The first 2026-08-03 foundation
audit found their `main` branches still pinning `tee-node` `v0.0.21` and
`tee-proxy` `v0.0.18`, below the organizer-supplied `tee-node >= v0.0.22`
baseline.

VeilBid pins the exact scaffold/example commits for provenance, but selects and
tests the organizer-directed `develop` runtime line: `tee-node` `v0.0.24` at
`adc67a29eb7162f6f1b5dabcbca320009480695e` and `tee-proxy` at
`0c6d016b09948cba9a508ba357e592eb6088fd1c`. Both stages of the final proxy
image must be digest-pinned before Gate 0 passes. If these commits drift or fail
registration, the compatibility combination is re-researched and this ADR plus
the foundation manifest are revised before extension deployment.

**Reason:** A current scaffold commit can still contain operationally retired
runtime pins. Separating provenance from the tested runtime combination avoids
silently reproducing the stale registration/data-provider failures described by
the organizer bulletin.

## ADR-018 — Deterministic FCC foundation wire format

**Decision:** The first VeilBid FCC extension operation is `PING_V1`, with a
strict ABI tuple containing only `schemaVersion`, Coston2 `chainId`, market
address, one-time request nonce, and an opaque payload hash. The extension
returns the same public fields plus a binding hash over:

```text
keccak256(abi.encode(
  keccak256("VEILBID_FCC_FOUNDATION_V1"),
  OP_TYPE, OP_COMMAND, schemaVersion, chainId, market,
  requestNonce, payloadHash
))
```

The response is derived solely from the request, so independent TEE machines
cannot diverge because of local counters or timestamps. Rejected requests use
allowlisted error codes and never echo their bytes. The operation is a Phase 1
compatibility probe, not a bid path or a live FCC claim; private ingress and
selection remain gated by the real proxy, indexer, registration, and Coston2
verification evidence.

**Reason:** The scaffold's mutable greeting example was unsuitable for a
multi-machine result quorum and its error logs could grow into a privacy leak.
An explicit domain-bound ABI gives the contract, Go extension, and future
TypeScript bindings one stable seam while keeping foundation evidence public-safe.

## ADR-019 — Verify canonical FCC action results, not relay claims

**Decision:** Market finalization reconstructs the exact current `tee-node`
signature path from the pinned `go-flare-common` implementation:

```text
actionResultHash = keccak256(
  keccak256(resultData) || actionId || keccak256(submissionTag) || statusByte
)
signedPayload = keccak256(abi.encode(
  bytes32("TEE_ACTION_RESULT"), chainId, actionResultHash
))
signingHash = EthereumSignedMessage(signedPayload)
```

The contract constructs `resultData` itself from the submitted selection
result, requires the recorded FCC request ID, accepts only the official
`submit` or `threshold` tags with success status, and recovers distinct
tender-fixed TEE identities. At creation it checks each machine's live status,
extension ID, attested code hash, and public-key fingerprint through the
official `MachineManager` facet. It rechecks status and extension membership at
finalization.

The relay cannot substitute a raw selection digest, a proxy signature, an
application key, or an arbitrary action envelope. Local Foundry signatures are
test vectors only; the capability remains unverified until real proxy responses
from registered Coston2 machines settle the same contract.

**Reason:** `ActionResult.Signature` is the registered TEE identity proof
already produced by FCC. Verifying a custom application signature would add an
unnecessary key-registration trust path and would not prove that the official
FCC runtime processed the on-chain instruction.

## ADR-020 — Bounded selection retry and non-success escrow recovery

**Decision:** A selection attempt has a one-hour signed-result window. If it
expires without a valid threshold result, anyone may pay the FCC instruction
fee to retry against the same immutable root, quorum, machine set, FTSO
snapshot, and close block. Each attempt increments `selectionAttempt` and
derives a fresh `resultNonce`, result expiry, and FCC request ID, so a late
result from an older attempt cannot settle the tender.

The first attempt also freezes `selectionStartedAt`. After a fixed 24-hour
grace from that timestamp, the buyer may terminate an unresolved selection and
recover exactly the original FTestXRP escrow. Retries cannot extend this grace.
The recovery path records `Refunded`, creates no award, and cannot submit or
infer a winner; it is explicitly a failed-compute outcome rather than a success
fallback.

**Reason:** The earlier single one-hour request left escrow permanently locked
if FCC or its public proxy quorum stayed unavailable. A fixed grace prevents
third-party retry griefing from extending the lock, while permissionless retry
keeps transient infrastructure failures recoverable without changing any
procurement fact.

## ADR-021 — Constant-time extension-ID binding

**Decision:** Fresh FCC sender contracts never discover their extension by
scanning from public ID `65536`. The Gate-A replacement exposes only
`setExtensionIdExplicit(id)`, callable by its immutable deployment owner, and
accepts the ID once only when it is already allocated and the live extension
registry maps it back to that exact sender address.

The deployed V1 foundation sender remains unchanged so its runtime evidence is
reproducible, but it is permanently excluded from registration. The final
market already receives the extension ID explicitly and checks the same
registry mapping during tender creation, so it requires no discovery setter.

**Reason:** The current Coston2 public ID was `65922` on 2026-08-04. A loop over
every historical ID has unbounded growth and can become undeployable in
practice as registrations accumulate. Constant-time binding removes that
liveness dependency without allowing an owner or relay to substitute a foreign
extension.

## Official reference basis

These decisions must be revalidated against the pinned versions in Gate 0:

- [Flare Confidential Compute overview](https://dev.flare.network/fcc/overview)
  and [getting started](https://dev.flare.network/fcc/guides/getting-started)
- [FCC private-key example](https://dev.flare.network/fcc/guides/sign-extension)
  for ECIES/private-channel and long-lived ciphertext guidance
- [FCC signed-result example](https://dev.flare.network/fcc/guides/weather-insurance-extension)
  for domain-separated TEE result verification
- [Flare Smart Accounts overview](https://dev.flare.network/smart-accounts/overview)
  and [custom instruction flow](https://dev.flare.network/smart-accounts/custom-instruction)
- [FAssets reference](https://dev.flare.network/fassets/reference) and
  [redemption flow](https://dev.flare.network/fassets/developer-guides/fassets-redeem)
- [FTSO overview](https://dev.flare.network/ftso/overview) and
  [anchor feeds](https://dev.flare.network/ftso/scaling/anchor-feeds)
- [FDC overview](https://dev.flare.network/fdc/overview) and
  [payment attestation guide](https://dev.flare.network/fdc/guides/foundry/payment)

Documentation establishes the target protocol behavior, not proof that the
organizer environment exposes private ingress, sealed recovery, or three
machines. Gates 0–C must establish those facts before implementation proceeds.
