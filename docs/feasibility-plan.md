# Flare Feasibility Plan

> Status: Not started. Full Flare development is blocked until Gates A–E pass.

## 1. Purpose

The historical Nox release proves the product concept, not FCC compatibility.
Flare uses a different execution, encryption, identity, signature, and recovery
model. These gates must establish the new boundaries on Coston2 before the UI
or full contract suite is ported.

Every live gate records sanitized public identifiers only. Never save wallet
keys, TEE private material, indexer credentials, plaintext bids, encrypted bid
payloads, or sensitive proxy responses.

## 2. Gate A — FCC instruction and registered result

Prove on Coston2:

1. Deploy an instruction-sender contract.
2. Register a VeilBid test extension and permitted code version.
3. Register a TEE machine through the supported FCC flow.
4. Send a `HELLO_VEILBID` instruction.
5. Retrieve a result and verify its domain-separated TEE signature on-chain.
6. Bind the signature to `block.chainid`, target contract, and action ID.

Kill condition: a result cannot be reliably mapped to a registered TEE identity
and verified by the target contract.

## 3. Gate B — encrypted bid round trip

Prove:

1. Discover the intended TEE encryption public key.
2. Encode a canonical bid containing tender ID, vendor, price, nonce, and rule
   hash.
3. ECIES-encrypt it before any chain or proxy submission.
4. Decrypt only through the TEE node's supported decryption boundary.
5. Return a commitment/status result without returning the price.
6. Reject wrong tender, vendor, nonce, rule hash, malformed schema, and replay.

Kill condition: plaintext appears in calldata, events, proxy logs, evidence, or
an untrusted service boundary.

## 4. Gate C — deterministic private selection

Implement a two-to-eight-bid FCC action and prove:

- Nonzero bids at or below the public ceiling are valid.
- Lowest valid bid wins.
- Earlier submission wins an exact tie.
- Zero and over-ceiling bids cannot win.
- No-valid-bid returns the zero sentinel.
- Bid order and commitment root are deterministic.
- The result contains winner and winning amount only, never losing values.
- Replaying the same result or applying it to another tender fails.

The signed result must bind:

```text
chainId, market, extensionId, codeVersion, tenderId, rulesHash,
orderedBidRoot, closeBlock, winner, winningAmount, resultNonce, expiry
```

Kill condition: the client must calculate the winner or the TEE result can be
rebound to different public state.

## 5. Gate D — Coston2 escrow and settlement

Prove with a supported Coston2 token first, then FTestXRP:

1. Buyer escrow equals the public ceiling.
2. Only a Gate-C-valid signed result can settle.
3. Winner receives the public winning amount.
4. Buyer receives the public remainder.
5. A zero winner returns the full escrow.
6. Double settlement and reentrancy cannot change balances twice.
7. Unsupported assets and fee-on-transfer surprises are rejected or handled by
   an explicitly proven balance-delta rule.

Kill condition: settlement can be driven by a caller-provided winner/amount or
the market cannot account for escrow conservation.

## 6. Gate E — asynchronous recovery and availability

Prove:

- Close and FCC request are separate recoverable checkpoints.
- A fresh process can resume from mined public state.
- Proxy/indexer delay produces pending or unavailable state, not mock success.
- A competing finalizer cannot settle twice.
- Expired result envelopes can be safely recomputed without reopening bidding.
- An unavailable TEE cannot enable buyer cancellation after valid bids are
  frozen.
- The recovery policy for replacing an unavailable TEE is explicit and does
  not let the buyer select a favorable computation result.

Kill condition: an outage requires plaintext persistence, bid resubmission, or
an authority that can replace the winner.

## 7. Gate F — meaningful FAssets integration

Required before selecting the Interoperable Asset Products bounty:

- Resolve the official FTestXRP/AssetManager through supported Flare tooling.
- Complete a real Coston2 fund, escrow, winner payout, and remainder/refund
  lifecycle.
- Complete or clearly demonstrate the relevant FXRP mint/redemption path.
- Show why XRP interoperability changes the target-user journey.
- If VeilBid directly consumes FDC, verify the corresponding XRPL payment or
  milestone proof on-chain and bind it to one tender.

Kill condition: FTestXRP is merely displayed or substituted for a generic token
without an XRP-native user journey.

## 8. Gate G — optional differentiated integrations

Each item has an independent gate:

- **FTSO:** capture a timestamped feed snapshot and prove deterministic
  fixed-point normalization inside the scoring rule.
- **FDC milestone:** verify a supported Payment/Web2Json proof and release only
  the bound milestone tranche.
- **Smart Accounts:** execute a tender action authorized by an XRPL-native flow
  with replay protection and no hidden custodial signer.
- **Multi-TEE:** require threshold agreement on the same result digest and
  define key distribution/recovery without duplicating plaintext logs.

Failure of an optional gate removes its public claim; it must not block the
verified Tier-1 FCC product.

## 9. Evidence outputs

Planned sanitized files:

```text
evidence/coston2/gate-a-fcc-result.json
evidence/coston2/gate-b-encrypted-bid.json
evidence/coston2/gate-c-private-selection.json
evidence/coston2/gate-d-settlement.json
evidence/coston2/gate-e-recovery.json
evidence/coston2/gate-f-fassets.json
```

Until these artifacts exist and pass their schemas, the associated capability
must remain `planned` in README, UI, and submission copy.
