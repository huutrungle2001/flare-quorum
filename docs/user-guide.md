# FlareQuorum Championship User Guide

> Status: verified Coston2 experience. The checked-in `/` and `/flare` routes
> provide the fail-closed wallet-free evidence view and explicit Coston2 role
> routes. The current source build combines direct Coston2 and XRP-native
> funding under the Buyer workspace alongside Public, Vendor, Public Finalizer,
> and Auditor/Evidence. The desktop refinement is deployed and passes the
> hosted V2 production and keyboard/accessibility smokes. The XRP-native
> funding protocol and executor have live Gate G
> evidence plus a public-safe delayed-mint checkpoint/resume path. The Buyer
> workspace can also prepare a wallet-ready XRPL Payment draft and public-safe
> `0xFE` executor job preview from read-only Coston2 state; the live
> wallet-ready draft smoke is recorded in
> `evidence/coston2/web-v2-xrp-funding-draft.json`. Optional GemWallet Testnet
> signing/submission is available without custody; browser-native recovery
> remains outside the browser custody boundary. `/room` now redirects to the
> canonical Coston2 application; historical Sepolia artifacts remain
> repository-only regression material.

## 1. What the product will do

FlareQuorum lets an XRP-native or Flare treasury escrow a public FTestXRP budget
while vendors keep price, delivery, warranty, and qualification inputs private.
A fixed quorum of registered FCC TEEs evaluates the public deterministic rule.
The contract accepts only two matching TEE results, then publicly pays the
winner and returns the remainder.

The product hides neither vendor participation nor the final winner/winning
amount. It provides TEE-backed confidentiality and threshold agreement, not
anonymity or a zero-knowledge proof.

## 2. Judge and public observer

The wallet-free judge path must let a reviewer:

1. Open a finalized Coston2 tender and identify its buyer, approved vendors,
   public ceiling, deadline, scoring rule, and FTestXRP asset.
2. Inspect the extension/code version, three machine fingerprints, 2-of-3
   threshold, receipt bitmaps, common quorum, and ordered commitment root.
3. Inspect the close-time XRP/USD FTSO snapshot used for USD quotes.
4. Verify that two distinct tender-fixed TEEs signed the exact same result
   digest and that tampered/replayed examples fail.
5. Confirm the public winner, FTestXRP payout, buyer remainder/refund, receipt,
   and escrow conservation.
6. Follow the XRPL payment, FDC proof, Smart Account user-operation, direct mint,
   and funding trail for the flagship tender.
7. Compare the page with sanitized release evidence without seeing a bid or
   encrypted payload.

Use `/flare?role=evidence` (or the `/flare?role=auditor` alias) for the dedicated Auditor
workspace. It re-reads the same finalized market snapshot and presents each
tender's public rules hash, per-bid receipt quorum, ordered root, machine
binding, result digest, award payout/remainder, and refund state. It never
unlocks bid data or requires a wallet. It opens the newest awarded dossier by
default, supports public ID/buyer/status filtering, and provides labelled copy
controls for long public identifiers. Use `/flare?role=finalizer` for the separate
public lifecycle queue: permissionless close is available in-browser, while
connected users may also start FCC compute and submit an exact verified 2-of-3
result. Buyer-only empty cancellation and failed-compute recovery require an
explicit confirmation.

The Buyer route is `/flare?role=buyer`: it starts with two explicit funding
choices, defaults to direct Coston2/FTestXRP escrow, and can switch to the
XRPL/FDC/Smart Account journey inside one guided tender card. The public Rules
form is shared across both choices and never creates a second draft.
The old `/flare?role=treasury` URL remains a compatibility alias that opens Buyer
with the XRPL choice selected. `/flare?role=vendor` opens sealed submission;
post-award redemption lives under Activity / Assets. The header wallet selector
is Coston2-only. Public browsing never requires a wallet.

The current Flare application is intentionally split into two shells. Clicking
the `FLAREQUORUM` wordmark returns to the standalone product landing page. Clicking
`TENDERS` enters `/flare`, where the dossier-style left rail remains visible
while the right side renders the selected workspace: `PUBLIC`, `BUYER` (with
the two funding choices), `PRIVATE BIDS` (vendor ingress), `ACTIVITY` (public
finalizer plus Assets/Redemption), and `AUDITOR`. Public uses canonical tender IDs, status, buyer, and
on-chain facts rather than fabricating titles when only a metadata hash exists.
Its desktop list provides search and five-item pagination, and the list/detail
canvas uses one document scroll instead of nested scroll panes. The left rail
shows compact wallet assets in Buyer, Vendor, and Activity, and also in Public
or Auditor immediately after a Coston2 wallet connects. Public and Auditor
remain wallet-optional and show the read-only notice while disconnected. The
Coston2 faucet remains available, and refresh is the global `↻` control beside
`CONNECT FOR ACTIONS`. The app also rereads finalized Coston2 state every 15
seconds while the tab is visible, without replacing an already rendered workspace with a loading screen.
After the wallet broadcasts direct Coston2 tender creation, Public immediately
puts a clearly marked transaction checkpoint at the top of the dossier list.
It advances from `TRANSACTION BROADCAST` to `FINALITY PENDING`, is never
presented as canonical state, and is replaced by the ordinary dossier once the
12-block-finalized reader includes that tender.
Wallet connection stays in the global header and appears again as a compact
checkpoint next to a relevant transaction, while FXRP redemption shows a compact
locked state under Activity / Assets until the connected public winner has an
eligible balance.
Sepolia-only `vcUSDC` wrap/unwrap controls are omitted from Flare.

The public path is live and release-labeled. Any missing dependency keeps its
own operation unavailable; the UI never substitutes Sepolia data or mock
success. The Sepolia app remains a pre-hackathon baseline.

## 3. Network and safety

- Use Flare Testnet Coston2, chain ID `114`, and disposable test identities.
- Buyers use XRPL testnet for the flagship funding journey; vendors use a
  disposable Coston2 EVM wallet to authenticate submissions and transactions.
- Use only the release-discovered official FTestXRP/FAssets, FTSO, FCC, FDC, and
  Smart Account interfaces.
- Never enter an EVM private key, XRPL secret, seed, TEE key, proxy credential,
  or indexer credential in the web app.
- Account, network, market, tender, extension, code, rules, or machine-key
  changes clear all session-only bid input and invalidate an unsent payload.

## 4. XRP-native Buyer funding flow (executor-backed flagship)

1. In `BUYER`, choose `XRPL / XRP · ADVANCED` (direct `COSTON2 / FTESTXRP` is
   the default) and complete Step 1, `DEFINE TENDER RULES`, inside the single
   XRP-native card. Derive the
   deterministic Flare PersonalAccount and read its current nonce
   from the supported Smart Account controller.
2. Build the public-safe terms and read the current AssetManager payment
   destination, direct-mint fee, executor fee, PersonalAccount, and nonce. The
   Buyer workspace's `REVIEW XRP PAYMENT` action then shows the exact UBA amount
   and destination. The 42-byte `0xFE` memo, manual transaction ID, wallet ID,
   executor fee, and JSON remain under `Advanced funding details`. It does not
   request an XRPL secret.
3. Send that XRP testnet Payment from the buyer's own XRPL wallet (the optional
   GemWallet button can verify Testnet and submit the exact draft), enter its
   public transaction ID, and prepare the strict `FlareFundingJob`; then run
   the dedicated `flare:funding:execute` executor with local
   credentials. The executor waits for XRPL finality, requests the official FDC
   `XRPPayment` proof, and calls `executeDirectMintingWithData`. Until a
   supported executor API is connected, the browser truthfully stops at
   `Executor handoff ready — tender not opened yet` and never presents a fake
   final action.
4. Accept the funding result only when the direct-mint, user-operation, and
   `TenderCreated` events prove one atomic Coston2 tender. Delayed minting is a
   public pending checkpoint, never a success fallback. Save the JSON result
   and resume it later with `pnpm flare:funding:resume < checkpoint.json`; the
   resume command reuses the same XRPL payment, FDC request, memo-bound nonce,
   and user operation. It never sends a second payment or silently changes the
   public terms.
5. Monitor the public tender and continue through FCC selection and settlement
   in the same wallet-free evidence view.

The app never asks for the buyer's XRPL secret and never holds an autonomous
buyer signer. Direct EVM funding is a clearly labeled recovery/developer route.
The source UI auto-saves only the public Buyer Brief fields in tab-scoped
`sessionStorage`, shows the contract length/range constraints while composing,
and provides `CLEAR PUBLIC DRAFT`. The versioned allowlist includes no bid,
ciphertext, credential, salt, signature, wallet material, or FDC proof; any
unknown stored key invalidates the draft. The Coston2 wallet checkpoint appears
after the brief, immediately before the direct transaction action.
After local validation, the browser publishes that same canonical public brief
to the content-addressed registry and verifies its returned hash before asking
for token approval, payment, or tender creation. Public, Private Bids, and
Auditor views fetch the preimage and recompute the tender's on-chain
`metadataHash` before showing it. A missing, unavailable, or mismatched response
is labeled explicitly; the UI never reconstructs or guesses the brief. Earlier
tenders without an available preimage remain inspectable through their
contract facts and metadata hash.
After a public payment hash is known, the browser may retain only the owner,
transaction hash, Smart Account wallet ID, and executor fee as a reload-safe
checkpoint. On reload, the Buyer route offers an explicit public-checkpoint
resume control that rebuilds the same handoff; it never stores signing material,
a bid, ciphertext, an FDC proof, or a wallet secret. Users can explicitly
forget the checkpoint.

## 5. Vendor flow

1. Connect a Coston2 address. The browser checks `isApprovedVendor` for every
   open tender, prioritizes eligible tenders, and locks private entry if the
   canonical eligibility read is unavailable.
2. Read the automatically loaded, hash-verified public Buyer Brief, then verify
   market, buyer, deadline, ceiling, rules, extension/code, three machine
   fingerprints, common threshold, and official release status.
3. Read the selected tender's public ceiling, deadline, service bounds, and
   scoring weights, then enter an XRP quote, delivery days, and
   warranty days. Credential-gated tenders are rejected by this composer until
   an explicit issuer-credential UX is added; the underlying protocol still
   validates credential requirements inside FCC.
4. Keep the visible no-persistence warning in mind: private fields are lost on
   refresh. Review price, delivery, and warranty in-session before encryption;
   the random salt prevents practical enumeration of low-range values.
5. Encrypt separately to each selected TEE key and send through the authenticated
   private-ingress path. Neither plaintext nor ciphertext is written on-chain.
6. Collect signed receipts and submit the matching set to the market before the
   deadline.
7. As soon as submission starts, Private Bids switches to `MY SUBMISSIONS` and
   shows a public-safe `SUBMISSION IN PROGRESS` card without claiming on-chain
   acceptance. After broadcast and confirmation, the new transaction is labeled
   `CONFIRMED · FINALITY PENDING` until the finalized
   public reader can recover its canonical bid reference. This public-safe
   pending card survives workspace navigation in the same tab, and automatic
   refresh replaces it without requiring a reload. The browser
   persists no private bid field or ciphertext. The finalized card
   shows only tender/bid ID, lifecycle state, commitment, receipt bitmap,
   accepted block, and a Public dossier link; it cannot restore price,
   delivery, warranty, plaintext, or ciphertext.
8. If selected, receive the public FTestXRP amount and open Activity / Assets
   with the winning wallet to approve the exact amount
   and submit an official FAssets redemption request to an XRPL address. The
   request creates an agent payout obligation; it is not an instant XRP payout.

The submission fails rather than weakening privacy if private ingress, a valid
receipt set, or a common 2-machine quorum is unavailable.

## 6. Close, selection, and recovery

Activity is a compact action center rather than a duplicate tender explorer.
Each non-terminal tender shows its next checkpoint, the authority allowed to
act, minimal deadline/bid progress, and a link back to the full Public dossier.
Rules, scoring, commitments, and TEE facts remain in Public and Auditor.

1. Any user or relay calls close when eligible. The market freezes bid root,
   rules, common quorum, close block, and the official XRP/USD FTSO snapshot.
2. In Activity, a connected user clicks `START FCC COMPUTE`, confirms the
   public instruction fee, and requests selection from the frozen common quorum.
3. Each TEE validates its sealed state against the public ordered root, checks
   credentials, normalizes quotes, and applies `SCORING_V1`.
4. The existing ciphertext ingress exposes a public-safe finalizer endpoint
   that groups exact result bytes only after two distinct approved machines
   agree. It returns no bid plaintext, ciphertext, or decryption capability.
5. The user clicks `CHECK 2/3 & FINALIZE`; the wallet submits the verified
   result and its two FCC signatures. The market reconstructs the full domain,
   verifies threshold signatures,
   marks terminal state, and settles once.
6. If the one-hour result envelope expires, retry with a fresh attempt nonce and
   request ID while preserving every frozen input. Old-attempt results fail.
7. If another finalizer wins the race, reread chain state. If a dependency is
   unavailable, preserve the checkpoint and resume; never use a client-computed
   winner, manual price, replacement machine, or mock result.
8. If no threshold result is retrievable within 24 hours of the first request,
   the buyer may recover only the original escrow. This records failed-compute
   `Refunded`, creates no award, and is never displayed as FCC success.

Historical V1 limitation: if fewer than two frozen TEEs remained valid before
the first selection request succeeded, that market could remain `Closed` and
its post-dispatch refund clock never started. The consumer-selected V2 market
adds a separate close-time refund. Its live undispatched and post-dispatch
refund lifecycles passed before promotion, and the app derives both actions
from canonical V2 state without presenting either refund as FCC success.

The Public Finalizer uses the connected wallet instead of an always-on signer.
The browser pays only the public instruction fee, reads only a sanitized exact
quorum from the existing ingress, and submits it unchanged. It never receives a
TEE key, proxy API key, bid ciphertext, or winner-selection authority. A
stateless relay remains an optional compatible automation path, not a required
hosted service.

## 7. Evidence and privacy labels

Every workflow labels data as one of:

- `PUBLIC`: metadata, identities, commitments, FTSO snapshot, winner, amount,
  transactions, receipt, and result evidence;
- `PRIVATE IN SESSION`: unsent vendor input in browser memory;
- `ENCRYPTED IN TRANSIT`: ephemeral per-TEE ingress payload;
- `SEALED IN TEE`: bid state available only to the approved confidential
  runtime;
- `NOT COLLECTED`: secrets, raw credentials, bid bodies, ciphertext, and private
  score components in public evidence.

## 8. Troubleshooting

- **Wrong network or release:** the header changes to `SWITCH TO COSTON2` and
  the role panel shows `ADD / SWITCH TO COSTON2`. Confirm that wallet request;
  if Coston2 is not saved in the wallet yet, FlareQuorum asks to add the
  official chain (ID `114`) before enabling writes. If the request is rejected,
  retry from the same button after unlocking the selected wallet. The app never
  asks for a signature just to connect; transaction buttons open the separate
  wallet signing prompt only after the correct chain is active. Compare the
  verified Coston2 manifest and runtime before retrying writes.
- **Machine key/policy changed:** discard the unsent payload; a live tender must
  not silently adopt the new policy.
- **Receipt quorum failed:** do not submit a weaker receipt set; retry only the
  tender-fixed common machines.
- **Private ingress unavailable:** show unavailable and retain no payload.
- **Stale/unavailable FTSO:** a USD-enabled tender cannot close with a manual
  replacement price.
- **FDC/Smart Account delayed:** keep the executor's public-safe JSON result;
  do not send another payment with the same nonce or mark the tender funded.
  The result contains `executionAllowedAt` and a checkpoint without FDC proof,
  secrets, or bid data. Run `pnpm flare:funding:resume < checkpoint.json` only
  after that time. The resume path rechecks XRPL finality, nonce, payment
  amount, FDC round/request, and the canonical user-operation commitment;
  success still requires the mint, user-operation, and tender-created events in
  one Coston2 receipt. A changed nonce, quote, domain, or hash fails closed.
- **Split or expired TEE results:** request the same frozen computation again;
  the caller cannot choose among digests.
- **RPC/indexer/relay unavailable:** recover from canonical chain state with
  another provider/runner; never load sample success data.

## 9. Read-only operator inspection

Run `pnpm flare:mcp` only with explicit Coston2 market address, deployment
block, deployment status, and RPC configuration. Its four public tools list
tenders, inspect a tender, inspect the frozen FCC/FTSO selection envelope, and
inspect runtime/immutable protocol bindings. Every read is pinned to the same
12-block-finalized checkpoint; the console has no signer, writer, decryption
path, raw FCC response output, or Sepolia fallback.

## 10. Historical application

The existing Sepolia UI, Safe flow, Nox computation, ERC-7984 settlement, and
evidence remain useful regression material. They are not the Coston2 judge path
and do not prove any FCC, FAssets, FDC, FTSO, or Smart Account capability.
