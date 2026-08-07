# VeilBid Flare Championship Feasibility Plan

> Status: Gate 0 passed on Coston2 at block `33745484`, Gate A passed at block
> `33745987`, live Gate-B ingress/replay passed at block `33746423`, Gates C–F
> passed in the three-bid lifecycle at block `33748772`, and Gate G passed at
> block `33752891`. The pinned images, indexer, three stable Railway origins,
> three distinct simulated TEE identities in `PRODUCTION`, private receipts,
> FTSO-bound scoring, exact FTestXRP settlement, and the XRPL/FDC/Smart Account
> funding path are recorded in public-safe evidence. A three-vendor recovery
> run also finalized with one result endpoint unavailable, while same-identity
> TEE restart recovery remains open because the supported simulated runtime
> rotates identity on restart. Gate H and release hardening remain mandatory.

## 1. Rules

- Pin exact official source commits, images, interfaces, and registry discovery.
- Use real Coston2 transactions for every network-dependent pass.
- Label simulated versus hardware-backed TEE evidence exactly.
- Save only public identifiers, hashes, statuses, and assertion booleans.
- Never save bid plaintext/ciphertext, credentials, TEE/wallet/XRPL keys,
  proxy/indexer secrets, or sensitive raw responses.
- A kill condition pauses dependent full development; it is not converted into
  a mock or weaker public claim without Product Plan approval.

## 2. Gate 0 — infrastructure and version pinning

Prove:

- official FCC scaffold and example commit are reachable and pinned;
- exact Go, Foundry, Solidity, Docker, Node, pnpm, and Flare dependency versions;
- Coston2 registry/FCC configuration is resolved from supported sources;
- live `FlareTeeManager` bytecode/interface matches the pinned official
  configuration (the supplied redeploy bulletin currently reports
  `0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE`);
- tested `tee-node >= v0.0.22` and organizer-supported `tee-proxy` revisions;
- current indexer access and a stable named HTTPS endpoint are available;
- a fresh extension/machine registration uses `rRap`, the on-chain URL matches
  `EXT_PROXY_URL`, and machine status reaches `2` (`PRODUCTION`);
- confidential/simulated TEE mode is explicitly identified;
- at least three registered machines can serve one extension, or the exact
  organizer infrastructure limit is recorded;
- official FTestXRP, AssetManager, XRP/USD FTSO, MasterAccountController, FDC
  verifier, and DA paths are discoverable.

Kill condition: a mandatory service is unavailable or depends on undocumented,
unverifiable addresses/credentials, or the registration preflight in
[`fcc-coston2-operations.md`](fcc-coston2-operations.md) does not pass.

## 3. Gate A — registered FCC result

Prove on Coston2:

1. Deploy the minimal `VeilBidFoundationSenderV2`, register its fresh extension
   ID, and bind that exact ID with the constant-time registry-verified setter.
   Its ABI-compatible `PING_V1` operation does not process bids. The live but
   unregistered V1 deployment is compatibility evidence only and cannot
   satisfy this step.
2. Register extension, governance, allowed code version, and TEE machine.
3. Send a domain-bound action through the official registry.
4. Retrieve the action result from the proxy.
5. Verify the current FCC result-signing prefix/domain and registered signer
   on-chain.
6. Reject wrong chain, sender, action, payload, code version, and signer.
7. Resume result retrieval from a fresh process.

Kill condition: the target contract cannot verify and recover a result from a
registered FCC identity without trusting an application server.

## 4. Gate B — private bid ingress and sealed recovery

Live partial result: `evidence/coston2/gate-b-private-ingress.json` records three
production-status Coston2 simulated TEEs accepting independently encrypted
XRP bids, binding signed receipts to the same market/tender/vendor/rules
commitment, an exact-ciphertext idempotent retry, and rejection of a changed
ciphertext for the occupied sealed slot. It intentionally remains
`IN_PROGRESS`: a same-identity restart/restore proof is not claimed because the
supported tee-node runtime generates a new identity after restart.

Prove:

1. Vendor fetches and verifies the intended machine identity/key.
2. Vendor canonicalizes and ECIES-encrypts `BID_SCHEMA_V1` off-chain.
3. Authenticated proxy ingress forwards only opaque ciphertext to the TEE.
4. TEE decrypts, validates binding/nonce/credential schema, seals state, and
   returns a signed `BID_RECEIPT_V1`.
5. Plaintext and ciphertext remain absent from chain, public proxy logs,
   analytics, browser persistence, and evidence.
6. TEE restarts and restores sealed state whose receipt root matches chain.
7. Wrong key, tender, vendor, rule, nonce, schema, commitment, and replay fail.

Kill condition: the supported FCC environment cannot provide private ingress
and sealed recovery without permanently publishing ciphertext or storing
plaintext in an application database.

## 5. Gate C — common multi-TEE bid quorum

Live core pass: `evidence/coston2/gate-c-e-f-live-lifecycle.json` records three
distinct production machines accepting the same three encrypted bids, a common
three-machine receipt quorum, and the ordered root for tender `11`. The
additional `evidence/coston2/three-vendor-recovery.release.json` run collected
only two result endpoints and still finalized with the frozen quorum.

Prove with three registered machines:

- each bid receives three mutually consistent receipts from the three frozen
  machines and therefore has the exact receipt bitmap `0x07`;
- the contract accepts the three receipts atomically and rejects every partial
  set, so no two-machine-only bid can enter public state or the ordered root;
- forged, duplicate, wrong-machine, wrong-code, and mismatched-commitment
  receipts fail;
- the ordered root is identical in Solidity, Go, and TypeScript models;
- loss of any one machine after intake still leaves the same complete bid set on
  either surviving pair, while loss of two machines fails closed;
- the contract rechecks frozen machine status, extension, code version, and key
  fingerprint at receipt acceptance, selection dispatch, and finalization.

Kill condition: the contract can accept a bid without all three frozen
custodians, or any two remaining machines can observe different accepted bid
sets.

## 6. Gate D — deterministic private scoring

Live pass: the same evidence records the real FCC selection over XRP/USD
multi-criteria terms, with the winning result bound to the frozen rules and
ordered root. Losing inputs remain private.

Implement `SCORING_V1` and prove:

- required credential signatures gate eligibility;
- XRP quote requires no conversion;
- USD quote uses the exact bound XRP/USD snapshot;
- zero, negative-equivalent, over-ceiling, late-delivery, short-warranty,
  malformed, and unsupported bids cannot win;
- weighted price/delivery/warranty penalty matches shared golden vectors;
- lower penalty wins and earlier accepted bid wins exact ties;
- permutations preserve expected semantic winner except the explicit tie rule;
- checked math covers rounding, decimals, overflow, and zero denominators;
- result returns only winner and public FXRP payout, never losing inputs or
  component penalties.

Kill condition: implementations disagree, client/buyer must calculate winner,
or private scoring requires subjective/AI branching.

## 7. Gate E — threshold result and recovery

Live core pass: two distinct frozen TEE identities signed the exact same result
digest and the market finalized the result on Coston2. The evidence includes
the request and finalization transactions and the public binding assertions;
the recovery run also proves that one unavailable result endpoint does not
prevent threshold finalization. Same-identity restart and two-machine loss
remain part of release hardening.

Prove:

- close freezes root, common quorum, FTSO snapshot, and checkpoint;
- each selected TEE independently rebuilds exact state and signs the same result;
- market accepts two distinct registered compatible signers over one digest;
- split results do not reach threshold;
- wrong root/rule/feed/close block/winner/amount/nonce/expiry fails;
- duplicate finalization cannot settle twice;
- fresh relay/browser resumes close, request, collected results, and finalization;
- one-machine outage remains recoverable through the fixed common quorum;
- an expired attempt can be retried only with a fresh nonce/request while every
  frozen input remains identical, and late results from the old attempt fail;
- retries cannot extend the fixed 24-hour grace measured from the first
  request; after that grace, buyer recovery returns only the original escrow,
  records failed-compute `Refunded`, and creates no winner or award receipt.

Kill condition: one machine or an untrusted relay can unilaterally decide the
championship result, recovery changes the frozen input set, or a timeout path is
presented as a successful FCC selection.

## 8. Gate F — FTSO and exact FTestXRP settlement

Live pass: the official XRP/USD FTSO snapshot was captured at close and the
market paid the winner from the exact FTestXRP escrow, minting the award receipt
without recording private bid fields.

Prove:

- official FTestXRP/AssetManager and XRP/USD feed are resolved through supported
  tooling;
- close captures positive, fresh value/decimals/timestamp/block;
- stale/unavailable feed pauses only USD-enabled close;
- winning USD price rounds to the documented XRP payout;
- buyer escrows exact public ceiling;
- award plus remainder, or zero-winner refund, equals ceiling;
- unsupported/rebasing/fee-on-transfer asset cannot enter the release;
- reentrancy and token failure cannot settle partially or twice;
- winner can follow the supported FAssets redemption path without VeilBid
  receiving an XRPL secret.
- the awarded vendor can submit an amount-based `redeemAmount` request through
  the verified AssetManager, with the request event and agent payout obligation
  recorded without claiming that the underlying XRP payment is instant.

Kill condition: a generic test token or manually supplied price is required for
the final lifecycle.

## 9. Gate G — XRP-native Smart Account funding

Live pass: `evidence/coston2/gate-g-smart-account.json` records a disposable
XRPL testnet `0xFE` payment, FDC `XRPPayment` proof, direct mint execution,
PersonalAccount derivation/nonce binding, and atomic tender funding on Coston2.

Prove on XRPL testnet and Coston2:

1. Derive the PersonalAccount and nonce.
2. Encode FTestXRP approval and `createTender`/funding calls.
3. Commit the exact `PackedUserOperation` hash in an XRPL `0xFE` payment memo.
4. Obtain and verify the FDC `XRPPayment` proof.
5. Execute `executeDirectMintingWithData` atomically.
6. Confirm PersonalAccount is buyer and tender escrow is funded.
7. Reject wrong sender, nonce, operation bytes/hash, executor, payment, and
   duplicate transaction ID.
8. Exercise delayed mint and stuck-mint recovery without duplicate custody.
   The server-side executor now emits and resumes a public-safe checkpoint;
   relay tests prove no second FDC request, XRPL payment, or nonce. A live
   rate-limited Coston2 delay has not been forced and remains release-hardening
   evidence rather than a claimed live pass.

Kill condition: VeilBid needs a custodial signer or the XRP payment/mint/tender
actions cannot be cryptographically and atomically bound.

## 10. Gate H — product, evidence, and user validation

Prove:

- wallet-free Coston2 finalized tender loads from canonical events;
- XRP Buyer, Vendor, Public Finalizer, Activity, Evidence, and redemption flows
  work on desktop and mobile;
- no RPC/FCC/proxy/FDC/FTSO failure inserts mock success;
- exact source/runtime/extension/code/machine/binding facts agree;
- current and full-history secret/privacy scans pass;
- at least five buyer/treasury interviews and five vendor usability sessions are
  recorded honestly;
- at least one pilot/design-partner signal or a transparent absence is reported;
- a four-minute demo completes the flagship journey.

Kill condition: the product is only a developer script, the judge path requires
private credentials, or public claims exceed executed evidence.

## 11. Planned evidence

```text
evidence/coston2/gate-0-environment.json
evidence/coston2/gate-a-fcc-result.json
evidence/coston2/gate-b-private-ingress.json
evidence/coston2/gate-c-tee-quorum.json
evidence/coston2/gate-d-private-scoring.json
evidence/coston2/gate-e-threshold-recovery.json
evidence/coston2/gate-f-ftso-fassets.json
evidence/coston2/gate-g-smart-account.json
evidence/coston2/gate-h-product.json
```

Until an artifact passes its schema and live assertions, its capability remains
`NOT RUN` in `docs/verification.md` and `PLAN.md`. Gate B is intentionally still
`IN PROGRESS` because live same-identity restart recovery is not claimed.
