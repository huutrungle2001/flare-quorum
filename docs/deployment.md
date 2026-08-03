# VeilBid Flare Championship Deployment Guide

> Status: target workflow; no canonical Coston2 release exists. Current scripts
> deploy only the historical Sepolia/Nox baseline.

## 1. Release separation

| Release | Canonical authority | Status |
|---|---|---|
| Historical Sepolia/Nox | `packages/contracts/deployments/sepolia.release.json` | Verified pre-hackathon baseline |
| Coston2/FCC championship | `packages/flare-contracts/deployments/coston2.release.json` | Planned; absent until deployment |

Never put Flare addresses into the Sepolia manifest/bindings or reuse historical
deployment artifacts as Coston2 evidence.

## 2. Phase 0: pin before building

Record in a committed public dependency manifest:

- official FCC scaffold commit, Go version, Docker image digests, public
  interfaces, registry discovery method, proxy/indexer requirements, and
  confidential-versus-simulated machine mode;
- Foundry version and Solidity `0.8.27` compiler settings;
- Node, pnpm, viem, Flare SDK/periphery, FAssets, FDC, FTSO, and Smart Account
  versions/discovery paths;
- Coston2 chain ID `114`, XRP/USD feed identifier, official FTestXRP and
  AssetManager discovery source;
- availability of three registered TEE identities for one extension and their
  supported sealed-state recovery mechanism.

Do not hardcode an address copied from prose when an official registry or
configuration source exists. A drift check must compare any temporary local FCC
interface with the pinned official source.

## 3. Local configuration policy

Final variable names follow the pinned scaffold. Names below illustrate scope,
not a ready configuration:

```dotenv
COSTON2_RPC_URL=https://coston2-api.flare.network/ext/C/rpc
FLARE_DEPLOYMENT_PRIVATE_KEY=0x...
FCC_PROXY_URL=https://...
FCC_INDEXER_HOST=...
FCC_INDEXER_USER=...
FCC_INDEXER_PASSWORD=...
XRPL_TESTNET_RPC_URL=https://...
```

- Use disposable Coston2/XRPL testnet identities and C2FLR for gas.
- Keep deployer, executor, XRPL, TEE, proxy, indexer, Redis, and tunnel secrets
  in ignored local configuration or secret storage.
- Never expose a secret through `VITE_*`, command output, logs, screenshots,
  browser bundles, or committed evidence.
- Browser code receives only verified public network, contract, extension,
  machine identity/key fingerprint, registry, and feed configuration.

## 4. Feasibility deployment order

No production market deployment starts before Gates 0–E pass:

1. Create `apps/fcc-extension` from the pinned official scaffold and
   `packages/flare-contracts` as a separate Foundry workspace.
2. Register the minimal extension/code version and verify one correctly
   domain-separated Coston2 result on-chain.
3. Prove authenticated private bid ingress, body-log exclusion, one signed
   receipt, sealed persistence, and ordered-root validation.
4. Register/select three compatible machines and prove common receipt quorum,
   two matching result signatures, split-result failure, and fixed key policy.
5. Prove deterministic multi-criteria golden vectors in the real runtime.
6. Save only sanitized public identifiers/assertions under `evidence/coston2/`.

If the supported environment cannot provide private ingress, sealed recovery,
or multiple registered machines, stop and revise product claims. On-chain bid
ciphertext and silently relabeled `1-of-1` execution are not championship
fallbacks.

## 5. Canonical Coston2 release manifest

The release manifest begins with `verified: false` and records at least:

```text
schemaVersion, network, chainId, kind, verified, sourceCommit, deployer
compiler/toolchain settings and artifact/runtime hashes
contracts, constructor arguments, transactions, blocks, source publication
FCC registry addresses and discovery source
extension ID, code/image version, three machine identities/key fingerprints
receipt and result thresholds, private-ingress public origin/policy hash
FAssets registry, FTestXRP, AssetManager, FDC, FTSO feed, Smart Account controller
frontend/relay release identifiers, evidence paths, blockers
```

Runtime consumers refuse write/private-ingress flows unless the manifest,
generated bindings, chain ID, bytecode, extension/code, machine set, and key
fingerprints agree.

## 6. Championship release workflow

### Prepare

- Start from a clean, pushed commit in the private Summer Signal repository.
- Compile and run unit, fuzz, invariant, golden-vector, binding-drift, lint,
  build, evidence-schema, privacy-output, and current/full-history secret checks.
- Confirm official discovery results, three distinct machines, 2-of-3 policy,
  disposable actors, gas, and absence of mainnet key material.

### Deploy and configure

- Deploy non-upgradeable market and non-transferable receipt from exact
  production artifacts.
- Configure future-tender-only extension/code, machine, FTestXRP, and XRP/USD
  feed policy without granting live-tender or escrow override authority.
- Register the extension/code and three TEE identities through supported FCC
  flows; record public fingerprints and confidential/simulated mode.
- Deploy private ingress with authenticated vendor/tender binding, TLS, body
  logging disabled, strict size/rate/time bounds, and no plaintext database.
- Configure FAssets/FDC/Smart Account executor paths with no VeilBid-custodied
  XRPL secret.

### Verify live behavior

- Compare runtime bytecode, source, constructor, immutables, registry wiring,
  extension image, machine policy, threshold, feed, and token with the manifest.
- Run XRP-authorized direct mint-and-fund plus direct EVM recovery funding.
- Run two- and three-vendor private multi-criteria lifecycles, FTSO close,
  2-of-3 finalize, payout/remainder/refund, and FXRP redemption journey.
- Run wrong-domain/root/rules/feed/machine/key/nonce/expiry, weak/split quorum,
  stale oracle, rollback, proxy/TEE restart, competing relay, reentrancy, and
  conservation cases.
- Promote `verified: true` only when every mandatory verification row passes and
  blockers are empty.

### Synchronize atomically

- Generate `packages/flare-bindings/generated/` from the verified manifest and
  exact artifacts.
- Point web, relay, and console only at generated Coston2 bindings.
- Commit manifest, source mapping, bindings, schemas, and sanitized evidence as
  one release unit; never rewrite an old release manifest.

## 7. Web, relay, and ingress deployment

The championship release provides:

- a wallet-free finalized tender/evidence route;
- XRP Treasury, EVM Buyer, Vendor, Public, Activity, and Evidence journeys;
- verified extension/code/machine/key/quorum/FTSO/FAssets/FDC/Smart Account
  metadata;
- a stateless relay that closes, requests, retrieves, groups exact digests, and
  submits threshold results without bid data or winner logic;
- an ingress service whose health reports only public configuration and whose
  logs contain no body, ciphertext, credential, or plaintext;
- explicit unavailable/recovery states when RPC, proxy, FCC, FDC, FTSO,
  FAssets, or indexer dependencies fail.

The browser deployment gets no wallet, relay signer, TEE secret, proxy database,
XRPL secret, or infrastructure credential.

## 8. Rollback and incident recovery

- **Web/relay:** promote the last artifact built from the same verified bindings;
  another relay/browser can resume public checkpoints.
- **Ingress/proxy:** stop an unhealthy instance, preserve no body logs, and
  restore only supported sealed TEE state for the same fixed identity/code.
- **Contract:** deploy a new address and new manifest; historical addresses and
  evidence remain immutable.
- **Extension/config:** new code, keys, thresholds, feeds, or machines apply only
  to new tenders. Never mutate a tender after opening.
- **Quorum loss:** surface a liveness incident and preserve frozen state. Do not
  add a buyer-selected result, timeout refund, replacement machine, or mock.
- **Potential secret/privacy leak:** halt affected services, rotate only future
  configuration where safe, preserve public incident identifiers, remove
  private artifacts from publication, and report through `SECURITY.md`.

## 9. Historical commands

Existing unprefixed `pnpm` and `SEPOLIA_*` flows continue to target the old
release until dedicated `flare:*` commands are implemented. They are regression
checks only and cannot promote the Coston2 manifest.
