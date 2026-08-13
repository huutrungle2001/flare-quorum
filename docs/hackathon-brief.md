# Flare Summer Signal — FlareQuorum Competition Brief

> Derived from the project-owner-supplied
> [`original/hackathon-brief.md`](original/hackathon-brief.md). This file converts the supplied competition text
> into release requirements. Dates and prize figures are retained for reference,
> but the engineering plan is gate-driven and does not depend on the deadline.

## 1. Competition fit

Flare Summer Signal accepts products built from scratch, existing projects, and
ports to Flare. FlareQuorum is an existing confidential-procurement product being
substantively rebuilt for Flare rather than merely changing its network.

The supplied brief defines two bounties:

| Bounty | Supplied prize pool | FlareQuorum strategy |
|---|---:|---|
| Interoperable Asset Products | $6,000 | Enter only after the XRP → FDC/Smart Account → FAssets escrow → award → redemption lifecycle passes |
| Confidential Compute Apps | $6,000 | Primary bounty; FCC private intake and winner computation are mandatory |

Each supplied bounty lists first place at `$4,000` and second place at `$2,000`.
Prize information is planning context, not a repository release fact.

## 2. Supplied timeline

| Milestone | Date in original brief |
|---|---|
| Registration and development open | June 29 |
| Final submission | August 14 |
| Judging | August 15–21 |
| Winner ceremony | August 24 |

Per project direction, these dates do not control engineering scope or quality
gates. Before any external submission, confirm the current schedule through the
organizer channel.

## 3. Required submission package

| Supplied requirement | FlareQuorum authority | Release condition |
|---|---|---|
| Project name | `README.md`, `docs/product-plan.md` | Exact name agrees everywhere |
| Selected bounty/bounties | `README.md`, `PLAN.md` | Primary FCC; interoperability only after its evidence gate passes |
| Short description | `README.md`, final submission material | Explains user problem and result in plain language |
| Target user | `docs/product-plan.md` | XRP treasuries, Flare treasury teams, and vendors are explicit |
| Demo/video/app | `PLAN.md` Phase 8 | Live Coston2 app, wallet-free tender, and four-minute video |
| GitHub/technical material | Repository and canonical docs | Judge-friendly source, setup, architecture, security, and verification |
| Meaningful Flare usage | Architecture and release evidence | FCC, FAssets, FDC, FTSO, and Smart Accounts form one flagship journey |
| New/ported/integrated/improved work | `docs/verification.md` new-work ledger | Commit- and evidence-backed separation from Sepolia/Nox baseline |
| Contract/deployment details | Verified Coston2 manifest | Addresses, extension/code/machines, transactions, and source/runtime mapping |
| Roadmap/next steps | `PLAN.md` and final submission | Credible audit, liveness, mainnet, and pilot work only |

## 4. Encouraged product-distribution evidence

The supplied brief encourages deployment network, acquisition, distribution,
testing, feedback, usage, community interest, pilots, and partner conversations.
For the Summer Signal submission, FlareQuorum requires:

- an explicit Coston2/Songbird/Flare deployment statement;
- a recorded owner-operated end-to-end acceptance run of the deployed website;
- a record of community/Telegram technical feedback;
- no invented usage, traction, partnership, or acquisition claim.

Five structured XRP/treasury interviews, five vendor usability sessions, and
one honest pilot/design-partner attempt remain the post-Summer Signal product-
validation plan. Their zero-session state is disclosed rather than treated as
a technical submission blocker. Gate H in `docs/verification.md` tracks the
pre-submission website acceptance; `PLAN.md` Phase 7 tracks later external
validation.

## 5. Existing-project disclosure

The final submission must keep four categories separate:

| Category | FlareQuorum example |
|---|---|
| Existed before Summer Signal | Sepolia/Nox/Safe/ERC-7984 contracts, app, relay, bindings, and evidence |
| Newly built | FCC Go extension, private ingress, TEE receipts/quorum, Flare market, and Flare bindings |
| Ported | Public explorer, role-based UI shell, stateless recovery patterns |
| Integrated or improved | FAssets/FDC/FTSO/Smart Accounts, multi-criteria scoring, threshold agreement, and hardened domains |

Every final statement must link to commits, Coston2 evidence, or the historical
release authority. Reusing an old product is permitted; presenting old work as
new Flare work is not.

## 6. Judging criteria translated into product gates

### Product usefulness

FlareQuorum must solve the concrete problem of confidential vendor competition for
XRP/Flare treasuries, demonstrate complete buyer/vendor journeys, and record
real feedback. A protocol-only script does not pass.

### Flare integration quality

FCC must hold and evaluate private bid state in the settlement path. FAssets,
FDC, FTSO, and Smart Accounts must be necessary to the same XRP-native funding,
scoring, settlement, and redemption story. Decorative protocol calls do not
pass.

### Technical execution

The Coston2 demo, contracts, extension, private ingress, threshold result,
settlement, relay recovery, generated bindings, and wallet-free evidence must
work without mocks. Architecture and residual trust must be understandable.

### Evidence of new work

The new-work ledger must map pre-existing, newly built, ported, integrated, and
improved work to commits, deployments, and sanitized evidence.

### Clarity and future potential

A judge should understand the product in 30 seconds, verify the Flare path in
two minutes, and reproduce the public lifecycle from the repository. The
roadmap must describe credible audit, liveness, pilot, and mainnet work without
claiming those outcomes already exist. Roadmap items may support future-
potential scoring. The verified, consumer-selected V2 manifest and its
promotion evidence define the delivered Coston2 implementation; V1 remains
historical rollback evidence. Post-Summer hardening and product-expansion work
remain roadmap items rather than current acceptance gates.

## 7. Submission readiness checklist

- [x] Project name and bounty selection are consistent in the Flare judge package.
- [x] Product description and target users are understandable without protocol
  knowledge.
- [x] Live app, wallet-free demo, public evidence links, and the checked-in
  captioned demo video work; remaining user-validation evidence is tracked in
  `PLAN.md` Phase 7.
- [x] GitHub repository and technical materials are accessible to judges.
- [x] Every Flare integration is explained by user value and live evidence.
- [x] Existing/new/ported/integrated/improved work is separated in
  `submission/flarequorum/NEW-WORK-LEDGER.md`.
- [x] Verified addresses, extension ID, code/image version, machine identities,
  transactions, and deployment network are included.
- [x] Owner-operated website acceptance is recorded, while external user
  testing, community interest, pilots, and traction remain honestly unclaimed.
- [x] Roadmap and next steps do not exceed the threat model or evidence.

The checklist remains incomplete until the corresponding rows in
[`verification.md`](verification.md) pass.

## 8. Supplied organizer links

- [Flare Hackathon Telegram group](https://t.me/+5Vn6ZKhr6KI3NjIx)
- [Flare developer materials](https://dev.flare.network/)

Use the Telegram group to confirm organizer-specific access, current dates,
submission mechanics, FCC infrastructure, and judge-environment questions.
