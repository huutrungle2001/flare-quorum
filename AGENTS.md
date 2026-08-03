# VeilBid Flare — Agent and Contributor Guide

## 1. Objective

This repository is porting VeilBid to Flare for Summer Signal. Preserve the
product claim while changing the confidential-compute implementation:

- buyers create transparent procurement rules and escrow a real testnet asset;
- approved vendors submit encrypted bids;
- Flare Confidential Compute performs eligibility, comparison, and selection in
  the settlement path;
- the market accepts only a result signed by a registered TEE identity; and
- public evidence proves the result binding without exposing losing bids.

The primary target is the Confidential Compute Apps bounty. Interoperable Asset
Products becomes a submission target only after a substantive FAssets/FXRP
mint, escrow, payout, or redemption lifecycle passes on Coston2.

The verified Ethereum Sepolia/Nox release is historical pre-hackathon baseline.
Never relabel its addresses, tests, evidence, or UI as a Flare implementation.

## 2. Onboarding

Read these files before making changes:

1. `README.md`
2. `docs/user-guide.md`
3. `docs/deployment.md`
4. `docs/product-plan.md`
5. `docs/feasibility-plan.md`
6. `docs/build-plan.md`
7. `docs/architecture.md`
8. `docs/contract-spec.md`
9. `docs/threat-model.md`
10. `docs/verification.md`
11. `docs/repository-layout.md`
12. `DESIGNS.md` for user-interface changes.

## 3. Source priority

Use this priority for Flare release facts once the artifacts exist:

1. `packages/flare-contracts/deployments/coston2.release.json`.
2. Generated bindings under `packages/flare-bindings/generated/`.
3. Sanitized Coston2 evidence under `evidence/coston2/`.
4. Flare production source and tests.
5. Canonical product, architecture, security, and verification documentation.
6. README summaries.
7. Agent inference.

Until a verified Coston2 release exists, documentation must say `planned`,
`target`, or `not yet verified`. Historical Sepolia facts remain authoritative
only for the baseline release manifest and its generated bindings/evidence.

## 4. Architecture invariants

- FCC must perform winner eligibility, comparison, and selection in the real
  finalization path.
- Never branch on a client-provided winner or maintain a plaintext shadow bid
  ledger outside the TEE.
- Vendor plaintext must not appear in calldata, events, proxy logs, evidence,
  browser persistence, or public result payloads.
- Encrypted bid payloads must be bound to chain, market, tender, vendor, rules,
  and a one-time submission nonce.
- Signed results must be bound to chain ID, market, extension ID, tender ID,
  rules hash, bid root, close checkpoint, result nonce, and expiry.
- The contract verifies that the signer is a registered, approved TEE identity
  for the intended extension and code version.
- Ordinary FXRP/FTestXRP settlement amounts are public. Do not claim private
  token settlement without a separately verified mechanism.
- FTSO, FDC, FAssets, and Smart Accounts count only when exercised by an actual
  user flow and tested on the supported Flare network.
- No success fallback may use mock winners, bids, TEE results, prices,
  attestations, or chain state when FCC, RPC, proxy, FDC, or indexing fails.
- Finalizers and inspection clients receive no bid-decryption capability.
- Private reveal and audit access must be explicit, scoped, and documented.

## 5. Repository boundaries

- `apps/fcc-extension/`: new confidential extension code and integration.
- `packages/flare-contracts/`: new Coston2/Flare contracts, deployment, tests,
  and verification.
- `packages/flare-bindings/`: generated Flare consumer bindings.
- `apps/web/`, `apps/relay/`, and `apps/console/`: migrated consumers.
- `packages/contracts/`, `packages/chain-bindings/`, and `evidence/sepolia/`:
  retained pre-hackathon Sepolia/Nox baseline.
- `evidence/coston2/`: public-safe Flare evidence only.

Do not mix Nox production artifacts into a Flare deployment or use historical
Sepolia evidence to satisfy a Coston2 acceptance criterion.

## 6. Change rules

- Use official Flare documentation, contract registries, periphery packages,
  FCC scaffold/examples, and supported networks.
- Do not reuse another project's deployments, extensions, credentials,
  evidence, branding, or submission material.
- Do not expose private keys, TEE keys, plaintext bids, encrypted payloads,
  proxy/indexer credentials, wallet signatures, or confidential result data.
- Do not claim anonymous bidders, secret public metadata, private ERC-20
  transfers, verified delivery, production security, or formal auditing.
- Record what existed before Summer Signal and what was newly built during it.
- Update canonical docs when architecture, privacy, deployment, verification,
  or selected-bounty status changes.
- After completing and validating a requested change, create one or more small,
  logically scoped Git commits unless the user explicitly requests otherwise.

## 7. Validation

Checks are proportional to the change. Documentation-only changes require a
focused diff, link/reference check, and secret scan. Release-facing code changes
require:

```bash
npm test
npm run lint
npm run build
```

FCC or Flare contract changes also require the feasibility, Coston2 E2E,
deployment-verification, extension code-hash, signature-binding, and evidence
commands defined during implementation.

Live evidence may contain public addresses, extension IDs, code hashes,
transactions, blocks, statuses, result commitments, and assertion booleans. It
must never contain plaintext losing bids, private qualification inputs,
decryption keys, encrypted payloads, raw signatures where policy forbids them,
credentials, or wallet secrets.

## 8. Phase gates

- Do not start full Flare product development until feasibility Gates A–E in
  `docs/feasibility-plan.md` pass.
- Do not claim the Confidential Compute bounty integration until a registered
  FCC extension drives a verified Coston2 finalization.
- Do not select the Interoperable Asset Products bounty until a real FAssets
  lifecycle is essential to the demonstrated user journey.
- Do not call a feature complete without the evidence required by
  `docs/verification.md`.
- Do not mark a deployment verified until runtime bytecode, constructor/wiring,
  extension identity/code version, and result-signature mapping are checked.
- Do not publish claims that exceed `docs/threat-model.md`.
