# VeilBid — Style Reference

> Cel-shaded confidential procurement terminal — sealed-envelope anime rendered
> as an institutional bidding interface.
>
> Status: Canonical visual, interaction, responsive, and privacy-language
> specification. The implemented app now defaults to the verified Coston2/FCC
> product; the historical Sepolia baseline remains available only as a clearly
> labeled, lazy-loaded comparison route.

**Theme:** mixed

VeilBid uses a monochromatic canvas with one neon-green signal. The atmosphere
comes from 90s anime title cards, confidential dossier stamps, sealed envelopes,
radar rings, and procurement-terminal typography—not from generic crypto
gradients or dashboard chrome.

The product must still behave like serious financial software. Display serif
type carries brand moments; condensed sans-serif carries navigation and actions;
monospace carries commitments, extension IDs, signatures, blocks, and timestamps. Surfaces remain
flat. Cards and controls use ink outlines, generous 25px corners, and no
elevation shadows. Neon green appears only when the interface is inviting an
action, marking a selected state, or confirming verified evidence.

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
| Veil Green | `#a1fea0` | `--color-veil-green` | Primary action, selected role/tender, verified proof, award spotlight, illustration accent |
| Ink Black | `#000000` | `--color-ink-black` | Text, borders, dark bands, destructive actions, encrypted-state fill |
| Paper White | `#ffffff` | `--color-paper-white` | Page canvas, cards, fields, text on dark surfaces |

No additional semantic colors are introduced. State must never rely on color
alone:

- Verified: green plus check icon and `VERIFIED`.
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
| Buttons and badges | 25px |
| Compact status pills | 25px |
| Full nav/role pills | 100px |
| Illustration circles | 100% |

Rules:

- Standard structural border: `1px solid #000`.
- Hovered actionable border: `2px solid #000` without changing outer size.
- Focus ring: `3px solid #a1fea0` plus a 1px black outer outline.
- No 4px, 8px, or 12px component radii.
- No card/button drop shadows.
- A green blurred halo is allowed only behind a verified winner/proof spotlight;
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
5. White/green lifecycle marquee.
6. Product explanation and live evidence.
7. Full-bleed black footer.

### Application

VeilBid does not use a permanent dashboard sidebar.

Desktop:

- Fixed horizontal product bar.
- Role switcher directly beneath the bar.
- Public explorer: four-column tender list plus eight-column detail canvas.
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

- `VEILBID` wordmark in Barlow Condensed 700.

Right:

- Coston2 network indicator.
- Wallet state.
- Black or green `ENTER TENDER ROOM` pill.

Social links belong in the footer, not the primary product navigation.

### Application role switcher

Role pills:

- `PUBLIC`
- `BUYER`
- `VENDOR`
- `AUDITOR`
- `XRP TREASURY`

The active role uses Veil Green with black text and a black border. Role changes
must not imply wallet permission. Unauthorized roles remain browsable where
public data exists, with writes hidden or disabled and explained.

`PUBLIC` includes permissionless close/finalize readiness and actions; it is the
Public Finalizer context from the Product Plan, not a separate privileged role.
Recoverable proof operations also appear in Activity.

## 7. Core components

### Primary pill button

- Veil Green fill.
- Ink Black text and 1px border.
- Barlow Condensed 500, 16px, uppercase, `0.1em`.
- Padding `10px 24px`.
- Radius `25px`.
- Hover changes border to 2px and uses a subtle black inset line; no shadow.

Examples:

- `CREATE TENDER`
- `SEND PRIVATELY & SUBMIT RECEIPTS`
- `FINALIZE AWARD`
- `REDEEM FXRP`

### Secondary pill button

- Paper White fill.
- Ink Black text and 1px border.
- Same typography and geometry as primary.
- Optional trailing arrow `→`.

Examples:

- `EXPLORE TENDERS →`
- `VIEW PROOF →`
- `OPEN IN EXPLORER →`

### Destructive pill button

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
| `PUBLIC` | White pill, black border, globe icon |
| `ENCRYPTED` | Black pill, white lock icon/text |
| `AUTHORIZED` | Green pill, black key icon/text |
| `PROOF READY` | Green pill, check icon, mono label |
| `PENDING` | White pill, black progress glyph |

Badges always include text.

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

Selected card uses a green edge marker or fill block—not a shadow.

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
- Current step: green.
- Completed steps: black with check.
- Future steps: white outline.
- On mobile it becomes a vertical timeline.

### Winner reveal panel

Full-bleed black or black card:

- Mono eyebrow: `TEE-SIGNED RESULT / PUBLIC SETTLEMENT`.
- Display serif: `AWARDED`.
- Public winner identity.
- Two TEE signers, quorum/result/transaction/receipt evidence.
- Receipt owner equals the winning vendor and the receipt is non-transferable.
- Winning settlement amount is public and explicitly labeled. Losing prices
  remain encrypted.
- One optional green glow halo behind the award seal.

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
aperture toward a green signed-result award stamp. Use flat cel-shaded forms, thick ink
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

- Ink Black on Veil Green is the only text combination allowed on green.
- Never use white body text on green or green body text on white.
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
- The interface supports 320px without horizontal page overflow.

## 11. Do

- Use only Veil Green, Ink Black, and Paper White.
- Use display serif sparingly for brand and award moments.
- Keep operational UI in Barlow Condensed and evidence in Space Mono.
- Pair green primary and white outlined secondary actions.
- Use 25px component corners and 100px role/nav pills.
- Give major landing sections at least 80px vertical separation.
- Explain privacy and authority next to every confidential transaction.
- Show public, encrypted, authorized, and proof-ready states explicitly.
- Use flat cel-shaded illustration to create atmosphere.

## 12. Do not

- Do not introduce red, blue, yellow, purple, or gray semantic tokens.
- Do not use green as body text or a full-page background.
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
  --color-veil-green: #a1fea0;
  --color-ink-black: #000000;
  --color-paper-white: #ffffff;
  --color-ink-72: rgba(0, 0, 0, 0.72);
  --color-ink-12: rgba(0, 0, 0, 0.12);
  --color-veil-halo: rgba(161, 254, 160, 0.5);

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
  --radius-control: 25px;
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

> Build a VeilBid interface using only `#a1fea0`, `#000000`, and `#ffffff`.
> Use Cormorant Garamond 300 for sparse display moments, Barlow Condensed for
> operational UI, and Space Mono for privacy/evidence metadata. All cards and
> buttons use 25px corners, role pills use 100px corners, structural borders are
> 1px black, and there are no shadows or gradients. Show Public, Encrypted in
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
> green `SEND PRIVATELY & SUBMIT RECEIPTS` pill. Do not place plaintext or
> ciphertext in URL, activity, analytics, calldata, or completed-state copy.

### Winner panel prompt

> Create a full-bleed black award panel with mono eyebrow `TEE-SIGNED RESULT /
> PUBLIC SETTLEMENT`, a thin serif `AWARDED` headline, public winner identity, result
> and receipt evidence, and a clearly public winning-settlement amount. Losing
> bid prices remain sealed/private. Show the two matching TEE signers and frozen
> FTSO snapshot. A single green halo may sit behind the award seal.

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
