# VeilBid Flare

> Confidential procurement for XRP and Flare treasuries, powered by Flare
> Confidential Compute.

VeilBid Flare is the next edition of VeilBid. XRP-native buyers atomically mint
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
> The Flare edition is currently in planning and feasibility validation. No
> Coston2 release address or successful FCC lifecycle is claimed yet.

> [!WARNING]
> This repository contains unaudited hackathon software. Use disposable testnet
> wallets and assets only.

## Why VeilBid

Public procurement leaks commercial information. A vendor that can see earlier
offers may copy, undercut, or coordinate around them. A private server hides the
offers but gives buyers and vendors weak assurance that the published winner
was actually produced by the agreed rule.

VeilBid Flare combines:

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
| Flare Confidential Compute | Private bid intake, sealed state, multi-criteria scoring, and threshold-signed result | Planned, mandatory |
| Coston2 smart contracts | Canonical tender, escrow, result verification, and settlement state | Planned, mandatory |
| FAssets / FTestXRP / FXRP | XRP-backed mint, tender escrow, vendor payout, and redemption | Planned, mandatory |
| Flare Data Connector | Prove the XRPL payment that authorizes Smart Account mint-and-fund | Planned, mandatory |
| FTSOv2 | Freeze XRP/USD close snapshot for XRP/USD bid normalization | Planned, mandatory |
| Flare Smart Accounts | Atomically mint FXRP and create/fund tender from an XRPL instruction | Planned, mandatory |
| Multi-TEE threshold | Fixed three-machine bid custody and two matching selection results | Planned championship gate |

Every integration must be exercised by the single flagship product journey and
recorded in evidence.
Displaying a feed, accepting an arbitrary token, or merely changing RPC does not
count as a completed integration.

## What existed before Summer Signal

VeilBid previously shipped a verified Ethereum Sepolia release for the iExec
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
[Build Plan](docs/build-plan.md).

## Current usable baseline

The checked-in application still runs against the historical Sepolia release
until the Coston2 bindings and Flare runtime are implemented:

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @veilbid/tender-room dev --host 0.0.0.0
```

Do not present this command as a Flare demo. The Flare judge path will be added
only after a verified Coston2 release exists.

## Documentation

- [Original Hackathon Brief](docs/original.md)
- [Competition Requirements and Judging Map](docs/hackathon-brief.md)
- [User Guide](docs/user-guide.md)
- [Championship Execution Plan](PLAN.md)
- [Architecture Decisions](docs/architecture-decisions.md)
- [Product Plan](docs/product-plan.md)
- [Feasibility Plan](docs/feasibility-plan.md)
- [Build Plan](docs/build-plan.md)
- [Architecture](docs/architecture.md)
- [Contract Specification](docs/contract-spec.md)
- [Threat Model](docs/threat-model.md)
- [Deployment](docs/deployment.md)
- [Verification](docs/verification.md)
- [Repository Layout](docs/repository-layout.md)
- [Security Policy](SECURITY.md)
