# VeilBid Flare Deployment Guide

> Status: Transition guide. There is no canonical Coston2 release yet. Existing
> scripts deploy only the historical Sepolia/Nox baseline.

## 1. Release separation

Two deployment authorities must remain distinct:

| Release | Authority | Status |
|---|---|---|
| Historical Sepolia/Nox | `packages/contracts/deployments/sepolia.release.json` | Verified pre-hackathon baseline |
| New Coston2/FCC | `packages/flare-contracts/deployments/coston2.release.json` | Planned; file does not exist yet |

Never modify the Sepolia manifest to contain a Flare address and never publish a
Coston2 address through the historical chain bindings.

## 2. Planned prerequisites

- Node.js and pnpm versions pinned by the repository.
- Go and Docker versions pinned by the selected official FCC scaffold.
- Foundry or Hardhat according to the Flare contract workspace decision.
- A disposable Coston2 deployment wallet funded with C2FLR.
- Coston2 RPC access.
- FCC proxy/indexer access supplied through ignored local configuration.
- An HTTPS endpoint/tunnel for test proxy exposure where required.
- No mainnet or valuable XRPL keys.

The exact tool versions and environment names will be recorded by Gate A.

## 3. Planned local configuration

The Flare edition will use a separate ignored environment file or clearly
prefixed variables such as:

```dotenv
COSTON2_RPC_URL=https://coston2-api.flare.network/ext/C/rpc
FLARE_DEPLOYMENT_PRIVATE_KEY=0x...
FCC_PROXY_URL=https://...
FCC_INDEXER_HOST=...
FCC_INDEXER_USER=...
FCC_INDEXER_PASSWORD=...
```

Final variable names must follow the official scaffold selected during Gate A.
Do not expose secrets through `VITE_` variables, committed evidence, logs, or
shell history. Browser code receives only public network, contract, extension,
TEE identity, and encryption-key information intended for users.

## 4. Feasibility deployment

Before a production market exists:

1. Clone or vendor the required official FCC scaffold in
   `apps/fcc-extension/` with attribution and pinned upstream commit.
2. Configure Coston2 and compile the instruction-sender spike.
3. Deploy and register the extension.
4. Start the proxy/TEE stack.
5. Register the intended code version and TEE machine using the supported
   attestation flow.
6. Run Gates A–E and save sanitized evidence under `evidence/coston2/`.

Local simulated TEE success must be labeled simulated. A submission must state
whether its final judge path uses simulated or confidential hardware and what
the organizer's FCC environment supports.

## 5. Planned Coston2 release manifest

The canonical manifest will record at minimum:

```text
schemaVersion
network = flare-coston2
chainId = 114
kind = release
verified
sourceCommit
deployer
contracts and deployment transactions/blocks
extensionId
approved code version or image hash
registered TEE identities used by the release
FCC registry addresses and configuration transactions
FTestXRP/AssetManager addresses resolved from official registry
source/runtime verification
frontend/relay release identifiers
evidence paths
blockers
```

The manifest begins `verified: false`. Runtime consumers must refuse write flows
against it until promotion gates pass.

## 6. Release workflow

### Prepare

- Start from a clean, pushed commit in the private Summer Signal repository.
- Run compilation, tests, lint, build, binding drift, evidence validation, and
  current/full-history secret scans.
- Confirm Coston2 chain ID `114`, expected registry addresses, distinct test
  actors, sufficient C2FLR, and no mainnet key material.

### Deploy and configure

- Deploy market and receipt from the exact compiled source.
- Register/configure the extension and approved code version.
- Register or select the TEE identity according to the supported FCC flow.
- Configure token/FAssets and optional protocol integrations.
- Record every public checkpoint without recording credentials or plaintext.

### Verify

- Compare deployed runtime bytecode and constructor arguments to source.
- Verify immutable registry, extension, code-version, token, and receipt wiring.
- Verify on-chain signer registration and result-signature recovery.
- Run the complete two-vendor encrypted lifecycle.
- Run tamper, wrong-tender/root/rules, replay, expiry, invalid/tie/no-valid,
  outage recovery, conservation, and reentrancy cases.
- Promote the manifest only when every mandatory check passes.

### Synchronize

- Generate `packages/flare-bindings/generated/` from the verified manifest and
  exact production artifacts.
- Update the web, relay, and console to use only the generated Coston2 release.
- Commit manifest, bindings, source mapping, and sanitized evidence together.

## 7. Web and relay deployment

The current hosted web and Railway relay target the historical Sepolia release.
They are not Summer Signal judge endpoints.

The Flare release must provide:

- a wallet-free Coston2 explorer and finalized tender route;
- a browser wallet network switch to chain `114`;
- a public FCC identity/code-version/result evidence view;
- a stateless relay health response reporting Coston2 chain ID, verified market
  bytecode, extension ID, signer policy, and manifest verification;
- explicit unavailable states when RPC, proxy, or FCC result retrieval fails.

No browser deployment receives a wallet, TEE, proxy database, or relay private
key.

## 8. Rollback and recovery

- Web: promote the last frontend built from the same verified Coston2 bindings.
- Relay: stop an unhealthy runner; permissionless state remains recoverable by
  another runner or UI.
- Contracts: publish a new manifest for a new address; never rewrite historical
  addresses.
- Extension: do not change the code version for an existing tender. Apply the
  documented recovery policy to a compatible approved machine/version.
- FCC outage: preserve closed tender state and retry; never insert a mock result
  or let a buyer select a replacement winner.

## 9. Historical baseline commands

Existing `pnpm` compile/test/deploy scripts and `SEPOLIA_*` variables operate on
the old release until dedicated `flare:*` scripts are implemented. They remain
useful for regression and comparison but do not validate Flare.
