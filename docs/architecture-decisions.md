# FlareQuorum Architecture Decision Record

> Status: Accepted decisions with live Coston2 implementation/evidence for the
> FCC, ingress, market, and XRP-native funding path. Restart/recovery, final
> UX, and validation gaps remain explicitly tracked below. These decisions
> replace the open alternatives in the initial transition plan.

## ADR-001 — Product shape

**Decision:** FlareQuorum is a confidential multi-criteria procurement system
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
it, and exposes the signed `ActionResult` separately. FlareQuorum uses that direct
queue only for opaque ECIES. The API key remains server-side; a vendor-facing
gateway authenticates the vendor request without learning the plaintext. The
extension calls only tee-node's loopback `/decrypt` and `/sign` endpoints and
stores the original ECIES bytes in a private persistent volume keyed by a hash
of chain/market/extension/tender/vendor/submission nonce. Exact ciphertext
retry is idempotent; a different ciphertext for the same nonce fails, while a
new nonce cannot be blocked by an orphaned partial delivery. Live evidence covers
authenticated ciphertext-only ingress, three signed receipts, exact-retry
idempotence, and changed-ciphertext slot rejection on registered Coston2
simulated TEEs. The nonce-addressed revision is live in application image
`0.2.3`: tender `23` accepted three vendors through the replacement machine
set, and the supported three-machine replacement drill passed without
relabeling the unchanged simulated FCC wire measurement.

The local consumer binding now reproduces tee-node's go-ethereum ECIES scheme
byte-for-byte and verifies a shared Go/TypeScript decryption vector. The relay
gateway accepts only a strict ciphertext envelope plus short-lived EIP-712
authorization bound to market, tender, vendor, frozen TEE, submission nonce,
and ciphertext hash. Its request type has no plaintext bid fields. Before
forwarding it fails closed on closed/expired tenders, missing vendor admission,
prior submission, signature drift, and TEE identity/key-fingerprint drift.
This remains implementation evidence for the gateway authorization layer; the
direct-proxy result is now covered by the partial live Gate-B evidence above.

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

**Decision:** The championship release uses three registered TEE identities,
requires all three to acknowledge every accepted bid, and requires two matching
result signatures.

- The market obtains or validates three registered machines for the fixed
  extension/code version before a tender opens.
- Machine identities and public-key fingerprints are frozen per tender.
- A bid may enter `Accepted` only through one atomic set of three distinct,
  matching, currently valid machine receipts; its bitmap is exactly `0x07`.
- `commonQuorumBitmap` therefore remains the frozen three-machine custody set
  across every accepted bid.
- Selection instructions target the currently live members of that frozen set
  and require at least two; one post-intake machine outage is tolerated.
- Finalization requires two distinct approved machines to sign the exact same
  result digest, with status, extension, code hash, and public-key fingerprint
  revalidated at acceptance, dispatch, and finalization.

One-machine FCC execution is allowed only for Gate A/B development and must be
labeled `1-of-1 development mode`. It cannot satisfy the championship release
gate unless the organizer-provided infrastructure makes multiple registered
machines unavailable, in which case the limitation must be disclosed and the
submission claim reduced.

**Reason:** Threshold agreement reduces single-machine correctness risk, while
three-machine custody lets either surviving pair reconstruct the same accepted
bid set after one outage. Requiring all three receipts makes intake depend on
all three machines; that deliberate availability tradeoff is measured in Gate
C rather than hidden behind a weaker two-receipt claim.

## ADR-006 — Key rotation and code upgrades

**Decision:** No encryption key, machine set, extension ID, result threshold, or
code version changes after a tender becomes `Open`.

- New versions apply only to new tenders.
- Recovery can use only machines already inside the frozen common quorum.
- Losing one machine after bid acceptance preserves a valid two-machine result
  path. Losing two produces an explicit liveness failure and can reach only the
  documented failed-compute escrow refund after its fixed grace; it never
  enables a buyer-chosen winner.

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
- Winner can redeem FXRP through the official FAssets flow; FlareQuorum never holds
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

FlareQuorum pins the exact scaffold/example commits for provenance, but selects and
tests one wire-compatible runtime pair: `tee-node` `v0.0.23` at
`9090eccbae1111742bd83ef0601485d9503b4a13` and `tee-proxy` at
`0c6d016b09948cba9a508ba357e592eb6088fd1c`, whose own module graph resolves
the same `tee-node` version. This supersedes the briefly tested independent
`v0.0.24` extension pin after 2026-08-05 Flare maintainer guidance confirmed
that node/proxy wire formats must be aligned rather than upgraded separately.
That decision describes the verified V1 runtime. On 2026-08-12, scaffold
commit `e3f587949069780084e2ced8a53c9419ed05c250` became the current known-good
set and superseded it for the V2 rolling replacement: `tee-node v0.0.24`,
`tee-proxy v0.0.18`, and
`go-flare-common v1.2.2-0.20260727094511-09a10067e6a4`. The V2 extension and
registration operator use the scaffold's exact module pins; the proxy uses the
exact scaffold-pinned proxy tag. The proxy's own transitive module graph is not
misrepresented as the extension's runtime graph.

The FlareQuorum proxy recipe pins the
official source archive by checksum and both build stages by digest. Gate 0 also
requires the recipe to be built and the resulting immutable release image
digest recorded; reproducible inputs alone are not deployment evidence. If
these commits drift or fail registration, the compatibility combination is
re-researched and this ADR plus the foundation manifest are revised before
extension deployment.

**Reason:** A current scaffold commit can still contain operationally retired
runtime pins. Separating provenance from the tested runtime combination avoids
silently reproducing the stale registration/data-provider failures described by
the organizer bulletin.

## ADR-018 — Deterministic FCC foundation wire format

**Decision:** The first FlareQuorum FCC extension operation is `PING_V1`, with a
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

Every custom FCC operation identifier uses Solidity's `bytes32("text")`
representation: UTF-8 bytes followed by zero bytes to length 32. Go uses
`op.Type.Hash`/`teeutils.ToHash`, and TypeScript uses `stringToHex` with
`size: 32`. These identifiers are never `keccak256` hashes. Cross-language
literal vectors cover selection so a client cannot reject a valid live result
while still passing self-generated fixtures.

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

## ADR-022 — Dedicated fail-closed FDC funding executor

**Decision:** The XRP-native funding executor is a separate Coston2 writer with
its own disposable key. It never falls back to the deployer or FCC finalizer
key and never receives an XRPL seed. A submitted job contains only the public
XRPL transaction ID, PersonalAccount/nonce, memo fee, and canonical public
tender terms. The executor deterministically rebuilds the only allowed batch:
exact FTestXRP approval followed by `VeilBidFlareMarket.createTender`.

Before writing, it resolves FdcHub, fee configuration, FdcVerification,
FlareSystemsManager, Relay, AssetManagerFXRP, FTestXRP, and
MasterAccountController through the official registry at a finalized Coston2
checkpoint. It then:

1. requires three validated XRPL ledgers;
2. binds the `XRPPayment` proof to the executor EOA;
3. reads and pays the current on-chain FDC request fee;
4. derives the voting round from the mined request block timestamp;
5. waits for Relay finalization and decodes the DA v1 raw proof;
6. checks transaction, source, owner, round, memo, no destination tag, and a
   fee-aware minimum received amount;
7. verifies the XRPL source derives the expected PersonalAccount and rereads
   the nonce immediately before simulation/submission; and
8. reports success only when one receipt contains contract-address-bound
   `DirectMintingExecutedToSmartAccount`, `UserOperationExecuted`, and
   `TenderCreated` events with the exact expected fields.

`DirectMintingDelayed` is a distinct non-success outcome. Verifier/DA/API
credentials, raw proofs, source addresses, and provider errors are not emitted
by the CLI. The delayed result includes a public-safe checkpoint that can be
resumed without a second XRPL payment, FDC request, or nonce; resume rejects
quote, domain, user-operation, and nonce drift before writing. The minimal local ABIs are drift-tested against the exact
`@flarenetwork/flare-wagmi-periphery-package@3.6.0` package.

**Reason:** This makes FDC, FAssets, and Smart Accounts essential to tender
creation while preventing an executor from becoming a generic arbitrary-call
relayer or a source of fabricated success evidence.

## ADR-023 — Contract-canonical public scoring policy

**Decision:** `VeilBidFlareMarket.createTender` accepts the complete versioned
`ScoringPolicy`, validates its ceiling, deadline, quote currencies, service
bounds, weight sum, credential requirements, and network feed policy, stores
the tuple, and derives `rulesHash` itself. The former independent client
`rulesHash` field is removed from the Solidity ABI, Smart Account builder, and
funding-job schema. Finalized public readers load both the tender and its exact
policy, and the relay independently derives the hash before it accepts a
`TenderCreated` event as funding success.

For this Coston2 release, a USD-enabled policy must use the official bytes21
XRP/USD feed ID
`0x015852502f55534400000000000000000000000000`. XRP-only policy must use the
zero feed ID and closing it does not call FTSO. USD-enabled close rejects zero,
future, stale, or unsupported-decimal snapshots. A shared golden vector fixes
the policy hash across Solidity, Go, and TypeScript.

**Reason:** The previous ABI could pair an arbitrary caller-controlled hash
with only a ceiling, deadline, and feed identifier on-chain. That made the
published procurement rule unverifiable and allowed the client representation
to diverge from what FCC scored. Canonical storage and derivation make the
transparent rule a contract fact while keeping every bid value and credential
private. This is locally tested architecture only until the replacement market
is deployed and runtime-verified on Coston2.

## ADR-024 — Three-receipt custody with two-machine outage recovery

**Decision:** The earlier incremental `submitBidReceipt` path is replaced by a
single bounded `submitBidReceipts` call containing exactly three matching
receipts and signatures. Partial sets never create public pending state and a
two-receipt bid never enters the ordered root. The contract and FCC extension
both reject any accepted reference whose receipt bitmap is not `0x07`.

The three frozen identities are revalidated against the live manager at bid
acceptance. At selection dispatch the contract sends only to currently valid
members of the frozen set and requires at least two. At finalization it again
checks production status, extension ID, attested code hash, and frozen public
key fingerprint for each recovered signer. Local adversarial tests prove that
one outage still settles, two outages stop dispatch, and code/key drift fails
closed.

**Reason:** Accepting a bid immediately after the first two receipts made those
two machines the permanent common quorum and prevented the third receipt from
being added. An outage of either selected custodian then halted selection, so
the claimed three-machine topology provided no arbitrary one-machine failover.
The fixed set restores that property without exposing bids, ciphertext, or
partial receipt state. Live Gate C evidence remains required.

## ADR-025 — TEE identity restart boundary

**Decision:** Do not export, log, inject, or host-persist a raw TEE identity
private key. The pinned official `tee-node v0.0.24` initializes an identity key
in memory and its public extension server starts from `ZeroState`; neither that
release nor the inspected `v0.0.25` release exposes a supported identity-key
restore path. Consequently, restarting the `extension-tee` process creates a
new machine identity and invalidates the old registration.

Until Flare publishes a supported sealed identity/state restore mechanism,
FlareQuorum treats a machine restart as loss of that frozen machine, not as
same-machine recovery. The championship topology uses three independent
long-lived machines, stores the same accepted bid set on all three, and allows
the two surviving registered identities to produce the exact same selection.
A replacement identity may be registered only for new tenders; it cannot be
substituted into a tender that already froze its machine set.

The hackathon organizer confirmed on 2026-08-08 that this is the supported
production model: a replacement may keep the same extension, approved code
configuration, and public endpoint, but receives a new identity and must pass
the normal registration, attestation, and availability flow before returning
to production. The stale identity is then removed from rotation. Supported
fault drills use this replacement procedure and do not patch or export the
runtime identity key.

The existing file-backed sealed-store test proves extension state persistence
only. It is not live TEE restart evidence because the regenerated node identity
cannot decrypt ciphertext addressed to the former key. Gate B restart evidence
therefore remains open. A raw Docker secret, host file, embedded key, or
deployment-wallet-derived identity is not an acceptable workaround.

**Reason:** Identity rotation explains production machines that remain
registered but no longer answer for the running container. Preserving two
survivors is compatible with the threshold design and safer than weakening the
TEE trust boundary to manufacture same-identity restart evidence.

This boundary was rechecked against Flare's pinned upstream source: the
official `tee-node v0.0.24` `node.Initialize` implementation generates a fresh
key with `crypto.GenerateKey()` and derives `teeID` from that key on every
process start; it does not load an identity key from `SEALED_STORE_DIR`.
The upstream `main` implementation was checked again on 2026-08-08 and still
uses the same `crypto.GenerateKey()` initialization in
[`internal/node/node.go`](https://github.com/flare-foundation/tee-node/blob/main/internal/node/node.go);
no supported identity-restore configuration was found.
The local Docker restart boundary is recorded in
`evidence/local/fcc-local-tee-restart-boundary.json`: the public fingerprint
changed after one TEE restart, and a post-refresh three-machine local smoke
still passed without treating the replacement identity as registered.
The official Coston2 guide also treats `rRap` as the supported registration
operation and documents re-running registration after environment changes.
FlareQuorum therefore does not fork or patch the framework to restore an identity
key, because that would be an unsupported runtime/code path and would require a
new extension image/code-version registration.

## ADR-026 — Nonce-addressed sealed bid slots

**Decision:** A sealed bid slot is keyed by chain, market, extension, tender,
vendor, and `submissionNonce`. Selection derives the same slot from the
on-chain accepted bid reference and decrypts only that ciphertext. Exact
ciphertext delivery retries remain idempotent for one nonce, while a partially
delivered attempt cannot block a fresh nonce after the browser loses its
ephemeral session state.

Ciphertext from an attempt that never obtains three receipts remains sealed on
only the machines that accepted it. It is not referenced by the ordered root,
cannot participate in winner selection, and is never returned through a public
API. Storage retention and operator cleanup may remove such unreferenced slots
after the tender lifecycle; cleanup must not delete a nonce referenced by an
accepted on-chain bid.

**Reason:** Browser persistence of bid ciphertext or recovery secrets is
forbidden. A vendor+tender-only slot made a one-machine partial delivery
permanently conflict with a new encrypted attempt, even though no bid entered
the canonical root. Binding the existing one-time submission nonce into the
slot preserves privacy and replay protection while making delivery failures
recoverable without a plaintext shadow ledger or public ciphertext.

## ADR-027 — Separate application-image and simulated FCC wire versions

**Decision:** Version the reproducible FlareQuorum application image independently
from the FCC manager wire/code version. The nonce-addressed bid-slot release is
application image `0.2.3`, while its Coston2 simulated runtime continues to emit
the already registered FCC wire version `0.2.2`. The foundation manifest records
both values and validation requires the Go response constant to equal
`wireVersion`, not the image tag.

This separation is required because the live simulated `/info` measurement did
not change when the FlareQuorum application binary changed. The verified
`ExtensionManagerFacet.addTeeVersion` implementation keys versions by code hash
and rejects an existing hash with `VersionAlreadyExists`; the same simulated
measurement therefore cannot be relabeled from `v0.2.2` to `v0.2.3`. Production
hardware rollout must instead register the real measured code hash and its
matching version before use.

**Reason:** Treating an application tag as though it were a new manager-attested
measurement would either revert or create misleading evidence. Keeping the two
version domains explicit preserves the real on-chain binding while the image
digest and binary SHA-256 independently prove which FlareQuorum code was deployed.
This is a limitation of the accepted simulated Coston2 topology and must not be
described as hardware-backed application measurement.

## ADR-028 — Bounded recovery before the first selection dispatch

**Decision:** Preserve the verified V1 contract and deployment evidence
unchanged, and introduce a side-by-side immutable `FlareQuorumMarketV2`
candidate. V2 records `closedAt` when a tender enters `Closed` and lets only the
buyer call `refundUndispatchedTender` after a fixed 24-hour close grace when no
selection request has ever succeeded.

The recovery requires `Closed`, nonzero `closedAt`, zero
`selectionStartedAt`, and zero `requestId`. It performs no TEE-manager read,
marks the tender `Refunded` before transferring the exact ceiling, and emits an
explicit `UndispatchedTimeout` reason. A successful request changes the state
to `ComputePending`, after which only the existing post-dispatch grace and
`refundExpiredSelection` apply. Retries never reset that first-dispatch clock.

V2 keeps the existing `VEILBID_*` receipt, result, root, and FCC operation
literals for wire compatibility. Chain ID, market address, extension, code,
tender, rules, root, nonce, and expiry still prevent cross-release replay. The
new contract and receipt use FlareQuorum names; no V1 source, manifest,
address, or historical evidence is relabeled.

**Reason:** In V1, `requestSelection` reverts atomically when fewer than two
frozen identities are active. The tender remains `Closed`, its
`selectionStartedAt` remains zero, and neither the open-tender cancellation nor
post-dispatch refund path applies. External quorum loss can therefore lock the
escrow indefinitely. The separate V2 path bounds that state without letting a
buyer choose a winner, weaken the threshold, replace a frozen machine, or
represent the refund as FCC success.

**Release boundary:** Local unit, fuzz, reentrancy, token-failure, and stateful
conservation tests pass. The side-by-side V2 candidate, fresh extension and
three-machine set, runtime/constructor verification, candidate bindings, and
flagship lifecycle are live and verified as candidate evidence. Its
undispatched-refund tender is waiting for the real fixed grace. Until that
lifecycle and promotion pass, `coston2.release.json` and its V1 limitation
remain the authoritative consumer facts.

## ADR-029 — Live registry and exact active-machine preflight

**Decision:** Every new market deployment and release promotion re-resolves
`FtsoV2` from the live Coston2 `FlareContractRegistry` before any transaction or
promotion write. A mismatch with the reviewed foundation binding is a hard
failure even when the old address still contains bytecode.

Machine registration separately queries `getActiveTeeMachines(extensionId)`.
Before registration it permits only an empty or partial subset of the intended
three identities with exact public routes; any foreign, duplicate, or stale
identity/route blocks execution. After registration, the complete active set
must be exactly the three intended identities and routes, and every individual
machine binding and availability window must pass at one checkpoint. The check
derives the last availability time from the manager's validity duration and
requires age `<6h`. A read-only `GET /instruction` must return `405` at every
public origin, confirming the provider-facing POST route without submitting a
payload. Stale retirement remains a separate irreversible owner operation
guarded by unfinished-tender checks.

**Reason:** Protocol addresses can change without making the retired contract
revert, so deployed code alone cannot establish canonical FTSO authority.
Likewise, a valid dispatch event and three healthy `/info` endpoints do not
prove provider delivery. Providers POST directly to the selected registered
`/instruction` route; status `2` with an expired availability window or a stale
identity can still fail intermittently. These pre-write checks turn silent
dependency drift into explicit blockers without weakening FCC thresholds or
changing a frozen tender.

## ADR-030 — Keep public Buyer Brief preimages off-chain but hash-verified

**Decision:** Keep the existing market `metadataHash` contract interface. Before
any buyer approval, XRP payment, or tender-creation request, the browser
canonicalizes the public Buyer Brief, publishes its exact preimage to an
immutable content-addressed ingress registry, and checks the returned hash. A
consumer displays the human-readable brief only after parsing the strict schema
and independently recomputing the on-chain hash.

The registry is public availability infrastructure, not canonical procurement
state. It accepts only title, category, objective, acceptance criteria,
optional vendor questions, asset, deadline, and approved vendor addresses. It
rejects unknown and bid-shaped fields. Missing, corrupt, unavailable, or
mismatched content produces an explicit hash-only/failure state; no client may
invent or recover text from the hash.

**Reason:** Vendors need the complete public requirements without requiring the
buyer wallet or a contract expansion. The existing content commitment already
provides integrity, while a small persistent registry provides readable
availability without putting long text on-chain or weakening bid privacy. This
does not require a market redeployment. It does require the registry to be
deployed before the publishing web build and its storage directory to use a
persistent hosted volume.

## Official reference basis

These decisions must be revalidated against the pinned versions in Gate 0:

- [Flare Confidential Compute overview](https://dev.flare.network/fcc/overview)
  and [getting started](https://dev.flare.network/fcc/guides/getting-started)
- [FCC private-key example](https://dev.flare.network/fcc/guides/sign-extension)
  for ECIES/private-channel and long-lived ciphertext guidance
- [FCC signed-result example](https://dev.flare.network/fcc/guides/weather-insurance-extension)
  for domain-separated TEE result verification
- [Pinned tee-node v0.0.24 source](https://github.com/flare-foundation/tee-node/blob/v0.0.24/internal/node/node.go)
  for the identity initialization boundary described in ADR-025
- [Inspected tee-node v0.0.25 source](https://github.com/flare-foundation/tee-node/blob/v0.0.25/internal/node/node.go)
  for the current identity initialization boundary; it still generates the
  node key during `Initialize` rather than restoring it from the sealed-store
  directory
- [Current tee-node main source](https://github.com/flare-foundation/tee-node/blob/main/internal/node/node.go)
  checked 2026-08-08; it still generates the identity key during `Initialize`
  and does not expose a supported restore setting
- [Verified Coston2 FlareTeeManager diamond](https://coston2-explorer.flare.network/address/0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE)
  and its `ExtensionManagerFacet` source checked 2026-08-08 for the immutable
  code-hash-to-version insertion rule described in ADR-027
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
