# Security Policy

VeilBid is unaudited hackathon software. Do not use it with production keys,
valuable funds, or operational procurement.

## Supported scope

The repository is transitioning to a Flare/Coston2 edition. No Flare release is
supported until `packages/flare-contracts/deployments/coston2.release.json`
exists and is marked verified with matching bindings and evidence.

The existing verified Ethereum Sepolia release remains a historical
pre-hackathon baseline recorded in
`packages/contracts/deployments/sepolia.release.json`. It is testnet-only and
does not establish the security of the planned FCC implementation.

## Reporting

Report suspected vulnerabilities privately through GitHub's security-advisory
workflow. Do not open a public issue containing:

- wallet, TEE, XRPL, proxy, indexer, RPC, or tunnel credentials;
- plaintext bids, private qualification material, or decrypted TEE state;
- ECIES secrets or full encrypted payloads tied to live test actors;
- wallet signatures, seed material, or exploit instructions against active
  test infrastructure before maintainers can contain it.

Include the affected commit/component, network and chain ID, public transaction
or extension identifier when safe, reproduction steps, and expected impact.
Use disposable testnet identities only.

## Flare threat boundary

The planned FCC release trusts the configured Flare registries/relayers, proxy,
TEE attestation and identity, code-version governance, extension code, and
hardware/runtime for confidential and correct private execution. The contract
verifies a signed result and its public binding; it does not receive a
zero-knowledge proof of the private computation.

Ordinary FTestXRP/FXRP settlement amounts are public. Bidder identity,
participation, timing, metadata, ciphertext existence, final winner, and
transaction graph are also public.

Full objectives, threats, compromise impact, and residual risk are documented
in [`docs/threat-model.md`](docs/threat-model.md).

## Evidence policy

Committed evidence contains public identifiers and allowlisted assertions only.
Private diagnostic output belongs under ignored local paths. Current and
full-history secret scans are required before a release or public repository
promotion.
