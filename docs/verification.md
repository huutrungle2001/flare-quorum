# VeilBid Flare Championship Verification Plan

> Status: all Flare implementation and Coston2 verification rows are `NOT RUN`.
> Historical Sepolia/Nox artifacts are pre-hackathon baseline only.

## 1. Evidence policy

Committed Flare evidence may contain public network, contract, extension,
machine, code-version, FTSO, transaction, block, commitment, result, winner,
settlement, runtime-hash, and Boolean assertion data.

It must not contain bid plaintext or ciphertext, credentials, salts, sealed TEE
state, ingress bodies/headers, wallet or XRPL signatures, private keys, seeds,
proxy/indexer secrets, raw provider responses, or fabricated identifiers. The
winning amount is public; losing inputs and component scores remain redacted.

Evidence schemas must reject forbidden fields. Sensitive assertions happen
in-memory and save only an allowlisted pass/fail code.

## 2. Phase-gate ledger

| Gate | Required live outcome | Minimum evidence | Status |
|---|---|---|---|
| 0 — Foundations | Official access, live FCC manager, current indexer, stable proxy URL, minimum TEE/proxy revisions, fresh `rRap`, status `2`, image digests, and machine capacity pinned | Dependency/version manifest, manager bytecode/interface, machine record/status, and reachability assertions | NOT RUN |
| A — FCC result | Registered Coston2 TEE result verifies with the exact FCC signing domain | Extension, code, machine, request, result digest, verification transaction | NOT RUN |
| B — Private ingress | ECIES bid reaches TEE without public plaintext/ciphertext and survives sealed restart | Commitment/receipt IDs, redaction assertions, restart checkpoint | NOT RUN |
| C — Common quorum | Three fixed machines acknowledge bids and at least two remain common to every accepted bid | Machine fingerprints, receipt bitmaps, common bitmap, rejection cases | NOT RUN |
| D — Private scoring | Real TEEs match shared `SCORING_V1` vectors and select the deterministic eligible winner | Vector hashes, public inputs, result digest, Boolean expectations | NOT RUN |
| E — Threshold result | Two distinct common-quorum machines sign the same fully bound result; split/replay fails | Signer bitmap, domain fields, positive and negative transactions | NOT RUN |
| F — FTSO and FTestXRP | Official XRP/USD snapshot is bound; escrow pays/refunds exactly once in FTestXRP | Feed snapshot, discovered asset IDs, balance conservation | NOT RUN |
| G — XRP Smart Account | XRPL `0xFE` commitment, FDC proof, direct mint, and tender funding execute atomically | XRPL tx ID, proof/request IDs, user-op hash, sender, nonce, Flare tx | NOT RUN |
| H — Product release | Wallet-free judge path, role journeys, recovery, accessibility, and real user tests pass | Deployment consistency, smoke runs, interview/test ledger | NOT RUN |

No later gate converts an earlier failure into success. Private ingress, FCC
selection, FTestXRP conservation, and the XRP-native flagship path are product
stop conditions defined in [`PLAN.md`](../PLAN.md).

## 3. Mandatory release matrix

| Area | Passing condition | Status |
|---|---|---|
| Deployment truth | Source, runtime, constructor, manifest, registry wiring, extension image, machines, and bindings agree | NOT RUN |
| Bid privacy | No plaintext/ciphertext in chain, logs, analytics, evidence, or durable browser/proxy state | NOT RUN |
| Receipt binding | Wrong chain/market/extension/code/tender/vendor/rules/nonce/commitment/expiry fails | NOT RUN |
| Quorum continuity | Every accepted bid preserves a common 2-of-3 machine set; weaker receipt sets fail | NOT RUN |
| State integrity | TEE rebuilds ordered root; omitted, duplicated, reordered, and rolled-back state fails | NOT RUN |
| Eligibility | Missing/forged/duplicate/unsupported credential and every public bound fails closed | NOT RUN |
| Scoring | XRP/USD conversion, price/delivery/warranty penalties, rounding, bounds, tie, and no-valid cases match golden vectors | NOT RUN |
| FTSO | Unsupported, zero, malformed, or stale feed data cannot close a USD-enabled tender | NOT RUN |
| Result threshold | Two distinct approved common-quorum signers agree; one signer, duplicate signer, and split digests fail | NOT RUN |
| Domain/replay | Wrong root, rule, FTSO snapshot, close block, nonce, expiry, winner ID, or amount fails | NOT RUN |
| FTestXRP settlement | Winner plus remainder, or zero-winner refund, equals exact escrow and happens once | NOT RUN |
| Smart Account/FDC | Sender/account/nonce/user-op hash/payment proof mismatch and replay fail | NOT RUN |
| Recovery | Fresh relay/browser resumes every mined checkpoint without private state or mock data | NOT RUN |
| Public UX | Judges inspect a real finalized tender, Flare integration, and trust boundary without a wallet | NOT RUN |
| Accessibility | 320px, keyboard, focus, reduced motion, labels, and error recovery pass | NOT RUN |
| Privacy/secret scan | Current tree, history, runtime logs, browser artifacts, and evidence exclude forbidden material | NOT RUN |
| New-work ledger | Pre-hackathon, ported, newly built, integrated, and improved work maps to commits/evidence | IN PROGRESS |
| User validation | At least five buyer/treasury interviews, five vendor tests, and honest pilot/interest results | NOT RUN |

## 4. Planned evidence set

```text
evidence/coston2/foundations.release.json
evidence/coston2/fcc-registered-result.release.json
evidence/coston2/private-ingress-sealed-restart.release.json
evidence/coston2/common-quorum-three-machine.release.json
evidence/coston2/scoring-golden-vectors.release.json
evidence/coston2/threshold-result-adversarial.release.json
evidence/coston2/ftso-fassets-settlement.release.json
evidence/coston2/xrpl-smart-account-funding.release.json
evidence/coston2/deployment-consistency.release.json
evidence/coston2/two-vendor-lifecycle.release.json
evidence/coston2/three-vendor-recovery.release.json
evidence/coston2/web-desktop-mobile-keyboard.release.json
evidence/coston2/production-smoke.release.json
evidence/coston2/user-validation.release.json
evidence/coston2/new-work-ledger.release.json
```

File names are targets, not evidence that the tests ran. Each schema records
`sourceCommit`, public environment identity, assertions, blockers, and
collection time. A release file never changes from failed to passed without new
live identifiers.

## 5. Required adversarial suites

### Bid ingress and state

- Plaintext, malformed ECIES, oversized, wrong-key, stale-key, and unauthenticated
  requests.
- Wrong schema, chain, market, extension, code, tender, vendor, rules, nonce,
  credential domain, and commitment.
- One-machine receipt, duplicate signer, expired receipt, repeated vendor, and
  receipt set that collapses the common quorum.
- Missing, duplicate, reordered, corrupted, and rolled-back sealed state.
- Proxy restart, TEE restart, queue loss, timeout, retry, and competing submitter.

### Scoring and oracle

- Zero/over-ceiling price, min/max numeric bounds, unsupported currency, invalid
  credential, equal score, equal price with different terms, and no-valid bid.
- Golden vectors across Go, Solidity reference model, and TypeScript model.
- Arithmetic overflow, division edge, every rounding boundary, and USD-to-XRP
  upward payout rounding.
- Wrong feed, zero/negative-equivalent value, unsupported decimals, stale
  timestamp, and changed snapshot.

### Result and settlement

- Unregistered, duplicate, removed, wrong-code, and non-common-quorum signer.
- One signature, split digests, wrong domain, chain, market, tender, root, rule,
  feed, close block, nonce, expiry, bid ID, winner, and amount.
- Replayed result, competing finalizers, token failure, reentrant callback, and
  repeated terminal call.
- Winner payout plus remainder and zero-winner full-refund conservation.

### XRP-native funding

- Wrong PersonalAccount, sender, nonce, XRPL source/destination, amount, memo,
  user-op bytes/hash, FDC proof, and AssetManager binding.
- Duplicate proof/nonce, delayed proof, executor interruption, partial-call
  failure, and recovery after a mined public checkpoint.
- Confirmation that VeilBid never receives or logs an XRPL secret.

## 6. Historical baseline and new-work ledger

The following prove only the previous Sepolia/Nox implementation:

- `packages/contracts/deployments/sepolia.release.json`;
- `packages/chain-bindings/generated/`;
- `evidence/sepolia/` and existing `evidence/local/`.

The final Summer Signal ledger categorizes each release-facing commit:

| Category | Examples |
|---|---|
| Pre-existing | Sepolia/Nox/Safe/ERC-7984 release and evidence |
| Ported | Role shell, public index, stateless recovery patterns |
| Newly built | Go FCC extension, private ingress, receipt quorum, Flare market/bindings |
| Integrated | FAssets, FDC, FTSO, Smart Accounts |
| Improved | Multi-criteria rules, threshold agreement, domain and recovery hardening |

Each entry includes commit IDs, evidence paths, deployment identifiers, and a
one-sentence user benefit. Historical artifacts are never copied into the
Coston2 release manifest as proof of Flare execution.

## 7. Judge-ready release gate

The release is ready only when:

- Gates 0–H and every mandatory matrix row pass;
- the canonical Coston2 manifest is verified and blocker-free;
- source, runtime, bindings, extension image, machine mapping, UI, relay, and
  evidence all identify the same release;
- a real XRP-authorized mint-and-fund, multi-vendor private selection,
  threshold finalize, FTestXRP settlement, and redemption path are reproducible;
- wallet-free judges can inspect a finalized lifecycle and negative evidence;
- privacy/trust language matches [`threat-model.md`](threat-model.md);
- current-tree, full-history, and runtime-output scans pass;
- no capability is described as complete solely because its code or mock exists.
