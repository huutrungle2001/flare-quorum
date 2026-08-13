# FlareQuorum

> Confidential procurement for XRP and Flare treasuries, powered by Flare
> Confidential Compute.

FlareQuorum is the Flare-native successor to the historical predecessor baseline. XRP-native buyers atomically mint
FXRP and fund a tender; approved vendors privately deliver encrypted
multi-criteria offers to a fixed Flare TEE quorum; and a Flare smart contract
settles only after two registered TEE identities agree on the same deterministic
result.

The project targets **Flare Summer Signal** with:

- **Primary bounty:** Confidential Compute Apps.
- **Secondary bounty target:** Interoperable Asset Products through a real
  XRP/FDC/Smart Account/FAssets funding and redemption lifecycle.
- **Development network:** Flare Testnet Coston2 (`114`).
- **Target settlement asset:** FTestXRP on Coston2 and FXRP on Flare Mainnet.

> [!IMPORTANT]
> Phase 0 feasibility validation is complete for the live Coston2 core path:
> the registered FCC market, three-machine private bid lifecycle, FTSO-bound
> scoring, FTestXRP settlement, and XRPL/FDC/Smart Account funding are recorded
> in public-safe evidence. Same-identity restoration is unsupported by design;
> the organizer-approved replacement registration model has passed a full
> three-machine rolling Coston2 drill, while the final user-validation gate
> remains open.

> [!IMPORTANT]
> `FlareQuorumMarketV2` is the current consumer-selected Coston2 release. Its
> bounded pre-dispatch and post-dispatch refund paths, refreshed three-machine
> runtime, three-vendor success lifecycle, one-result-endpoint outage recovery,
> credential rejection/retry, runtime bytecode, constructor wiring, and exact
> active machine set all pass live verification. V1 is preserved only as a
> historical Coston2 release artifact.

> [!NOTE]
> **Judging boundary:** V2 is the verified consumer-selected release. Its
> promotion artifact, canonical manifest, bindings, and refreshed evidence are
> distinct from the preserved V1 and historical Sepolia/Nox artifacts.

> [!WARNING]
> This repository contains unaudited hackathon software. Use disposable testnet
> wallets and assets only.

> [!NOTE]
> FlareQuorum is the current product and repository brand. Existing `VeilBid*`
> Solidity identifiers, verified Coston2 deployment artifacts, and the
> Sepolia/Nox source baseline retain their original names so the rebrand never
> rewrites historical or on-chain evidence. The legacy `/room` URL redirects to
> the canonical Coston2 app; historical Sepolia behavior remains reproducible
> only from its isolated packages/evidence. Newer contracts use the FlareQuorum
> name without relabeling immutable V1 facts.

## Why FlareQuorum

Public procurement leaks commercial information. A vendor that can see earlier
offers may copy, undercut, or coordinate around them. A private server hides the
offers but gives buyers and vendors weak assurance that the published winner
was actually produced by the agreed rule.

FlareQuorum combines:

- Public tender rules, deadlines, vendor admission, escrow, and lifecycle.
- Private ECIES bid ingress with no permanent on-chain ciphertext.
- Threshold TEE-signed bid receipts and a public ordered commitment root.
- Deterministic private credential, price, delivery, and warranty scoring.
- A signed result bound to the chain, market, tender, bid root, rule hash, close
  checkpoint, and replay nonce.
- On-chain verification and permissionless finalization.
- FTSO-bound XRP/USD normalization and FTestXRP/FXRP settlement.
- XRP-native mint-and-fund through Flare Smart Accounts and FDC.
- Official FXRP redemption path back to native XRP.
- A public evidence trail without plaintext losing bids or private credentials.

## Target lifecycle

```text
XRPL payment commits an approval + create/fund Smart Account operation
                    |
FDC proves payment; FAssets mints FXRP and funds tender atomically
                    |
Vendors privately submit encrypted offers to three fixed TEE machines
                    |
Threshold TEE receipts form the public ordered bid root
                    |
Close captures XRP/USD FTSO snapshot
                    |
TEEs validate credentials, score terms, and sign one result digest
                    |
Contract verifies 2-of-3 agreement and settles FTestXRP/FXRP
                    |
Winner may redeem FXRP to native XRP
```

## Privacy boundary

Private by design:

- Losing bid prices, commercial terms, credentials, and encrypted payloads.
- Vendor qualification inputs submitted for confidential scoring.
- Intermediate eligibility, normalization, and comparison results.
- TEE decryption keys and plaintext working state.

Public by design:

- Tender metadata, buyer, approved vendor addresses, deadline, rule hash, and
  public ceiling.
- Bidder participation, salted commitments, TEE receipt signatures, timing, and
  transaction hashes.
- TEE extension identity, code/version identifiers, signed result envelope, and
  lifecycle evidence.
- Winner and winning settlement amount when ordinary FXRP/FTestXRP is paid.

The initial Flare edition does **not** claim confidential ERC-20 settlement.
Ordinary token transfers disclose their amount. A future TEE-backed private
accounting layer is research scope and must not be described as shipped.

## Meaningful Flare integration

| Flare capability | Product role | Delivery status |
|---|---|---|
| Flare Confidential Compute | Private bid intake, sealed state, multi-criteria scoring, and threshold-signed result | Live core lifecycle and supported three-machine replacement recovery passed |
| Coston2 smart contracts | Canonical tender, escrow, result verification, and settlement state | Verified release manifest and live deployment consistency evidence |
| FAssets / FTestXRP / FXRP | XRP-backed mint, tender escrow, vendor payout, and redemption | Live FTestXRP escrow/direct mint and official redemption-request boundary passed; the underlying agent payout remains an external FAssets obligation |
| Flare Data Connector | Prove the XRPL payment that authorizes Smart Account mint-and-fund | Live `XRPPayment` proof recorded in Gate G evidence |
| FTSOv2 | Freeze XRP/USD close snapshot for XRP/USD bid normalization | Live close snapshot is bound to the FCC result and settlement |
| Flare Smart Accounts | Atomically mint FXRP and create/fund tender from an XRPL instruction | Live `0xFE` direct-mint-and-fund lifecycle passed |
| Multi-TEE threshold | Fixed three-machine bid custody and two matching selection results | Live three-bid common quorum, two-signature result, one-result outage, and rolling replacement passed; simultaneous two-machine loss remains fail-closed |

Every integration must be exercised by the single flagship product journey and
recorded in evidence.
Displaying a feed, accepting an arbitrary token, or merely changing RPC does not
count as a completed integration.

## What existed before Summer Signal

The historical predecessor previously shipped a verified Ethereum Sepolia release for the iExec
Nox hackathon. That baseline includes Safe treasury funding, Nox encrypted
argmin selection, ERC-7984 confidential settlement, a web application, a
stateless relay, generated bindings, and sanitized evidence.

The historical release remains reproducible at:

- `packages/contracts/deployments/sepolia.release.json`
- `packages/chain-bindings/generated/`
- `evidence/sepolia/`

Those artifacts are **pre-hackathon baseline evidence**, not proof of Flare
integration. The new work ledger and Coston2 evidence must identify everything
built, ported, or improved for Summer Signal.

## Target repository structure

```text
apps/
  web/                 # shared product UI, migrated to Coston2
  relay/               # permissionless close/result/finalize automation
  console/             # read-only public inspection tools
  fcc-extension/       # new TEE extension and proxy integration
packages/
  flare-contracts/     # new Coston2/Flare contracts and tests
  flare-bindings/      # generated Flare ABI/address/event bindings
  contracts/           # retained Sepolia/Nox baseline
  chain-bindings/      # retained Sepolia/Nox baseline bindings
evidence/
  coston2/             # new sanitized Flare evidence
  sepolia/             # historical pre-hackathon evidence
docs/
```

Directories marked as new targets do not exist until their feasibility gates
pass. See the [Championship Plan](PLAN.md),
[Architecture Decisions](docs/architecture-decisions.md),
[Product Plan](docs/product-plan.md),
[Feasibility Plan](docs/feasibility-plan.md), and
[Verification Plan](docs/verification.md).

## Verified Coston2 judge path

The browser uses the verified Coston2 public route when the four sanitized
`VITE_*` values below are supplied. `/room` redirects to `/flare`; the isolated
Sepolia/Nox packages and evidence remain historical baseline only and must not
be used as Flare evidence:

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @flarequorum/tender-room dev --host 0.0.0.0
```

Open `/` or `/flare` for the wallet-free Coston2 evidence view. If the verified
public configuration is missing, the app fails closed and does not substitute
Sepolia or mock state.

Verified public release facts:

- Market: `0xE1252D445ee86ED78C1da2bD5f1bF4a69bF476AC` (deployment block
  `33919464`).
- Award receipt: `0xA0249F4204503dcB9FE3A3153d7D48936E7a4Ac3`.
- Extension `66142`, code hash
  `0x194844cf417dde867073e5ab7199fa4d21fd82b5dbe2bdea8b3d7fc18d10fdc2`.
- Canonical manifest: `packages/flare-contracts/deployments/coston2.release.json`.
- Preserved V1 manifest: `packages/flare-contracts/deployments/coston2.v1.release.json`.

## Documentation

- [Original Source Materials](docs/original/README.md)
- [Competition Requirements and Judging Map](docs/hackathon-brief.md)
- [FCC Coston2 Operational Baseline](docs/fcc-coston2-operations.md)
- [User Guide](docs/user-guide.md)
- [Championship Execution Plan](PLAN.md)
- [Architecture Decisions](docs/architecture-decisions.md)
- [Product Plan](docs/product-plan.md)
- [Feasibility Plan](docs/feasibility-plan.md)
- [Architecture](docs/architecture.md)
- [Contract Specification](docs/contract-spec.md)
- [Threat Model](docs/threat-model.md)
- [Deployment](docs/deployment.md)
- [Verification](docs/verification.md)
- [Security Policy](SECURITY.md)
