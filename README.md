# VeilBid Flare

> Confidential procurement for XRP and Flare treasuries, powered by Flare
> Confidential Compute.

VeilBid Flare is the next edition of VeilBid. Buyers publish transparent tender
rules and escrow an award budget; approved vendors submit encrypted commercial
offers; a Flare Compute Extension evaluates the bids inside a Trusted Execution
Environment (TEE); and a Flare smart contract accepts only a result signed by a
registered TEE identity.

The project targets **Flare Summer Signal** with:

- **Primary bounty:** Confidential Compute Apps.
- **Secondary bounty:** Interoperable Asset Products, only after a real
  FAssets/FXRP lifecycle is implemented and verified.
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
- ECIES-encrypted bid packages that are readable only inside the selected TEE.
- Deterministic private eligibility and scoring in a Flare Compute Extension.
- A signed result bound to the chain, market, tender, bid root, rule hash, close
  checkpoint, and replay nonce.
- On-chain verification and permissionless finalization.
- FXRP/FTestXRP escrow and optional redemption to native XRP.
- A public evidence trail without plaintext losing bids or private credentials.

## Target lifecycle

```text
Buyer creates tender and escrows FTestXRP/FXRP
                    |
Approved vendors encrypt bid packages to the TEE public key
                    |
Flare contract records ciphertext commitments and closes bidding
                    |
FCC extension decrypts, validates, scores, and signs the minimum result
                    |
Anyone submits the signed result to the market
                    |
Contract verifies the registered TEE identity and finalizes settlement
                    |
Winner receives FTestXRP/FXRP and may redeem FXRP to native XRP
```

## Privacy boundary

Private by design:

- Losing bid prices and commercial terms.
- Vendor qualification inputs submitted for confidential scoring.
- Intermediate eligibility, normalization, and comparison results.
- TEE decryption keys and plaintext working state.

Public by design:

- Tender metadata, buyer, approved vendor addresses, deadline, rule hash, and
  public ceiling.
- Bidder participation, ciphertext commitments, timing, and transaction hashes.
- TEE extension identity, code/version identifiers, signed result envelope, and
  lifecycle evidence.
- Winner and winning settlement amount when ordinary FXRP/FTestXRP is paid.

The initial Flare edition does **not** claim confidential ERC-20 settlement.
Ordinary token transfers disclose their amount. A future TEE-backed private
accounting layer is research scope and must not be described as shipped.

## Meaningful Flare integration

| Flare capability | Product role | Delivery status |
|---|---|---|
| Flare Confidential Compute | Decrypt, validate, score, and sign the winner result inside a TEE | Planned, mandatory |
| Coston2 smart contracts | Canonical tender, escrow, result verification, and settlement state | Planned, mandatory |
| FAssets / FTestXRP / FXRP | XRP-backed tender escrow, vendor payout, and redemption path | Planned after FCC core |
| Flare Data Connector | Verify external XRP payment or delivery/milestone evidence | Planned extension |
| FTSOv2 | Snapshot prices for an approved multi-currency scoring rule | Optional extension |
| Flare Smart Accounts | Let XRPL-native users trigger Flare actions without managing FLR directly | Optional extension |

Every integration must be exercised by the product and recorded in evidence.
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
pass. See the [Product Plan](docs/product-plan.md),
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

- [User Guide](docs/user-guide.md)
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
