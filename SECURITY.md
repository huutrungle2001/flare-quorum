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
- ECIES secrets, ephemeral encrypted ingress payloads, or signed credentials
  tied to live test actors;
- wallet signatures, seed material, or exploit instructions against active
  test infrastructure before maintainers can contain it.

Include the affected commit/component, network and chain ID, public transaction
or extension identifier when safe, reproduction steps, and expected impact.
Use disposable testnet identities only.

## Flare threat boundary

The planned FCC release sends bid ciphertext only through authenticated private
ingress and stores only sealed state inside the confidential runtime. Plaintext
and ciphertext are forbidden from calldata, events, public logs, and evidence.
The chain stores signed receipts, salted commitments, a common quorum bitmap,
and an ordered root.

The release trusts configured Flare registries/relayers, proxy routing, TEE
attestation/identity, code-version governance, extension code, and
hardware/runtime. It targets three fixed machines and requires two matching
results. This reduces a single-machine failure but does not remove correlated
TEE/runtime/code risk or provide a zero-knowledge proof.

Ordinary FTestXRP/FXRP settlement amounts are public. Bidder identity,
participation, timing, traffic metadata, commitments, final winner, FTSO
snapshot, XRPL/Flare funding trail, and transaction graph are also public.

The XRP-native path additionally depends on official FAssets, FDC, FTSO, and
Smart Account behavior. VeilBid never takes an XRPL secret or allows an admin,
relay, browser, buyer, or single TEE to override a frozen winner computation.

Full objectives, threats, compromise impact, and residual risk are documented
in [`docs/threat-model.md`](docs/threat-model.md).

## Evidence policy

Committed evidence contains public identifiers and allowlisted assertions only.
It excludes bid plaintext/ciphertext, credentials, salts, sealed state, ingress
bodies/headers, and raw provider responses. Private diagnostic output belongs
under ignored local paths. Current-tree, full-history, runtime-log, and evidence
privacy scans are required before a release or public repository promotion.
