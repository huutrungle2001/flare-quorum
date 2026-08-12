# FlareQuorum — Style Reference

> Cel-shaded confidential procurement terminal — sealed-envelope anime rendered
> as an institutional bidding interface.
>
> Status: Canonical visual, interaction, responsive, and privacy-language
> specification. The implemented judge app is locked to the verified
> Coston2/FCC product. Historical Sepolia source, tests, manifests, and evidence
> remain repository-only regression material and are not exposed by the browser
> router or current product navigation.
>
> Route boundary: `/flare` is the canonical tender application. Old `/room` and
> root role/tender links redirect to `/flare`; missing Coston2 configuration
> fails closed and never restores a Sepolia or mock UI.

**Theme:** mixed

FlareQuorum uses a monochromatic canvas with one vivid-orange signal. The atmosphere
comes from 90s anime title cards, confidential dossier stamps, sealed envelopes,
radar rings, and procurement-terminal typography—not from generic crypto
gradients or dashboard chrome.

The product must still behave like serious financial software. Display serif
type carries brand moments; condensed sans-serif carries navigation and actions;
monospace carries commitments, extension IDs, signatures, blocks, and timestamps. Surfaces remain
flat. Structural cards use generous 25px corners; action controls, editable
fields, and flat status labels use deliberately different shapes and outlines
so interaction is visible without elevation shadows. Vivid orange appears only
when the interface is inviting an action, marking a selected state, identifying
an editable field edge, or confirming verified evidence.

## 1. Experience principles

- **Private competition, verifiable award.** Every screen distinguishes public
  metadata, ephemeral encrypted transport, sealed TEE-only bid state, and the
  public winner and settlement amount.
- **Roles before controls.** Buyer, Vendor, Public Finalizer, Auditor, and XRP
  Treasury contexts must be explicit before an action appears.
- **Verification is a journey.** XRP authorization/FDC minting, Coston2 funding,
  private TEE receipts, FTSO close, threshold result, and settlement are
  separate stages.
- **Flat, not vague.** No decorative depth may imply transaction finality or
  authority.
- **Readable under pressure.** Display typography never replaces operational
  labels, values, validation, or evidence.
- **No fabricated success.** Empty, unavailable, encrypted, pending, and failed
  states must look deliberately different.

## 2. Color tokens

| Name | Value | Token | Role |
|---|---|---|---|
| Flare Orange | `#ff8a1f` | `--color-veil-green` (compatibility token) | Primary action, selected role/tender, verified proof, award spotlight, illustration accent |
| Ink Black | `#000000` | `--color-ink-black` | Text, borders, dark bands, destructive actions, encrypted-state fill |
| Paper White | `#ffffff` | `--color-paper-white` | Page canvas, cards, fields, text on dark surfaces |

No additional semantic colors are introduced. State must never rely on color
alone:

- Verified: orange plus check icon and `VERIFIED`.
- Pending: white plus animated/patterned indicator and `PENDING`.
- Encrypted: black plus lock icon and `ENCRYPTED`.
- Error: black double border plus warning icon and explicit error text.
- Destructive: black fill, white label, confirmation copy.
- Disabled: black/white treatment at reduced opacity, with `aria-disabled`.

Allowed alpha values are derived from the three tokens; they are not additional
brand colors.

## 3. Typography

### Display serif

Token: `--font-display`

- Preferred when licensed: GT Alpina Condensed, weights 100–200.
- Open-source build default: Cormorant Garamond, weight 300.
- Fallback: EB Garamond, Georgia, serif.
- Role: landing hero, award reveal, major section statements.
- Never use for form labels, wallet state, evidence, or body copy.
- Tracking tightens with size from `-0.02em` to `-0.06em`.
- Line height: `0.82–1.05`.

Do not synthesize unavailable 100/200 weights for Cormorant Garamond. Use its
real 300 weight in the public build unless a licensed GT Alpina asset exists.

### Barlow Condensed

Token: `--font-ui`

- Weights: 400, 500, 700.
- Role: navigation, body UI, buttons, tabs, table headings, cards, secondary
  headlines, lifecycle strips.
- Uppercase labels use `0.08em–0.16em` tracking.
- Operational body copy uses normal case and `0–0.02em` tracking.

### Space Mono

Token: `--font-mono`

- Weight: 400 or 700.
- Role: eyebrows, privacy labels, timestamps, chain IDs, addresses,
  commitments, result digests, extension IDs, transaction hashes, and receipt
  metadata.
- Eyebrows use uppercase at `0.16em–0.20em`.
- Long identifiers must wrap or truncate with an accessible full-value control.

### Type scale

| Role | Desktop | Responsive rule | Line height | Font |
|---|---:|---|---:|---|
| Caption | 12px | fixed | 1.5 | Mono/UI |
| Body small | 14px | fixed | 1.45 | UI |
| Body | 16px | fixed | 1.6 | UI |
| Body large | 18px | `16–18px` | 1.5 | UI |
| Subheading | 32px | `clamp(26px, 3vw, 32px)` | 1.1 | UI |
| Heading small | 48px | `clamp(36px, 5vw, 48px)` | 0.98 | UI/display |
| Heading | 80px | `clamp(48px, 8vw, 80px)` | 0.9 | Display |
| Heading large | 120px | `clamp(64px, 11vw, 120px)` | 0.84 | Display |
| Display | 182px | `clamp(72px, 15vw, 182px)` | 0.8 | Display |

Operational app headings normally stop at 48px. The 80–182px scale is reserved
for landing and terminal award moments.

## 4. Spacing and shapes

Base unit: `4px`.

| Token | Value |
|---|---:|
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 20px |
| `--space-6` | 24px |
| `--space-8` | 32px |
| `--space-10` | 40px |
| `--space-12` | 48px |
| `--space-15` | 60px |
| `--space-16` | 64px |
| `--space-20` | 80px |
| `--space-30` | 120px |
| `--space-35` | 140px |

Named radii:

| Element | Radius |
|---|---:|
| Cards and panels | 25px |
| Action buttons | 7px |
| Editable inputs | 4px |
| Compact status labels | 0 |
| Full nav/role pills | 100px |
| Illustration circles | 100% |

Rules:

- Standard structural border: `1px solid #000`.
- Action and editable-control border: `2px solid #000`.
- Focus ring: `3px solid #ff8a1f` plus a 1px black outer outline.
- Reserve 25px for cards, 7px for actions, 4px for fields, square corners for
  status labels, and 100px for navigation pills.
- No card/button drop shadows.
- An orange blurred halo is allowed only behind a verified winner/proof spotlight;
  it is decorative, never an elevation cue.

## 5. Layout system

### Global

- Content max-width: `1200px`.
- Full-bleed surfaces: landing hero, lifecycle marquee, proof/winner reveal, and
  footer only.
- Standard section gap: `80px`.
- Standard card padding: `32px`.
- Dense operational card padding: `20–24px`.
- Internal control gap: `10–16px`.

### Landing page

Fixed white top navigation over a full-bleed black hero:

1. Eyebrow.
2. Stacked display statement.
3. Dual CTA pair.
4. Cel-shaded sealed-bid illustration.
5. White/orange lifecycle marquee.
6. Product explanation and live evidence.
7. Full-bleed black footer.

### Application

The Flare tender room uses a permanent laptop sidebar; the standalone landing
page and documentation do not.

Desktop:

- Fixed horizontal product bar.
- Fixed left workspace rail beneath the product bar.
- Public explorer: four-column, five-item paginated tender list plus eight-column
  detail canvas. Search, filters, list, and detail share the document scroll;
  the list and detail must not create competing viewport-height scroll panes.
- Buyer/Vendor task view: seven-column primary workflow plus five-column
  privacy/evidence rail.
- Activity: timeline first, evidence detail second.

Mobile:

- Compact top bar with wordmark, network, and wallet button.
- Horizontally scrollable role pills.
- Single-column workflows.
- Sticky bottom action dock only when a valid transaction action exists.
- Evidence drawers become full-height sheets.

## 6. Navigation

### Public top navigation

Left:

- `TENDERS`
- `HOW IT WORKS`
- `DOCS`
- `EVIDENCE`

Center:

- `FLAREQUORUM` wordmark in Barlow Condensed 700.

Right:

- Coston2 network indicator.
- Wallet state.
- Black or orange `ENTER TENDER ROOM` pill.

Social links belong in the footer, not the primary product navigation.

### Application role switcher

Role pills:

- `PUBLIC`
- `BUYER`
- `PRIVATE BIDS`
- `ACTIVITY`
- `AUDITOR`

The active role uses Veil Green with black text and a black border. Role changes
must not imply wallet permission. Unauthorized roles remain browsable where
public data exists, with writes hidden or disabled and explained.

`PUBLIC` is strictly wallet-free discovery and tender inspection. `BUYER`
contains one rules draft with two alternative funding choices: direct
Coston2/FTestXRP or the advanced XRPL → FDC → Smart Account path. The historical
`?role=treasury` URL is only a compatibility alias that opens Buyer with the XRP
choice selected. `PRIVATE BIDS` is the vendor/FCC ingress path, and `ACTIVITY`
is the public action/recovery queue plus contextual Assets/Redemption.
`ACTIVITY` is not a privileged role: permissionless close remains
permissionless, buyer cancellation/refund still require the canonical buyer,
and FCC dispatch/result grouping remain relay-only. `AUDITOR` is wallet-free
and has no signer or bid access.

### Historical UI parity decisions

The pre-Flare interface is a read-only visual and journey reference, not a
source of Coston2 deployment truth. The Flare shell restores its useful product
communication patterns: editorial landing hero, procurement lifecycle,
workspace navigation, public filters/deadlines, contextual help, activity
readiness, and detailed award proof. Safe Buyer, Nox Private Reveal, My Bid,
and Granted Access are not ported because their custody/decryption model is not
the FCC championship boundary. Their product purposes map to XRP Treasury/EVM
Buyer recovery, private TEE ingress, Public Finalizer, and wallet-free Auditor
evidence instead. No historical address, test, screenshot, or Nox artifact may
be presented as Flare implementation evidence.

## 7. Core components

### Primary action button

- Veil Green fill.
- Ink Black text and 2px border.
- Barlow Condensed 500, 16px, uppercase, `0.1em`.
- Padding `10px 24px`.
- Radius `7px`.
- Hover preserves the outline, changes position slightly, and uses no shadow.

Examples:

- `CREATE TENDER`
- `SEND PRIVATELY & SUBMIT RECEIPTS`
- `FINALIZE AWARD`
- `REDEEM FXRP`

### Secondary action button

- Paper White fill.
- Ink Black text and 2px border.
- Same typography and geometry as primary.
- Optional trailing arrow `→`.

Examples:

- `EXPLORE TENDERS →`
- `VIEW PROOF →`
- `OPEN IN EXPLORER →`

### Destructive action button

- Ink Black fill and Paper White text.
- Warning icon and explicit destructive verb.
- Requires a review/confirmation step.
- Never styled with Veil Green.

Examples:

- `CANCEL TENDER`
- `REVOKE MODULE`
- `REMOVE OPERATOR`

### Privacy badge

| State | Visual |
|---|---|
| `PUBLIC` | Flat pale label, black left rule, globe icon |
| `ENCRYPTED` | Flat black label, orange left rule, white lock icon/text |
| `AUTHORIZED` | Flat orange-tinted label, black left rule, key icon/text |
| `PROOF READY` | Flat orange-tinted label, black left rule, check icon |
| `PENDING` | Flat pale label, black left rule, progress glyph |

Badges always include text, remain square and flat, and never receive hover,
pointer, or pressed behavior.

### Editable and read-only fields

- Editable fields use a pale-orange surface, 2px black border, 4px radius, and
  orange left edge. Focus makes the edge stronger without adding elevation.
- Required fields expose a visible `REQUIRED` label; optional fields are named
  optional in their field label or guidance.
- Disabled fields use a muted dashed border and `not-allowed` cursor.
- Generated/read-only fields use a dashed patterned surface and visible
  `READ ONLY` label. Static evidence values use text or definition lists rather
  than input styling.

### Tender dossier card

White card, 1px black border, 25px radius, 24–32px padding.

Required hierarchy:

1. Mono tender ID and status.
2. Tender title.
3. Public ceiling and deadline.
4. Buyer/treasury identity.
5. Bid count and lifecycle readiness.
6. Privacy badges.
7. One primary next action.

When the verified contract exposes only a public metadata hash—not the original
brief text—the card title is the canonical `Tender #<id>` plus status and buyer.
Do not invent or reuse a generic procurement title. A human-authored title may
replace it only after a separately trusted public-metadata resolver verifies the
content against the contract hash.

Selected card uses an orange edge marker or fill block—not a shadow.

### Bid composer

The confidential field is visually treated as a sealed dossier:

- Black field header with `ENCRYPTED INPUT`.
- White numeric input area.
- Clear target contract, token, public ceiling, and viewer explanation.
- Fixed fields for XRP/USD price, delivery days, warranty days, and supported
  credential inputs; no free-form or AI-scored terms.
- Pre-submit checklist: correct vendor, Coston2, verified market/extension/code,
  all three TEE fingerprints, common threshold, deadline, and rules hash.
- Primary action: `SEND PRIVATELY & SUBMIT RECEIPTS`.
- Progress shows encryption/receipt acknowledgement per machine, then the final
  on-chain receipt bitmap and common quorum.

The field never echoes a submitted plaintext or ciphertext into durable
activity, analytics, logs, URLs, calldata, or public evidence.

### Private Bids navigation and My Submissions

- Private Bids has one local two-item navigation: `SUBMIT BID` and
  `MY SUBMISSIONS`. These are two vendor intents inside the same workspace,
  not new global roles.
- After a successful receipt-quorum transaction, move the vendor to
  `MY SUBMISSIONS`. Until the public reader reaches 12-block finality, show the
  confirmed transaction as `CONFIRMED · FINALITY PENDING`; never fabricate a
  finalized bid reference early.
- The finalized list is derived only by filtering canonical public bid
  references against the connected vendor address. It shows tender/bid ID,
  lifecycle state, receipt quorum, accepted block, and a Public dossier link.
- Commitment, submission nonce, bitmap, and receipt expiry remain inside a
  collapsed `PUBLIC RECEIPT DETAILS` section at the end of each card.
- `MY SUBMISSIONS` is a wallet-scoped convenience view, not private retrieval
  or authentication. It never restores price, delivery, warranty, credentials,
  salt, plaintext, or ciphertext after submission.

### XRP treasury custody header

Full-width white panel with black border and 25px radius:

- Buyer account or Flare Smart Account address.
- Connected wallet or XRPL authorization mode.
- FTestXRP/FXRP asset and public balance.
- Public escrow ceiling and allowance/funding state.
- FAssets mint/redemption readiness when verified.
- XRPL transaction, user-operation hash, FDC proof, PersonalAccount, and nonce
  checkpoints.
- FCC extension/code version, three machine fingerprints, and 2-of-3 policy.

Copy must state: `THE TREASURY OWNS THE FUNDS. THE TEE SELECTS; THE CONTRACT SETTLES.`

### Public Buyer Brief draft

- The long public Buyer Brief auto-saves only in tab-scoped `sessionStorage`.
- The storage schema is versioned and allowlists title, category, objective,
  acceptance criteria, public vendor questions, ceiling, approved vendor
  addresses, deadline, and public scoring weights.
- Unknown keys invalidate the stored record. Bid plaintext, ciphertext,
  credentials, salts, signatures, wallet material, and FDC proofs are never
  accepted by this draft store.
- Show character/range guidance before submission and an explicit
  `CLEAR PUBLIC DRAFT` action.
- Compose first; place the compact wallet connection checkpoint immediately
  before the transaction action. Public and Auditor workspaces label the wallet
  optional and do not show wallet balances in the workspace rail.
- On create, publish the canonical public-safe preimage to an immutable,
  content-addressed registry before any approval/payment/create transaction is
  requested. The returned content must hash to the same `metadataHash` passed
  to the market.
- Public, Private Bids, and Auditor dossiers automatically render one shared
  `PUBLIC BUYER BRIEF / HASH VERIFIED` panel. It shows title, category, asset,
  objective, acceptance criteria, optional vendor questions, and approved
  vendors without requiring a wallet.
- Render explicit `VERIFYING`, `HASH ONLY`, `REGISTRY UNAVAILABLE`, and
  `VERIFICATION FAILED` states. Never infer text from the hash or silently use
  a stale draft/cache after verification fails.

### Lifecycle strip

On-chain status sequence:

`XRP AUTHORIZED → MINT/FUND PENDING → OPEN → CLOSED → COMPUTE PENDING → AWARDED / REFUNDED`

`CANCELLED` is a terminal branch from failed funding confirmation or from
`OPEN` before the first bid.

Derived readiness labels appear beneath the status rather than as contract
states:

`FDC PROOF PENDING`, `VERIFYING ESCROW`, `ACCEPTING PRIVATE BIDS`,
`QUORUM HEALTHY`, `FTSO SNAPSHOT FROZEN`, `FCC REQUEST PENDING`, and
`2 OF 3 RESULTS AGREE`.

- Barlow Condensed 700 uppercase.
- Current step: orange.
- Completed steps: black with check.
- Future steps: white outline.
- On mobile it becomes a vertical timeline.

### Activity action center

- Activity is an action and recovery queue, not a second Public explorer.
- Each non-terminal tender uses one compact action card containing only tender
  ID/state, the next step, who may act (`ANYONE`, `BUYER ONLY`,
  `DEDICATED RELAY`, or `NO ACTION REQUIRED`), bid progress, deadline, and the
  applicable primary action.
- Rules, scoring, buyer addresses, TEE identities, commitments, and selection
  codes are not repeated. Every card links to `VIEW PUBLIC DOSSIER` for those
  facts.
- The queue summary separates `NEEDS ACTION` from `TRACKING ONLY`; a tender
  waiting for bids or FCC processing must not visually resemble a clickable
  action.
- XRP redemption remains a separate Activity / Assets card and stays locked
  until the connected wallet is the public winner of an Awarded tender.

### Winner reveal panel

Full-bleed black or black card:

- Mono eyebrow: `TEE-SIGNED RESULT / PUBLIC SETTLEMENT`.
- Display serif: `AWARDED`.
- Public winner identity.
- Two TEE signers, quorum/result/transaction/receipt evidence.
- Receipt owner equals the winning vendor and the receipt is non-transferable.
- Winning settlement amount is public and explicitly labeled. Losing prices
  remain encrypted.
- One optional orange glow halo behind the award seal.

### Result inspector

Flat white evidence panel:

- Chain ID and block.
- Contract and transaction.
- Extension ID, code version, three machine fingerprints, common quorum, rule
  hash, and ordered bid root.
- XRP/USD FTSO value, decimals, timestamp, feed ID, and close block.
- Result digest, signature status, and verification result.
- XRPL payment, FDC proof, Smart Account sender/nonce/user-operation hash, and
  FAssets settlement identifiers for the flagship tender.
- Receipt ID.
- Expandable, field-level sanitized calldata/event summaries.

Never render private bid payloads, TEE secrets, wallet signatures, credentials,
or confidential plaintext in copyable public evidence. The public TEE result
signature may be displayed only when the evidence policy permits it.

### Auditor evidence card

Shows:

- Market, extension ID, approved code version, three registered machines, and
  2-of-3 threshold.
- Receipt/common-quorum bitmaps, rule hash, ordered bid root, FTSO snapshot,
  close checkpoint, result digest, and two recovered signers.
- Exact evidence scope: `PUBLIC VERIFICATION ONLY`.
- Explicit exclusions: `NO BID DECRYPTION / NO SPEND / NO WINNER OVERRIDE`.
- Winning payout and refund/remainder conservation.

The first Flare release exposes no auditor control that decrypts losing bids.

### Progress notice

One persistent operation notice tracks the active sub-journey, with at most six
visible stages. XRP funding uses:

1. PersonalAccount and nonce derived.
2. User operation reviewed.
3. XRPL `0xFE` payment committed.
4. FDC proof ready.
5. Direct mint and calls submitted.
6. Coston2 tender funded.

Bid intake uses `LOCAL DRAFT → ENCRYPTING → TEE RECEIPTS → ON-CHAIN
COMMITMENT`; selection uses `CLOSE → FTSO SNAPSHOT → FCC REQUEST → 2 OF 3
AGREE → SETTLED`. Completed stages remain expandable in Activity.

Mined transactions are not marked failed because a later FCC stage is pending.
Recovery actions appear in Activity.

## 8. Brand moments

### Landing hero

Eyebrow:

`CONFIDENTIAL PROCUREMENT / FLARE COSTON2`

Stacked display:

```text
PRIVATE BIDS.
PUBLIC
AWARDS.
```

Primary CTA: `ENTER TENDER ROOM`

Secondary CTA: `EXPLORE LIVE TENDERS →`

The illustration depicts sealed bid envelopes moving through a black FCC/TEE
aperture toward an orange signed-result award stamp. Use flat cel-shaded forms, thick ink
outlines, no photographic texture, and no token/coin imagery.

### Marquee

```text
PRIVATE MULTI-CRITERIA BIDS — 2-OF-3 TEE AWARDS — XRP-FUNDED BUDGETS —
FTSO-BOUND SCORING — PUBLIC SETTLEMENT
```

Use Barlow Condensed 700, `48–80px`, black on white. Motion pauses on hover and
respects `prefers-reduced-motion`.

### Footer

Full-bleed black band with:

- Product statement.
- Tenders, Docs, Evidence, GitHub, and Coston2 links.
- Social links.
- Testnet and unaudited disclaimer.

## 9. Imagery

Illustration-first, cel-shaded, and procurement-specific:

- Sealed envelopes and bid dossiers.
- Veils, apertures, privacy shutters, and concentric proof rings.
- XRP treasury vault and Flare signal geometry.
- Award stamps and receipt tickets.
- Courier silhouettes or terminal operators.

Use black/white construction with Veil Green accents. Avoid:

- Bull/bear trading imagery.
- Vehicles or action characters unrelated to procurement.
- Coins, candlestick charts, generic padlocks, and AI robots.
- Photography, gradients, glassmorphism, 3D token renders, and atmospheric
  perspective.

Icons are 1–1.5px outline icons in black or white. Filled icons are reserved for
privacy/status badges.

## 10. Accessibility and responsive rules

- Ink Black on Flare Orange is the only text combination allowed on orange.
- Never use white body text on orange or orange body text on white.
- Body text contrast must meet WCAG AA.
- Focus is visible in keyboard and high-contrast modes.
- Display serif never carries essential instructions alone.
- Status always includes icon and text.
- Minimum target height: 40px; primary actions target 44px.
- Tables provide card alternatives below 720px.
- Dialogs trap focus, close with Escape, restore focus, and lock background
  scrolling.
- Animated marquee/illustration/proof pulses respect reduced motion.
- Commitment, digest, and address truncation always exposes a labelled copy/full-value
  control.
- Collapsed evidence headers state that they are interactive, include a chevron,
  and expose matching hover, focus, keyboard, expanded, and collapsed states.
- Every card that collects input has an accessible `?` task guide. Essential
  validation, privacy, payment, and irreversible-action warnings remain visible
  outside the help popup.
- Buttons, editable fields, static status labels, read-only values, links, and
  clickable cards remain visibly distinct without requiring hover to identify
  their role.
- Desktop Public and Auditor lists provide search and bounded pagination, and
  default Auditor inspection to the newest awarded dossier when one exists.
- The interface supports 320px without horizontal page overflow.

## 11. Do

- Use only Veil Green, Ink Black, and Paper White.
- Use display serif sparingly for brand and award moments.
- Keep operational UI in Barlow Condensed and evidence in Space Mono.
- Pair orange primary and white outlined secondary actions.
- Use 25px card corners, 7px action corners, 4px field corners, square status
  labels, and 100px role/nav pills.
- Give major landing sections at least 80px vertical separation.
- Explain privacy and authority next to every confidential transaction.
- Show public, encrypted, authorized, and proof-ready states explicitly.
- Use flat cel-shaded illustration to create atmosphere.

## 12. Do not

- Do not introduce red, blue, yellow, purple, or gray semantic tokens.
- Do not use orange as body text or a full-page background.
- Do not use shadows, gradients, glass blur, beveled panels, or elevation stacks.
- Do not put operational body copy in the display serif or mono font.
- Do not hide invalid/error states using color alone.
- Do not use oversized hero typography inside forms or evidence views.
- Do not merge treasury ownership, connected-wallet identity, XRPL
  authorization, and TEE identity.
- Do not describe encrypted bids as anonymous transactions.
- Do not reveal or log bid plaintext after submission.

## 13. Championship screen acceptance

The Coston2 judge release is visually complete only when these screens exist
and use verified generated bindings:

| Screen | Must communicate |
|---|---|
| Landing/live proof | XRP-to-FXRP funding, private multi-criteria bids, 2-of-3 FCC award, public settlement |
| XRP Treasury setup | PersonalAccount, nonce, user-op hash, XRPL memo, FDC proof, direct mint/fund checkpoints |
| Tender builder | Public weights/bounds/issuers, quote currencies, FTestXRP ceiling, FTSO policy, fixed TEE set |
| Vendor bid room | Session-only fields, three verified keys, private ingress, per-machine receipts, common quorum |
| Public tender | Commitments/bitmaps/root, no payload links, close/FTSO/result readiness |
| Activity/recovery | Canonical checkpoints, competing relay safety, explicit dependency failures, no mock success |
| Award/evidence | Two recovered signers, exact digest binding, FTSO snapshot, payout/remainder, receipt, redemption path |

The `1-of-1` feasibility UI, generic-token settlement, simulated TEE, and direct
EVM buyer path must carry visible development/recovery labels and cannot be used
as the championship hero or primary demo.

## 14. CSS custom properties

```css
:root {
  /* Colors */
  --color-veil-green: #ff8a1f;
  --color-ink-black: #000000;
  --color-paper-white: #ffffff;
  --color-ink-72: rgba(0, 0, 0, 0.72);
  --color-ink-12: rgba(0, 0, 0, 0.12);
  --color-veil-halo: rgba(255, 138, 31, 0.5);

  /* Font families */
  --font-display: "GT Alpina Condensed", "Cormorant Garamond",
    "EB Garamond", Georgia, serif;
  --font-ui: "Barlow Condensed", "Arial Narrow", Arial, sans-serif;
  --font-mono: "Space Mono", "IBM Plex Mono", "JetBrains Mono", monospace;

  /* Type */
  --text-caption: 0.75rem;
  --text-body-sm: 0.875rem;
  --text-body: 1rem;
  --text-body-lg: 1.125rem;
  --text-subheading: clamp(1.625rem, 3vw, 2rem);
  --text-heading-sm: clamp(2.25rem, 5vw, 3rem);
  --text-heading: clamp(3rem, 8vw, 5rem);
  --text-heading-lg: clamp(4rem, 11vw, 7.5rem);
  --text-display: clamp(4.5rem, 15vw, 11.375rem);

  /* Space */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-10: 2.5rem;
  --space-12: 3rem;
  --space-15: 3.75rem;
  --space-16: 4rem;
  --space-20: 5rem;
  --space-30: 7.5rem;
  --space-35: 8.75rem;

  /* Shape and layout */
  --radius-card: 25px;
  --radius-control: 7px;
  --radius-input: 4px;
  --radius-status: 0;
  --radius-pill: 100px;
  --page-max: 1200px;
  --section-gap: 80px;
  --card-padding: 32px;
  --border-structural: 1px solid var(--color-ink-black);
  --halo-verified: 0 0 40px 10px var(--color-veil-halo);
}
```

## 15. Agent prompt guide

### Global prompt

> Build a FlareQuorum interface using only `#ff8a1f`, `#000000`, and `#ffffff`.
> Use Cormorant Garamond 300 for sparse display moments, Barlow Condensed for
> operational UI, and Space Mono for privacy/evidence metadata. Cards use 25px
> corners, action buttons 7px, editable fields 4px, status labels square, and
> role pills 100px. Structural borders are 1px, action/input borders are 2px,
> and there are no shadows or gradients. Show Public, Encrypted in
> Transit, Sealed in TEE, Authorized, Pending, and Proof Ready states with text
> and icons. Preserve the distinction between connected wallet, XRP treasury,
> Flare Smart Account, buyer, vendor, finalizer, each registered TEE, common
> quorum, and auditor.

### Tender explorer prompt

> Create a wallet-free tender explorer with a four-column dossier list and
> eight-column detail canvas at desktop, collapsing to one column on mobile.
> Tender cards show public ceiling, deadline, buyer/treasury, bid count, lifecycle,
> and privacy badges. The selected card uses a Veil Green edge marker, never a
> shadow.

### Bid composer prompt

> Create a sealed-dossier bid composer for XRP/USD price, delivery, warranty,
> and supported credentials. Show three verified TEE fingerprints, private
> ingress, per-machine receipt progress, commitment, and common quorum. Use a
> orange `SEND PRIVATELY & SUBMIT RECEIPTS` pill. Do not place plaintext or
> ciphertext in URL, activity, analytics, calldata, or completed-state copy.

### Winner panel prompt

> Create a full-bleed black award panel with mono eyebrow `TEE-SIGNED RESULT /
> PUBLIC SETTLEMENT`, a thin serif `AWARDED` headline, public winner identity, result
> and receipt evidence, and a clearly public winning-settlement amount. Losing
> bid prices remain sealed/private. Show the two matching TEE signers and frozen
> FTSO snapshot. A single orange halo may sit behind the award seal.

### XRP treasury header prompt

> Create a flat XRP treasury custody panel with buyer or Flare Smart Account
> address, authorization mode, nonce, user-operation hash, XRPL memo, FDC proof,
> direct mint, FTestXRP/FXRP balance, escrow, and redemption readiness. Include
> the exact message `THE TREASURY OWNS THE FUNDS.
> THE TEE SELECTS; THE CONTRACT SETTLES.` Use no dashboard sidebar and no
> decorative elevation.

### Proof inspector prompt

> Create a white flat proof inspector using Space Mono for chain ID, block,
> contract, transaction, extension ID, code version, three machine fingerprints,
> common quorum, rule hash, bid root, FTSO snapshot, two result signers, result
> digest, verification result, settlement, and receipt. Include the public
> XRPL/FDC/Smart Account trail. Never expose TEE secrets, private-wallet
> signatures, credentials, encrypted payloads, or confidential plaintext.
