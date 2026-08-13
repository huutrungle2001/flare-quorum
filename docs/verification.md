# FlareQuorum Championship Verification Plan

> Status: Gates 0–G are recorded on Coston2. V2 is the verified,
> consumer-selected release after passing its current-scaffold rolling machine
> refresh, deployment consistency, three-vendor success,
> one-result-endpoint outage, invalid-credential retry, undispatched refund,
> selection-expired refund, promotion, relay, and hosted web gates. The wallet-free role,
> accessibility, XRP draft, and reload-checkpoint smokes also pass. Historical
> V1 and Sepolia/Nox artifacts remain preserved but are not consumer authority.
> Gate H remains open only for real buyer/vendor/pilot validation; broader live
> fault injection and browser-native XRP executor recovery remain honest
> post-Summer Signal hardening tracks.
>
> Operational boundary: the refreshed machine evidence proves availability at
> its recorded checkpoint. Because FCC availability is time-bounded, rerun the
> V2 machine preflight (`pnpm flare:v2:machines:preflight`) and run
> `pnpm flare:v2:availability:refresh` if necessary near the judge demo; an old
> pass is never treated as current availability. Renewal uses a fresh proof and
> `confirmAvailability` without pausing production identities.

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
| 0 — Foundations | Official access, live FCC manager, current indexer, three stable proxy URLs, current scaffold pin set, fresh `rRap`, status `2`, availability age `<6h`, provider-facing `/instruction`, image digests, and machine capacity pinned | Dependency/version manifest, manager bytecode/interface, machine record/status/availability, route, and reachability assertions | PASSED AT RECORDED V2 CHECKPOINT — current scaffold pins, image digests, rolling registration, exact active set, stable routes, status `2`, and fresh availability are recorded in `fcc-market-v2-machines-refresh.json`; availability must be rechecked near the demo |
| A — FCC result | Registered Coston2 TEE result verifies with the exact FCC signing domain | Extension, code, machine, request, result digest, verification transaction | PASSED — block `33745987`; `PING_V1` binding, TEE signature domain, production signer mapping, wrong-binding rejection, and fresh-process recovery all pass |
| B — Private ingress | ECIES bid reaches TEE without public plaintext/ciphertext; rotated runtime fails closed and supported replacement restores capacity for new tenders | Commitment/receipt IDs, redaction assertions, identity-drift and replacement checkpoint | PASSED (aggregate) — live ingress/replay evidence plus `fcc-replacement-recovery.json` prove identity rotation, three replacement registrations, safe stale-identity retirement, and a new tender on the replacement set |
| C — Common quorum | All three fixed machines acknowledge every accepted bid; either surviving pair can reproduce the same root/result after one outage | Machine fingerprints, `0x07` receipt/common bitmaps, one-/two-outage and rejection cases | PASSED (core + result-collection recovery) — live two- and three-vendor lifecycles plus `three-vendor-recovery.release.json`; replacement recovery must not mutate an existing frozen set |
| D — Private scoring | Real TEEs match shared `SCORING_V1` vectors and select the deterministic eligible winner | Vector hashes, public inputs, result digest, Boolean expectations | PASSED — live FCC selection bound to XRP/USD terms and the common root |
| E — Threshold result | Two distinct common-quorum machines sign the same fully bound result; split/replay fails | Signer bitmap, domain fields, positive and negative transactions | PASSED for live result correctness and V2 recovery — the refreshed V2 quorum passed a three-vendor success lifecycle, a second lifecycle where machines 1 and 2 finalized while machine 3's result endpoint was excluded, and both fixed-grace full-refund paths |
| F — FTSO and FTestXRP | Official XRP/USD snapshot is bound; escrow pays/refunds exactly once in FTestXRP and the award can enter the official redemption path | Feed snapshot, discovered asset IDs, balance conservation, redemption request | PASSED — live FTSO snapshot, conserved FTestXRP award, and amount-based AssetManager redemption request in `fassets-redemption.release.json` |
| G — XRP Smart Account | XRPL `0xFE` commitment, FDC proof, direct mint, and tender funding execute atomically | XRPL tx ID, proof/request IDs, user-op hash, sender, nonce, Flare tx | PASSED — live evidence in `gate-g-smart-account.json`; delayed-mint checkpoint/resume is fail-closed and covered by relay tests |
| H — Product release | Wallet-free judge path, role journeys, recovery, accessibility, and real user tests pass | Deployment consistency, smoke runs, interview/test ledger | IN PROGRESS — the hosted V2 Buyer, Public, Private Bids, Activity, Auditor, award dossier, 320px keyboard path, XRP draft, and reload checkpoint pass; the remaining gate requirement is real buyer/vendor/pilot validation, currently `NOT_RUN` |

No later gate converts an earlier failure into success. Private ingress, FCC
selection, FTestXRP conservation, and the XRP-native flagship path are product
stop conditions defined in [`PLAN.md`](../PLAN.md).

Gate G is now live-passed: a real XRPL testnet payment, Coston2 FDC request and
proof, AssetManager direct mint, Smart Account execution, and market tender
receipt are recorded in `evidence/coston2/gate-g-smart-account.json`. The
evidence contains only public identifiers and assertion booleans; disposable
wallet/executor secrets are never persisted.

## 3. Mandatory release matrix

`PARTIAL` below bounds the evidence actually recorded; it does not silently
promote an unexecuted drill. Additional live stateful fault breadth and
browser-native XRP recovery remain post-Summer Signal hardening rather than
current V2 submission blockers. V2's real undispatched and post-dispatch refund
lifecycles, promotion verification, and consumer switch have passed.
Gate H remains a current validation track and stays `NOT_RUN` until real
sessions occur.

| Area | Passing condition | Status |
|---|---|---|
| Deployment truth | Source, runtime, constructor, manifest, registry wiring, extension image, machines, and bindings agree | PASSED — `evidence/coston2/market-v2-deployment-consistency.json` and verified V2 release manifest |
| Bid privacy | No plaintext/ciphertext in chain, logs, analytics, evidence, or durable browser/proxy state | PARTIAL — live three-machine ciphertext ingress, browser no-persistence path, bounded HTTP/proxy tests, repository/history/evidence scans, and a read-only review of 602 hosted JSON log records pass; additional stateful fault breadth is planned post-Summer Signal hardening |
| Judge-time FCC availability | Buyer preparation and bid ingress fail closed unless all three frozen identities are status `2`, exactly bound, and availability-fresh at one Coston2 checkpoint | PASSED AT RECORDED CHECKPOINT — all three runtimes were rolling-replaced, re-registered, and recorded fresh in `fcc-market-v2-machines-refresh.json`; availability must still be rechecked at judge time |
| Receipt binding | Wrong chain/market/extension/code/tender/vendor/rules/nonce/commitment/expiry fails | PASSED — live receipts and domain-binding tests pass; restart recovery is tracked separately from receipt cryptography |
| Quorum continuity | Every accepted bid preserves a common 2-of-3 machine set; weaker receipt sets fail | PASSED for result collection and supported replacement — live `three-vendor-recovery.release.json` finalizes with one unavailable result endpoint, and all three identities were safely replaced for new tenders; simultaneous two-machine loss remains fail-closed |
| State integrity | TEE rebuilds ordered root; omitted, duplicated, reordered, and rolled-back state fails | PARTIAL — Go sealed-store/selection, Solidity fuzz/invariant, and TypeScript root tests pass; additional live rollback/restart evidence is planned post-Summer Signal hardening |
| Static analysis | Release-facing Solidity has no unexplained medium/high analyzer finding | PASSED for V2 — CI pins Slither `0.11.6`, targets `FlareQuorumMarketV2.sol`, and permits only two exact detector/function exceptions documented in `tooling/flare/slither-v2-allowlist.json`; live runtime matching is recorded separately in deployment evidence |
| Eligibility | Missing/forged/duplicate/unsupported credential and every public bound fails closed | PASSED for V2 — FCC/contract negative suites cover the credential and public-bound matrix; [`market-v2-refresh-invalid-credential.json`](../evidence/coston2/market-v2-refresh-invalid-credential.json) records all three live TEEs rejecting a wrong-issuer sealed bid with verified signed rejections, then accepting the corrected credential on the same canonical slot |
| Scoring | XRP/USD conversion, price/delivery/warranty penalties, rounding, bounds, tie, and no-valid cases match golden vectors | PARTIAL — shared Go/Solidity/TypeScript vectors and live multi-criteria selection pass; a full live boundary drill is planned post-Summer Signal hardening |
| FTSO | Unsupported, zero, malformed, or stale feed data cannot close a USD-enabled tender | PARTIAL — contract negative tests, live unsupported-feed policy guard, and live XRP/USD snapshot pass; stale-feed close fault injection is planned post-Summer Signal hardening |
| Result threshold | Two distinct approved common-quorum signers agree; one signer, duplicate signer, and split digests fail | PARTIAL — live two-signature finalization plus local duplicate/split/wrong-domain tests pass; a full live negative drill is planned post-Summer Signal hardening |
| Domain/replay | Wrong root, rule, FTSO snapshot, close block, nonce, expiry, winner ID, or amount fails | PARTIAL — shared contract/binding/relay rejection suites plus live terminal replay/zero-result guards pass; a full stateful live replay matrix is planned post-Summer Signal hardening |
| FTestXRP settlement | Winner plus remainder, or zero-winner refund, equals exact escrow and happens once | PASSED (local stateful multi-tender harness plus live C-E-F lifecycle) |
| FAssets redemption | Awarded vendor can request an official amount-based FTestXRP/FXRP redemption without FlareQuorum custody | PASSED — live Coston2 approval and `RedemptionRequested` evidence in `fassets-redemption.release.json` |
| Smart Account/FDC | Sender/account/nonce/user-op hash/payment proof mismatch and replay fail | PARTIAL — public binding, quote, nonce, proof-domain, and checkpoint-drift tests pass; full live fault-drill evidence is planned post-Summer Signal hardening |
| Closed-state liveness | Escrow has a bounded failure terminal path even when the first FCC dispatch cannot start | PASSED for V2 — `market-v2-undispatched-refund.json` proves the fixed close-time grace, exact full-escrow return, explicit `UndispatchedTimeout`, and no award; `market-v2-selection-expired-refund.json` separately proves the post-dispatch `SelectionExpired` path |
| Recovery | Fresh relay/browser resumes every mined checkpoint without private state or mock data | PARTIAL — one-result FCC outage, organizer-supported three-machine replacement, both contract refund paths, XRP funding checkpoint/resume, public-safe browser job preview, reload-safe public checkpoint, and GemWallet hash handoff pass; browser-native executor recovery remains post-Summer Signal hardening and is not a V2 promotion blocker |
| Public UX | Judges inspect a real finalized tender, Flare integration, and trust boundary without a wallet | PASSED for the expanded hosted release — `evidence/coston2/web-v2-production-smoke.json`, `evidence/coston2/web-v2-keyboard-accessibility.json`, and `evidence/coston2/flare-ingress-v2-production.json` record the wallet-free role shell, finalized tender, trust boundary, keyboard/320px checks, and fail-closed ingress |
| Public Buyer Brief integrity | Registry accepts only the canonical public schema; web displays it only after recomputing the contract `metadataHash`; missing/mismatch is explicit | DEPLOYED AND TESTED — strict registry/file-store/browser tests pass, the hosted ingress exposes the public-safe registry, and `web-v2-production-smoke.json` verifies the V2 Buyer Brief surface; persistent-volume survival across a hosted restart remains an operational check rather than a contract claim |
| Accessibility | 320px, keyboard, focus, reduced motion, labels, and error recovery pass | PASSED for the hosted V2 path in `evidence/coston2/web-v2-keyboard-accessibility.json`; browser-native signing/recovery remains a separate post-Summer Signal hardening track |
| Privacy/secret scan | Current tree, history, runtime logs, browser artifacts, and evidence exclude forbidden material | PARTIAL — repository/history/evidence and browser smoke scans pass; 602 latest hosted Railway JSON log records were inspected in memory with zero forbidden-material pattern matches; longer-retention and stateful fault coverage are planned post-Summer Signal hardening |
| New-work ledger | Pre-hackathon, ported, newly built, integrated, and improved work maps to commits/evidence | PASSED for the current Flare package — `submission/flare/NEW-WORK-LEDGER.md` and judge-package validation agree; historical parent pack remains isolated |
| User validation | At least five buyer/treasury interviews, five vendor tests, and honest pilot/interest results | NOT RUN — explicit zero-session record in [`evidence/coston2/user-validation.release.json`](../evidence/coston2/user-validation.release.json); no traction is claimed |

## 4. Current evidence inventory

```text
evidence/coston2/gate-0-foundations.json
evidence/coston2/gate-0-extension-image.json
evidence/coston2/gate-0-proxy-image.json
evidence/coston2/gate-a-fcc-result.json
evidence/coston2/foundations.release.json
evidence/coston2/fcc-registered-result.release.json
evidence/coston2/fcc-replacement-recovery.json
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
evidence/coston2/web-v2-production-smoke.json
evidence/coston2/web-v2-keyboard-accessibility.json
evidence/coston2/web-v2-xrp-funding-draft.json
evidence/coston2/web-v2-xrp-funding-checkpoint.json
evidence/coston2/hosted-runtime-log-review.json
evidence/coston2/fcc-market-v2-machines-refresh.json
evidence/coston2/market-v2-refresh-multi-vendor-success.json
evidence/coston2/market-v2-refresh-one-result-outage.json
evidence/coston2/market-v2-refresh-invalid-credential.json
evidence/coston2/market-v2-undispatched-refund.json
evidence/coston2/market-v2-selection-expired-refund.json
evidence/coston2/market-v2-deployment-consistency.json
evidence/coston2/web-role-workspaces.json
evidence/coston2/flare-ingress-v2-production.json
evidence/coston2/user-validation.release.json
evidence/coston2/new-work-ledger.release.json
```

Historical entries above preserve earlier gate provenance; current V2 entries
are the release-facing records selected by the canonical manifest. A file name
alone is not proof that a test ran: its status/assertions, public environment
identity, blockers, and collection time remain authoritative. A release file
never changes from failed to passed without new live identifiers.

The current local rejection/continuity coverage is recorded in
[`evidence/local/flare-adversarial-coverage.json`](../evidence/local/flare-adversarial-coverage.json).
It proves the checked-in Go, Forge, and relay suites without performing live
writes; it does not claim unsupported same-identity restoration or replace the
separate live replacement evidence.

The pinned three-machine Docker smoke is recorded separately in
[`evidence/local/fcc-local-stack-smoke.json`](../evidence/local/fcc-local-stack-smoke.json).
It proves local authenticated transport, malformed-input rejection, result
binding, and public redaction only; it is explicitly not production Coston2
evidence.

The local identity-rotation boundary is recorded in
[`evidence/local/fcc-local-tee-restart-boundary.json`](../evidence/local/fcc-local-tee-restart-boundary.json).
It confirms the expected identity rotation. Organizer guidance defines
replacement registration as the supported recovery model; the corresponding
live Coston2 drill is recorded separately in
[`evidence/coston2/fcc-replacement-recovery.json`](../evidence/coston2/fcc-replacement-recovery.json).

The local two-machine-loss fail-closed drill is recorded in
[`evidence/local/fcc-local-two-machine-loss.json`](../evidence/local/fcc-local-two-machine-loss.json).
It stops two simulated containers, observes both as unavailable while the
surviving machine remains healthy, and restores the stack; it is not a live
Coston2 outage claim.

The read-only live negative observations are recorded in
[`evidence/coston2/live-negative-calls.release.json`](../evidence/coston2/live-negative-calls.release.json).
They exercise terminal-state and zero-term guards through `eth_call` only;
they do not replace stateful credential, stale-FTSO, or simultaneous
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
- Confirmation that FlareQuorum never receives or logs an XRPL secret.

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
