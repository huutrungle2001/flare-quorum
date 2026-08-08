# VeilBid Flare Championship Verification Plan

> Status: Gates 0–A, the live Gate-B ingress/replay portion, Gates C–F, and Gate
> G are recorded on Coston2. Two- and three-vendor encrypted lifecycles are now
> also recorded, including a three-vendor one-result-outage recovery; the canonical release is verified, the hosted ciphertext
> ingress is live with a fail-closed finalized-tender health check, and the wallet-free Coston2 judge/role/accessibility smokes
> pass. Gate B restart hardening, browser-native XRP recovery, and user-validation
> work remain open; the wallet-ready browser XRPL Payment/job preview, optional
> GemWallet Testnet signing/submission path, and server-side XRP funding checkpoint/resume have fail-closed
> coverage, and the hosted Railway runtime-log review found no forbidden-material
> pattern matches. Historical Sepolia/Nox
> artifacts are pre-hackathon baseline only. Local adversarial coverage is
> recorded separately and is not promoted to live Coston2 evidence.

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
| 0 — Foundations | Official access, live FCC manager, current indexer, three stable proxy URLs, minimum TEE/proxy revisions, fresh `rRap`, status `2`, image digests, and machine capacity pinned | Dependency/version manifest, manager bytecode/interface, machine record/status, and reachability assertions | PASSED — block `33745484`; extension `66007` has three distinct simulated TEE machines in `PRODUCTION` with exact URL/code/platform/key bindings |
| A — FCC result | Registered Coston2 TEE result verifies with the exact FCC signing domain | Extension, code, machine, request, result digest, verification transaction | PASSED — block `33745987`; `PING_V1` binding, TEE signature domain, production signer mapping, wrong-binding rejection, and fresh-process recovery all pass |
| B — Private ingress | ECIES bid reaches TEE without public plaintext/ciphertext and survives sealed restart | Commitment/receipt IDs, redaction assertions, restart checkpoint | IN PROGRESS — live three-machine ingress, receipt binding, idempotent retry, and changed-ciphertext rejection pass; same-identity restart remains open |
| C — Common quorum | All three fixed machines acknowledge every accepted bid; either surviving pair can reproduce the same root/result after one outage | Machine fingerprints, `0x07` receipt/common bitmaps, one-/two-outage and rejection cases | PASSED (core + result-collection recovery) — live two- and three-vendor lifecycles plus `three-vendor-recovery.release.json`; same-identity restart remains open |
| D — Private scoring | Real TEEs match shared `SCORING_V1` vectors and select the deterministic eligible winner | Vector hashes, public inputs, result digest, Boolean expectations | PASSED — live FCC selection bound to XRP/USD terms and the common root |
| E — Threshold result | Two distinct common-quorum machines sign the same fully bound result; split/replay fails | Signer bitmap, domain fields, positive and negative transactions | PASSED (core + result-collection recovery) — two frozen machines finalized tender 21 while the third result endpoint was unavailable; split/replay and same-identity restart hardening remain open |
| F — FTSO and FTestXRP | Official XRP/USD snapshot is bound; escrow pays/refunds exactly once in FTestXRP and the award can enter the official redemption path | Feed snapshot, discovered asset IDs, balance conservation, redemption request | PASSED — live FTSO snapshot, conserved FTestXRP award, and amount-based AssetManager redemption request in `fassets-redemption.release.json` |
| G — XRP Smart Account | XRPL `0xFE` commitment, FDC proof, direct mint, and tender funding execute atomically | XRPL tx ID, proof/request IDs, user-op hash, sender, nonce, Flare tx | PASSED — live evidence in `gate-g-smart-account.json`; delayed-mint checkpoint/resume is fail-closed and covered by relay tests |
| H — Product release | Wallet-free judge path, role journeys, recovery, accessibility, and real user tests pass | Deployment consistency, smoke runs, interview/test ledger | IN PROGRESS — wallet-free Coston2 judge path, public Activity/Evidence ledger, buyer/vendor role render, 320px/keyboard accessibility, hosted ingress smoke, public-safe XRP job preview, optional GemWallet Testnet signing/submission, and interactive redemption request pass; browser-native recovery, broader wallet coverage, and user validation remain |

No later gate converts an earlier failure into success. Private ingress, FCC
selection, FTestXRP conservation, and the XRP-native flagship path are product
stop conditions defined in [`PLAN.md`](../PLAN.md).

Gate G is now live-passed: a real XRPL testnet payment, Coston2 FDC request and
proof, AssetManager direct mint, Smart Account execution, and market tender
receipt are recorded in `evidence/coston2/gate-g-smart-account.json`. The
evidence contains only public identifiers and assertion booleans; disposable
wallet/executor secrets are never persisted.

## 3. Mandatory release matrix

| Area | Passing condition | Status |
|---|---|---|
| Deployment truth | Source, runtime, constructor, manifest, registry wiring, extension image, machines, and bindings agree | PASSED — `evidence/coston2/deployment-consistency.json` and verified release manifest |
| Bid privacy | No plaintext/ciphertext in chain, logs, analytics, evidence, or durable browser/proxy state | PARTIAL — live three-machine ciphertext ingress, browser no-persistence path, bounded HTTP/proxy tests, repository/history/evidence scans, and a read-only review of 602 hosted JSON log records pass; broader stateful fault coverage remains |
| Receipt binding | Wrong chain/market/extension/code/tender/vendor/rules/nonce/commitment/expiry fails | PARTIAL — live receipts and domain-binding tests pass; same-identity restart evidence remains |
| Quorum continuity | Every accepted bid preserves a common 2-of-3 machine set; weaker receipt sets fail | PASSED for result collection — live `three-vendor-recovery.release.json` finalizes with one unavailable result endpoint; sealed restart and two-machine loss remain open |
| State integrity | TEE rebuilds ordered root; omitted, duplicated, reordered, and rolled-back state fails | PARTIAL — Go sealed-store/selection, Solidity fuzz/invariant, and TypeScript root tests pass; live rollback/restart evidence remains |
| Eligibility | Missing/forged/duplicate/unsupported credential and every public bound fails closed | PARTIAL — FCC/contract invalid-credential and public-bound tests pass; live invalid-credential policy/zero-term `eth_call` guards are recorded, while a live sealed-bid credential drill remains |
| Scoring | XRP/USD conversion, price/delivery/warranty penalties, rounding, bounds, tie, and no-valid cases match golden vectors | PARTIAL — shared Go/Solidity/TypeScript vectors and live multi-criteria selection pass; full live boundary drill remains |
| FTSO | Unsupported, zero, malformed, or stale feed data cannot close a USD-enabled tender | PARTIAL — contract negative tests, live unsupported-feed policy guard, and live XRP/USD snapshot pass; stale-feed close fault injection remains |
| Result threshold | Two distinct approved common-quorum signers agree; one signer, duplicate signer, and split digests fail | PARTIAL — live two-signature finalization plus local duplicate/split/wrong-domain tests pass; full live negative drill remains |
| Domain/replay | Wrong root, rule, FTSO snapshot, close block, nonce, expiry, winner ID, or amount fails | PARTIAL — shared contract/binding/relay rejection suites plus live terminal replay/zero-result guards pass; full stateful live replay matrix remains |
| FTestXRP settlement | Winner plus remainder, or zero-winner refund, equals exact escrow and happens once | PASSED (local stateful multi-tender harness plus live C-E-F lifecycle) |
| FAssets redemption | Awarded vendor can request an official amount-based FTestXRP/FXRP redemption without VeilBid custody | PASSED — live Coston2 approval and `RedemptionRequested` evidence in `fassets-redemption.release.json` |
| Smart Account/FDC | Sender/account/nonce/user-op hash/payment proof mismatch and replay fail | PARTIAL — public binding, quote, nonce, proof-domain, and checkpoint-drift tests pass; full live fault-drill evidence remains |
| Recovery | Fresh relay/browser resumes every mined checkpoint without private state or mock data | PARTIAL — one-result FCC outage is live; XRP funding checkpoint/resume, public-safe browser job preview, and GemWallet hash handoff are implemented and tested; browser-native recovery and full fault drills remain |
| Public UX | Judges inspect a real finalized tender, Flare integration, and trust boundary without a wallet | PASSED — `evidence/coston2/web-production-smoke.json`, `evidence/coston2/web-role-workspaces.json`, `evidence/coston2/flare-ingress-production.json`; dedicated `/?role=evidence` ledger is covered by the role smoke |
| Accessibility | 320px, keyboard, focus, reduced motion, labels, and error recovery pass | PARTIAL — 320px/keyboard/focus/reduced-motion/labels pass in `evidence/coston2/web-keyboard-accessibility.json`; browser-native signing/recovery remains |
| Privacy/secret scan | Current tree, history, runtime logs, browser artifacts, and evidence exclude forbidden material | PARTIAL — repository/history/evidence and browser smoke scans pass; 602 latest hosted Railway JSON log records were inspected in memory with zero forbidden-material pattern matches; longer retention and stateful fault coverage remain |
| New-work ledger | Pre-hackathon, ported, newly built, integrated, and improved work maps to commits/evidence | PASSED for the current Flare package — `submission/flare/NEW-WORK-LEDGER.md` and judge-package validation agree; historical parent pack remains isolated |
| User validation | At least five buyer/treasury interviews, five vendor tests, and honest pilot/interest results | NOT RUN |

## 4. Planned evidence set

```text
evidence/coston2/gate-0-foundations.json
evidence/coston2/gate-0-extension-image.json
evidence/coston2/gate-0-proxy-image.json
evidence/coston2/gate-a-fcc-result.json
evidence/coston2/foundations.release.json
evidence/coston2/fcc-registered-result.release.json
evidence/coston2/private-ingress-sealed-restart.release.json
evidence/coston2/common-quorum-three-machine.release.json
evidence/coston2/scoring-golden-vectors.release.json
evidence/coston2/threshold-result-adversarial.release.json
evidence/coston2/ftso-fassets-settlement.release.json
evidence/coston2/xrpl-smart-account-funding.release.json
evidence/coston2/deployment-consistency.release.json
evidence/coston2/gate-c-e-f-two-vendor.json
evidence/coston2/gate-c-e-f-three-vendor.json
evidence/coston2/three-vendor-recovery.release.json
evidence/coston2/performance-benchmarks.release.json
evidence/coston2/bid-ingress-benchmark.release.json
evidence/coston2/live-negative-calls.release.json
evidence/coston2/web-desktop-mobile-keyboard.release.json
evidence/coston2/production-smoke.release.json
evidence/coston2/web-production-smoke.json
evidence/coston2/web-keyboard-accessibility.json
evidence/coston2/web-xrp-funding-draft.json
evidence/coston2/hosted-runtime-log-review.json
evidence/coston2/fcc-market-machine-preflight.json
evidence/coston2/web-role-workspaces.json
evidence/coston2/flare-ingress-production.json
evidence/coston2/user-validation.release.json
evidence/coston2/new-work-ledger.release.json
```

File names are targets, not evidence that the tests ran. Each schema records
`sourceCommit`, public environment identity, assertions, blockers, and
collection time. A release file never changes from failed to passed without new
live identifiers.

The current local rejection/continuity coverage is recorded in
[`evidence/local/flare-adversarial-coverage.json`](../evidence/local/flare-adversarial-coverage.json).
It proves the checked-in Go, Forge, and relay suites without performing live
writes; its blocker list deliberately keeps live fault-drill and simulated-TEE
identity-restart claims open.

The pinned three-machine Docker smoke is recorded separately in
[`evidence/local/fcc-local-stack-smoke.json`](../evidence/local/fcc-local-stack-smoke.json).
It proves local authenticated transport, malformed-input rejection, result
binding, and public redaction only; it is explicitly not production Coston2
evidence.

The local identity-rotation boundary is recorded in
[`evidence/local/fcc-local-tee-restart-boundary.json`](../evidence/local/fcc-local-tee-restart-boundary.json).
It confirms the supported runtime's replacement-identity behavior and keeps
same-identity restart recovery explicitly open.

The read-only live negative observations are recorded in
[`evidence/coston2/live-negative-calls.release.json`](../evidence/coston2/live-negative-calls.release.json).
They exercise terminal-state and zero-term guards through `eth_call` only;
they do not replace stateful credential, stale-FTSO, process-restart, or
two-machine-loss drills.

## 5. Required adversarial suites

### Bid ingress and state

- Plaintext, malformed ECIES, oversized, wrong-key, stale-key, and unauthenticated
  requests.
- Wrong schema, chain, market, extension, code, tender, vendor, rules, nonce,
  credential domain, and commitment.
- One- or two-machine receipt set, duplicate signer, expired receipt, repeated
  vendor, and three validly signed receipts that disagree on any bound field.
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
