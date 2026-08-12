# Desktop UI/UX Review Notes

This file preserves decisions from the completed user-led desktop review. The
batch is implemented in the hosted V2 release and covered by production and
keyboard/accessibility smoke evidence. Mobile was outside the discussion scope,
although the release also passed its 320px overflow and navigation checks.

## Working agreement

- Review one page or section at a time from a normal user's perspective.
- Keep explanations short and focused on whether the interface is understandable.
- Apply agreed changes locally, then run tests and deploy once after the review is complete.

## Agreed changes

### Remove the historical Sepolia route from the judge experience

Status: implemented, validated, and deployed in the V2 judge release.

- Remove every Sepolia link from the Coston2 user interface.
- Redirect `/room` and legacy role/tender URLs to the canonical Coston2 route.
- Keep the historical Sepolia source, tests, manifests, and evidence in the
  repository as an isolated regression baseline; do not expose it in the judge UI.

### Make Verified Flare Integrations visibly expandable

Status: implemented, validated, and deployed in the V2 judge release.

- Keep the section collapsed by default.
- Add an obvious chevron and `Click to expand` / `Click to collapse` guidance.
- Make the complete header row interactive with clear hover, pointer, focus,
  keyboard, and expanded states.
- Preserve the current visual style.

### Move technical identifiers into an expandable area

Status: implemented, validated, and deployed in the V2 judge release.

- Keep the human-readable tender facts visible: lifecycle, status, escrow,
  deadline, accepted-bid count, scoring rules, service requirements, winner,
  payout, and refund.
- Add `Technical verification details` at the end of the tender card.
- Reveal hashes, extension ID, code version, selection attempt, request ID, TEE
  identities and fingerprints, bid commitments, receipt bitmap, ordered bid
  root, FTSO identifiers/checkpoints, result digest, and finalized block only
  when expanded.
- Retain Copy and Explorer actions inside the expanded area.

### Keep the privacy checkpoint visible

Status: implemented, validated, and deployed in the V2 judge release.

- Keep `PUBLIC CHECKPOINT / PRIVATE LOSING BIDS` permanently visible as the
  visual privacy statement; do not move it into the technical accordion.
- Place it after the human-readable tender facts and before the collapsed
  technical verification details.
- Adapt its headline to tender state while preserving the current visual style:
  - Pending: `Result pending — losing bids remain private`.
  - Awarded: `Winner published — losing bids remain private`.
  - Refunded: `Tender refunded — bid details remain private`.

### Rebuild Buyer XRP funding as one guided card

Status: implemented, validated, and deployed in the V2 judge release. The
browser continues to stop at an honest executor handoff when no supported
executor API is available.

- Make FTestXRP and XRP two alternative funding methods; users never need to
  complete both.
- When XRP is selected, combine the Buyer Brief and XRP funding handoff into
  one `XRP-NATIVE TENDER` card instead of presenting two independent cards.
- Keep the non-custodial explanation at the top of that card and simplify its
  user-facing message while preserving the explicit statement that FlareQuorum
  never receives an XRPL seed or private key.
- Use one truthful, state-driven journey:
  1. `DEFINE TENDER RULES` — title, category, ceiling, deadline, objective,
     acceptance criteria, vendor questions, approved vendors, and scoring
     weights.
  2. `CONNECT GEMWALLET` — immediately before a wallet action, not at page load.
  3. `REVIEW XRP PAYMENT` — calculate the payment amount and memo from the
     validated tender rules.
  4. `PAY XRP` — the XRPL wallet signs and submits the testnet payment.
  5. `VERIFY PAYMENT & OPEN TENDER` — prepare/submit the executor job from the
     confirmed transaction ID, obtain the FDC proof, mint FTestXRP through the
     Smart Account, and create the funded tender.
- Do not allow payment before tender rules determine the correct amount and
  memo. Do not describe payment-draft generation as executor-job preparation.
- Replace the initial `PREPARE PUBLIC 0xFE JOB` action with
  `REVIEW XRP PAYMENT`. Show `VERIFY PAYMENT & OPEN TENDER` only after a valid
  XRPL transaction ID exists and only when it performs the real next action.
- Move manual transaction ID entry, Smart Account wallet ID, executor fee,
  `0xFE` memo, payment JSON, executor JSON, and the runbook into collapsed
  `Advanced funding details`.
- Remove `READ FUNDING RUNBOOK` from beside the primary XRP action. Rename it
  `VIEW TECHNICAL FUNDING GUIDE` inside `Advanced funding details` and point it
  to a dedicated `/docs#xrp-funding` section rather than the general Coston2
  introduction.
- Keep the short task instructions inside the card's `?` help so ordinary users
  do not need to leave the form; reserve the technical guide for advanced or
  troubleshooting use.
- Derive every progress state from real user or chain state. Do not mark XRPL
  payment or FDC proof complete/active before the corresponding action occurs.
- Report success only after the funded tender exists on Coston2 and show its
  Tender ID and explorer link.
- If direct minting is delayed, show `Funding is delayed — do not pay again`
  with a `RESUME VERIFICATION` action that reuses the same payment and nonce.

### Add contextual help to input cards

Status: implemented, validated, and deployed in the V2 judge release.

- Add a clearly recognizable `?` help control to the header of every card that
  asks the user to enter data or complete a transaction step.
- On pointer hover or keyboard focus, show a short plain-language guide that
  explains what the card is for, what the user must provide, and what happens
  after submission.
- Keep each guide concise and task-specific; prefer two to four short steps
  instead of repeating the full documentation.
- Support keyboard focus and an accessible label. Allow click to keep the help
  open when the user needs time to read it; it must not be hover-only.
- Do not place essential validation, privacy, payment, or irreversible-action
  warnings only inside the help popup. Those warnings must remain visible next
  to the relevant field or action.
- Apply this pattern consistently to Buyer Rules, XRP Payment, Vendor Bid, and
  any other desktop card containing form inputs.

### Simplify Private Bids and separate Redemption

Status: implemented, validated, and deployed in the V2 judge release.

- Keep open-tender facts publicly readable, but after wallet connection check
  the approved-vendor allowlist immediately rather than waiting for submit.
- Show `You are eligible for N open tenders`, prioritize eligible tenders, and
  place ineligible public tenders in a disabled `Other public tenders` group.
- Add a concise Tender Summary above the private fields with the title,
  objective, acceptance criteria, deadline, human-readable ceiling, service
  bounds, and scoring weights. Do not expose or fetch any private bid data.
- Replace raw `micros` in the selector with a human-readable XRP/FTestXRP
  amount and a clear eligibility state.
- Validate quote, delivery, and warranty fields inline and disable the submit
  action until the selected tender, wallet eligibility, and values are valid.
- Keep private bid fields session-only and never persist them. Display the
  visible warning `This private bid is not saved. Do not refresh before
  submission.` near the composer.
- Add a review state for price, delivery, and warranty before
  `ENCRYPT & SUBMIT BID`; plaintext remains only in the active browser session.
- Mark credential-gated tenders as unsupported before the user enters a bid,
  instead of revealing the limitation only after selection or submit.
- Remove the FXRP/XRP Redemption panel from Private Bids. Move it to Activity
  or a dedicated Assets/awarded-tender area because bid submission and
  post-award asset exit are separate tasks.
- Before eligibility, show a compact locked Redemption state rather than
  disabled input fields: `Available after your wallet wins an awarded tender`
  with the visible requirements `Winning wallet · Awarded tender · Eligible
  balance` and an accessible `How redemption works` help action.
- Do not communicate the eligibility requirement only on hover. Keep it visible
  and use hover/focus help only for supplementary guidance.
- Replace the locked state with the Redemption form only when the connected
  wallet is the public winner of an Awarded tender and its balance meets the
  protocol minimum. Explain that an official redemption request is not an
  instant XRPL payout.

### Combine Auditor evidence into one tender dossier

Status: implemented, validated, and deployed in the V2 judge release.

- Keep search, status filtering, tender selection, and the finalized-block
  indicator above the selected dossier.
- Replace the separate Trust Binding, Public Bid Receipts, and Award Proof cards
  with one `Tender #ID · Audit Dossier` card so every changing value is clearly
  associated with the selected tender.
- Preserve three clearly divided sections inside the card:
  1. `TRUST BINDING` — market, FCC extension/code, rules hash, ordered root,
     three fixed TEE identities/fingerprints, and the 2-of-3 threshold.
  2. `ACCEPTED BID RECEIPTS` — state explicitly that the count belongs to this
     tender, then show vendor, commitment, receipt bitmap, and accepted block.
  3. `PUBLIC OUTCOME` — status, winner, winning bid, payout, buyer remainder,
     result digest, and finalized block when an award exists.
- Include the Tender ID in section context where needed, for example
  `3 accepted commitments for Tender #23`, so receipt counts cannot be mistaken
  for system-wide totals.
- Keep internal dividers and subheadings; combining the cards must not flatten
  all technical values into one uninterrupted list.
- Preserve the Public/Sealed visibility boundary after the dossier as the audit
  privacy explanation.

### Separate actions, inputs, and read-only information

Status: implemented, validated, and deployed in the V2 judge release.

- Reserve orange fill, a 2px outline, compact corners, pointer cursor, and a
  visible hover/focus response for actions. Secondary actions remain white but
  use the same stronger action outline; disabled actions lose the hover response
  and use no elevation.
- Render editable inputs on a pale-orange surface with a 2px outline, orange
  left edge, text/select cursor, and stronger focus state. Required fields carry
  a visible `REQUIRED` label; optional fields remain explicitly named optional.
- Render disabled fields with a muted dashed outline and `not-allowed` cursor.
  Render generated or read-only values with a dashed patterned surface and a
  visible `READ ONLY` label so they cannot be mistaken for editable inputs.
- Render privacy, network, lifecycle, and verification states as compact flat
  rectangular labels with no hover or pointer behavior. Do not reuse the button
  pill treatment for status.
- Keep clickable cards identifiable through a trailing action word/arrow,
  pointer cursor, thicker outline, selected fill, and hover movement. Static
  evidence cards never receive that response.
- Style Copy, refresh, help, and disclosure controls as actual controls with a
  visible focus/hover response. Links retain underlining or a trailing arrow.
- Apply this grammar consistently to Public filters and dossiers, Buyer and XRP
  forms, Private Bids, Activity/Assets, Auditor filters, and lifecycle actions.
- This is a presentation and accessibility change only. It must not alter
  contract calls, validation rules, wallet authority, confidential data flow,
  or lifecycle state derivation.

## Conflict-free implementation order

1. **Lock the judge experience to Coston2.** Remove the historical room from
   the browser router and navigation, redirect old `/room` links to `/flare`,
   and remove historical links from the current Flare docs. Leave the Sepolia
   implementation and evidence in the repository but outside the judge route
   and production navigation. A missing Flare configuration must fail closed;
   it must never restore the Sepolia UI.
2. **Build the shared interaction patterns.** Establish one desktop visual
   grammar for action buttons, editable/required/read-only fields, static status
   labels, clickable cards, disclosures, and contextual help. Add one accessible
   disclosure pattern with chevron, expanded text, hover, focus, and keyboard
   states, then add the reusable `?` contextual-help control for input cards.
3. **Simplify the Public tender card.** First make Verified Flare Integrations
   visibly expandable. Then keep business facts and the privacy checkpoint
   visible, keep the public award/refund outcome readable, and move only the
   technical identifiers and proof bindings into `Technical verification
   details` at the end. Do not hide status, deadline, escrow, winner, payout,
   refund, or privacy messaging.
4. **Restructure Buyer without changing transaction behavior.** Keep the
   funding-method choice first, render only the selected method, and extract a
   single shared Buyer Brief/Rules form so switching methods never creates two
   forms or two drafts. For direct FTestXRP, preserve the existing
   `APPROVE & OPEN TENDER` transaction path.
5. **Turn XRP into a real state-driven journey.** Place the shared Rules form
   inside one XRP-native card, followed by wallet connection, payment review,
   wallet payment, verification/minting, and the final tender result. Split the
   current draft generation from executor-job generation so each button names
   the action it actually performs. Keep technical/manual controls collapsed.
6. **Verify the executor boundary before exposing the final XRP action.** The
   current browser only produces executor JSON. `VERIFY PAYMENT & OPEN TENDER`
   may be shown only after a supported executor API is connected and the action
   really advances FDC, Smart Account minting, and tender creation. Otherwise
   retain an honest pending/handoff state and never claim that the tender is
   open. No client-side winner, signer key, credential, or mock-success fallback
   may be introduced.
7. **Simplify Private Bids and relocate Redemption.** Add the public Tender
   Summary, perform early wallet eligibility checks, validate inputs inline,
   keep the no-persistence warning visible, and add a private in-session review
   before encryption. Move Redemption to Activity/Assets and reveal its
   controls only for an eligible winning wallet.
8. **Combine the selected Auditor evidence.** Keep the selector outside, then
   render Trust Binding, accepted receipts, and the public outcome as three
   sections of one Tender Audit Dossier. Keep the visibility boundary separate
   and make every receipt count explicitly tender-scoped.
9. **Align help and documentation.** Add concise `?` guidance to each input
   card, create `/docs#xrp-funding`, move the technical funding-guide link into
   Advanced details, and update canonical UI/user documentation to match the
   implemented flow.
10. **Validate and release once the review is closed.** Add route, disclosure,
   Public-card, Buyer-method, XRP-state, accessibility, draft/privacy, and
   fail-closed tests. Then run the repository-required test, lint, build,
   documentation, and secret checks; perform a desktop visual review; create
   focused commits; push; and deploy only the validated Coston2 build.

## Validation and release

The batch completed repository test/lint/build, documentation and secret checks,
hosted V2 production smoke, and keyboard/accessibility validation before the
consumer deployment.

## Hash-verified public Buyer Brief

Status: implemented and deployed with the hosted V2 ingress/web path; strict
registry and browser tests plus production Buyer Brief rendering pass.

- Keep title, category, public objective, acceptance criteria, optional vendor
  questions, asset, deadline, and approved vendor list public after tender
  creation. Bid price, delivery, warranty, credentials, salts, ciphertext, and
  losing-bid details remain private.
- Publish the exact canonical public brief before any approval, XRP payment, or
  create-tender request. If publication or returned-hash verification fails,
  stop before asking the wallet to act.
- Automatically show the verified brief in Public, Private Bids, and the
  selected Auditor dossier. Wallet connection controls eligibility and bid
  submission only; it does not gate public tender information.
- Recompute `metadataHash` in every browser consumer. On missing, unavailable,
  or mismatched data, show a clear hash-only/failure state and never invent the
  original text.
- Keep the existing market contract and `metadataHash` unchanged. This feature
  requires an ingress/service rollout and persistent public-brief volume, not a
  contract redeployment.
