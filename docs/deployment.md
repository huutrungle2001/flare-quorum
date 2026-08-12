# FlareQuorum Championship Deployment Guide

> Status: the canonical Coston2 market release and hosted judge package are live
> and verified. The unified Buyer deployment passes repository test/lint/build
> and hosted production, 320px keyboard/accessibility, XRP draft, and reload-
> checkpoint smoke validation. The
> organizer-approved rolling replacement-TEE drill passes. Broader browser
> recovery is planned post-Summer Signal hardening, while Gate H user validation
> remains `NOT_RUN`; the historical Sepolia/Nox baseline remains separate.

FCC registration and proxy operations must also satisfy the current
[`FCC Coston2 Operational Baseline`](fcc-coston2-operations.md), derived from
the preserved organizer-group redeploy bulletin and official scaffold sources.

## 1. Release separation

| Release | Canonical authority | Status |
|---|---|---|
| Historical Sepolia/Nox | `packages/contracts/deployments/sepolia.release.json` | Verified pre-hackathon baseline |
| Coston2/FCC V2 | `packages/flare-contracts/deployments/coston2.release.json` | Verified and consumer-selected after runtime, wiring, refund, success, outage-recovery, and credential-negative gates passed |
| Historical Coston2 V1 | `packages/flare-contracts/deployments/coston2.v1.release.json` | Preserved verified predecessor with its known pre-dispatch liveness gap; no longer selected by consumers |
| V2 promotion record | `packages/flare-contracts/deployments/coston2.v2.release.json` | Immutable promotion-stage artifact retained separately from the selected canonical manifest |

Never put Flare addresses into the Sepolia manifest/bindings or reuse historical
deployment artifacts as Coston2 evidence.

`FlareQuorumMarketV2` was deployed side-by-side, then selected only after its
fresh extension/machine registration, source/runtime verification, three-vendor
lifecycle, outage recovery, credential-negative drill, and both refund paths
passed. V1 artifacts and evidence remain immutable and provide rollback facts;
they are not relabeled as V2.

## 2. Phase 0: pin before building

The public source/toolchain/discovery pin is
`tooling/flare/coston2-foundations.json`. Run the repeatable partial check with:

```bash
pnpm flare:foundations:check
```

Collect sanitized evidence with `pnpm flare:foundations:collect`. The stricter
`pnpm flare:gate:0` command fails until every external registration prerequisite
also passes; an `IN_PROGRESS` evidence file is not a release gate pass.

Build and verify the checksum-pinned `linux/amd64` FlareQuorum extension and
tee-proxy separately:

```bash
pnpm flare:extension:image:build
pnpm flare:extension:image:verify
pnpm flare:proxy:image:build
pnpm flare:proxy:image:verify
```

Both verifiers check the executable platform manifest digest, extracted binary
SHA-256, ELF architecture, and read-only executable mode. The extension check
also requires its safe production-attestation default, persistent sealed-store
volume, and exact launch policy; the proxy check requires its non-root user and
entrypoint. Neither records runtime configuration or credentials.

The deployed-but-unregistered Gate-A V1 sender is independently reproducible
with:

```bash
pnpm flare:verify:foundation
```

The verifier recompiles the artifact, fills the recorded live-manager
immutables, checks the deployment transaction and both registry getters, and
requires the exact runtime hash. Success still reports
`VERIFIED_DEPLOYED_UNREGISTERED`; it does not claim an FCC result.
It must not be registered. Before the live Gate-A action, deploy
`VeilBidFoundationSenderV2`, register that exact address, call
`setExtensionIdExplicit` with the returned ID, and verify the registry maps the
ID back to the sender. This avoids the scaffold's historical linear scan over
all public extension IDs while preventing an owner from binding a foreign ID.

The V2 deployment and registration flow is implemented as a resumable local
journal plus sanitized public evidence. Run its read-only preflight first:

```bash
pnpm flare:foundation:register:preflight
```

After the command reports `READY`, commit the exact source and run
`pnpm flare:foundation:register` from a clean worktree. It deploys V2, registers
the exact sender, binds the emitted public extension ID, configures the declared
wallet as machine/project owner, enables the official bytes32 `EVM` key type,
and verifies runtime logic and every registry/getter binding. Interrupted runs
resume from `.local/fcc/foundation-registration.state.json`; they must not mint
a replacement extension merely because a later configuration transaction was
interrupted. The resulting registration evidence still does not pass Gate A
until a production machine drives a signed live FCC action.

Re-verify the committed public evidence independently with
`pnpm flare:foundation:registration:verify`. This command uses no signer and
checks the deployment/registration receipts, constructor input, masked runtime
logic, current registry mappings, explicit sender binding, owner allowlists,
and EVM key type directly against Coston2.

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
  supported sealed-state recovery mechanism;
- live `FlareTeeManager` resolution, deployed bytecode/interface match, fresh
  extension/machine registration, machine status `2` (`PRODUCTION`), and an
  availability check younger than six hours;
- the exact `tee-node`, `tee-proxy`, and `go-flare-common` versions pinned
  together by the current official scaffold commit;
- current indexer credentials and a stable named HTTPS proxy origin.

Do not hardcode an address copied from prose when an official registry or
configuration source exists. A drift check must compare any temporary local FCC
interface with the pinned official source. The supplied 2026-08-03 bulletin and
current official scaffold configuration agree on manager
`0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE`, but deployment tooling must
resolve and verify it rather than hardcode it.

## 3. Local configuration policy

Final variable names follow the pinned scaffold. Names below illustrate scope,
not a ready configuration:

```dotenv
COSTON2_RPC_URL=https://coston2-api.flare.network/ext/C/rpc
FLARE_DEPLOYMENT_PRIVATE_KEY=0x...
FCC_PROXY_URL=https://...
FLARE_TEE_MANAGER=0x...
FCC_INDEXER_HOST=...
FCC_INDEXER_PORT=3306
FCC_INDEXER_DATABASE=indexer
FCC_INDEXER_USER=...
FCC_INDEXER_PASSWORD=...
PROXY_PRIVATE_KEY_1=...
FCC_DIRECT_API_KEY_1=...
PROXY_PRIVATE_KEY_2=...
FCC_DIRECT_API_KEY_2=...
PROXY_PRIVATE_KEY_3=...
FCC_DIRECT_API_KEY_3=...
XRPL_TESTNET_RPC_URL=https://...
VERIFIER_URL_TESTNET=https://fdc-verifiers-testnet.flare.network
VERIFIER_API_KEY_TESTNET=...
COSTON2_DA_LAYER_URL=https://ctn2-data-availability.flare.network
FLARE_FUNDING_EXECUTOR_PRIVATE_KEY=0x...
```

The vendor ingress is a separate server process (`pnpm flare:ingress`) and is
enabled only for a verified market. It additionally requires the verified
`FLARE_TEE_MANAGER`, exactly three `FLARE_FCC_PROXY_URLS`, their matching three
server-only `FLARE_FCC_DIRECT_API_KEYS`, and an exact
`FLARE_INGRESS_WEB_ORIGIN`. API keys must be injected through local/host secret
storage and must never be placed in `VITE_*`, logs, evidence, or screenshots.
The configured proxy order must match the tender's frozen TEE order and each
URL must equal that machine's on-chain registered URL.

Generate the ignored runtime proxy configuration with
`pnpm flare:local:secrets` followed by `pnpm flare:proxy:config`. The first
command creates only missing proxy/direct keys, never replaces an existing
value, prints no secret, and keeps `.env.local` at mode `0600`. The second writes
the three `.local/fcc/extension-proxy-{1,2,3}.coston2.toml` files with mode
`0600`, does not print any credential, and takes the Coston2 system addresses
from the pinned foundation manifest. Each config uses its own Redis endpoint;
all keep the internal port private, require a distinct API key for
`POST /direct`, and explicitly label/accept simulated-TEE attestation. Mount
each file read-only at `/app/config/config.toml`; never copy one into the image
or evidence.

The three-machine smoke stack is defined in
`apps/fcc-extension/compose.coston2.yaml`. It copies the owner-only proxy config
into three private Docker volumes readable by the proxies' non-root runtime
users. Every machine has an independent Redis queue, proxy signing key, direct
API key, sealed store, TEE identity, and loopback port (`6674`–`6676`). Run it
with Docker Compose's `--env-file .env.local`; never render the resolved Compose
model to logs because it contains substituted runtime secrets.

Start the stack and run its sanitized negative-path verification with:

```bash
sg docker -c 'docker compose --env-file .env.local -f apps/fcc-extension/compose.coston2.yaml up -d'
pnpm flare:local:smoke
```

The verifier checks all three public info envelopes, distinct public-key
fingerprints, API-key boundaries, Redis/direct queues, proxy-to-TEE routing,
deliberate malformed-ciphertext rejection, and both result signatures. It
prints only assertions and fingerprints, never the
API key, raw signatures, action ID, attestation, or TEE public key. This is a
local simulated smoke check; it is not a bid, registered machine, production
status, stable public endpoint, or Gate 0 pass.

The registration client is also a pinned release artifact rather than an
unreviewed command from a moving scaffold checkout. Build and verify it with
`sg docker -c 'pnpm flare:registration:image:build'`; subsequent verification
uses `sg docker -c 'pnpm flare:registration:image:verify'`. The recipe downloads
the exact official scaffold archive, aligns its `tee-node` and
`go-flare-common` modules with the running stack, builds only `register-tee`,
and runs as a non-root distroless image. Runtime invocation supplies the
deployment key without storing it in the image and must use `-command rRap`
plus one state file and stable public HTTPS URL per machine.

Configure exactly three comma-separated stable origins in
`FLARE_FCC_PROXY_URLS`. For the local Compose stack, each origin tunnels to its
matching loopback port in order. For remotely hosted machines, also configure
the same three origins in `FCC_PROXY_CONTROL_URLS`; the registration client then
uses the remote HTTPS control endpoint instead of assuming a local process.
Hosted product-machine checks resolve `FCC_MACHINES_EXTENSION_ID` first, then
`FCC_MARKET_EXTENSION_ID`, and only fall back to the foundation
`FCC_EXTENSION_ID`. This keeps the foundation extension used by local Compose
separate from the market extension frozen by the hosted Railway machines.
`pnpm flare:machines:preflight` compares every public `/info` response with its
control endpoint, confirms a read-only `GET /instruction` returns `405`, checks
the exact active identity/route set and availability freshness from one Coston2
block, rejects credential-bearing/path/quick-tunnel URLs, and prints only
public machine identifiers and timestamps. Before machine registration, bind the
exact governance signer set reported by all three machines to the extension:

```bash
pnpm flare:governance:preflight
pnpm flare:governance:set
```

The setter defaults to the declared extension owner with threshold one, matching
the pinned scaffold/runtime default. An explicit `GOVERNANCE_SIGNERS` and
`GOVERNANCE_THRESHOLD` pair is accepted only when all three `/info` envelopes
report its exact official `keccak256(abi.encode(address[], uint256))` hash. It
refuses to overwrite a different nonzero on-chain policy, keeps the deployment
key process-local, and records only public governance identifiers. When both
governance and machine preflights report ready, run:

```bash
pnpm flare:machines:register
```

The runner extracts and re-hashes the verified registration binary, invokes
`rRap` sequentially with a TEE-ID-specific resume file, and verifies status,
fresh availability, extension, URL, code/platform, and public key from one
Coston2 block before it writes public evidence. Providers deliver cosigned
instructions directly to the selected machine's registered
`POST /instruction` route on external port `6664`; the indexer does not discover
or route those instructions. The deployment key remains process-local and is
never placed in an argument, image, state file, output, or evidence.

The live ingress repeats the same status and availability reads at the exact
chain checkpoint used for bid admission. Its `/health` becomes unavailable when
any frozen machine is expired or mismatched. Both Buyer funding paths require
that machine-bound health response before publishing the brief, requesting an
FTestXRP approval, preparing an XRPL payment, or creating a tender. This is the
consumer-side availability guard for the selected V2 release; the historical
V1 contract predates this stricter known-good readiness requirement.

The Railway Coston2 option deploys
`apps/fcc-extension/railway/Dockerfile` as three separate services. Each service
co-locates the exact approved extension and proxy binaries with its own Redis
queue, runtime secrets, volume, HTTPS domain, and simulated identity. Railway
builds must use `apps/fcc-extension/railway/railway.json`; the repository-root
`railway.json` belongs to the relay and must not be reused. A Railway restart
still rotates the upstream simulated identity, so do not redeploy a registered
machine during the demonstration window.

For a named Cloudflare Tunnel, install the checksum-pinned local client with
`pnpm flare:tunnel:install` and verify it with `pnpm flare:tunnel:check`. The
client is stored under ignored `.local/toolchains/`, is owner-executable only,
and does not auto-update inside FlareQuorum's release process. Browser authentication
must be completed by the project owner through `cloudflared tunnel login`; do
not paste `cert.pem`, a tunnel credential JSON, or a tunnel token into chat,
`.env.local`, logs, or the repository. One named tunnel may route three public
hostnames to loopback ports `6674`, `6675`, and `6676`; all three hostnames must
then be recorded in `FLARE_FCC_PROXY_URLS` in matching machine order.

- Use disposable Coston2/XRPL testnet identities and C2FLR for gas.
- Keep deployer, executor, XRPL, TEE, proxy, indexer, Redis, and tunnel secrets
  in ignored local configuration or secret storage.
- Never expose a secret through `VITE_*`, command output, logs, screenshots,
  browser bundles, or committed evidence.
- Browser code receives only verified public network, contract, extension,
  machine identity/key fingerprint, registry, and feed configuration.
- `/flare` is enabled only when `VITE_COSTON2_RPC_URL`,
  `VITE_FLARE_MARKET_ADDRESS`, `VITE_FLARE_MARKET_DEPLOYMENT_BLOCK`, and
  `VITE_FLARE_DEPLOYMENT_STATUS` are supplied from the sanitized release
  manifest. `VITE_*` must never carry a private RPC, proxy credential, wallet
  key, or indexer secret.
- The optional Coston2 Buyer/Vendor role routes additionally receive only the
  public `VITE_FLARE_INGRESS_URL` origin. It must be HTTPS and contain no query,
  fragment, username, password, API key, or other credential.
- The wallet-free Flare reader pins every contract read to the finalized
  Coston2 block. It reads tender/scoring state and the immutable award-receipt
  contract directly; it does not scan historical `eth_getLogs` ranges (the
  public Coston2 RPC caps those ranges at 30 blocks). This keeps the judge page
  responsive while preserving the no-plaintext/no-ciphertext boundary.

## 4. Feasibility deployment order

No production market deployment starts before Gates 0–E pass:

1. Create `apps/fcc-extension` from the pinned official scaffold and
   `packages/flare-contracts` as a separate Foundry workspace.
2. Register the minimal extension/code version and verify one correctly
   domain-separated Coston2 result on-chain.
   Registration uses a fresh `EXTENSION_ID`, current manager/configuration,
   `register-tee -command rRap`, a stable named tunnel, and status `2`.
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

Release construction starts from a candidate manifest with `verified: false`.
The current immutable Coston2 manifest is promoted to `verified: true` only
after the live deployment-consistency check; Gate H is still a separate product
release gate. The manifest records at least:

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
- Configure FAssets/FDC/Smart Account executor paths with no FlareQuorum-custodied
  XRPL secret.

The funding service uses a dedicated disposable Coston2 executor identity. It
does not fall back to `FLARE_DEPLOYMENT_PRIVATE_KEY` or
`FLARE_FINALIZER_PRIVATE_KEY`. `pnpm flare:funding:health` performs registry,
bytecode, finalized-market, FTestXRP, fee, and direct-mint-address checks without
writing. After Gate G prerequisites exist, pipe one public-safe version-1 job
to `pnpm flare:funding:execute`; decimal integer fields are strings and unknown
fields are rejected. If AssetManager returns `DirectMintingDelayed`, preserve
the JSON result as a checkpoint and run `pnpm flare:funding:resume` after its
`executionAllowedAt` time. Resume reuses the original FDC request and nonce;
it never sends a second XRPL payment and fails closed on quote, domain, or
user-operation drift:

```json
{
  "version": 1,
  "xrplTransactionId": "0x<32-byte-public-tx-id>",
  "personalAccount": "0x<derived-account>",
  "nonce": "0",
  "walletId": 0,
  "executorFeeUBA": "0",
  "terms": {
    "metadataHash": "0x<bytes32>",
    "scoringPolicy": {
      "schemaVersion": 1,
      "ceilingXrpMicros": "1000000",
      "bidDeadline": "<unix-seconds>",
      "allowXrp": true,
      "allowUsd": true,
      "ftsoFeedId": "0x015852502f55534400000000000000000000000000",
      "maxDeliveryDays": 30,
      "minWarrantyDays": 12,
      "maxWarrantyDays": 36,
      "priceWeightBps": 6000,
      "deliveryWeightBps": 2500,
      "warrantyWeightBps": 1500,
      "requiredCredentials": []
    },
    "approvedVendors": ["0x<vendor>"],
    "extensionId": "<registered-id>",
    "codeVersion": "0x<bytes32>",
    "teeIds": ["0x<tee-1>", "0x<tee-2>", "0x<tee-3>"],
    "teeKeyFingerprints": ["0x<key-1>", "0x<key-2>", "0x<key-3>"]
  }
}
```

The job never accepts a caller-supplied `rulesHash`. The market validates and
stores the complete public policy, then derives
`keccak256(abi.encode(RULES_DOMAIN, scoringPolicy))`; the executor independently
derives the same hash when proving `TenderCreated`. The 64-bit ceiling and
deadline remain decimal strings, while bounded `uint16` policy fields are JSON
integers.

The command emits no raw proof, XRPL source address, credential, provider body,
or secret. Exit code `2` means `DirectMintingDelayed`; the tender is not funded
and the same XRPL payment must be resumed after `executionAllowedAt`. The
checkpoint contains only public identifiers, the public-safe job, FDC request
bytes/round, payment amount, and direct-mint transaction checkpoint; it never
contains the FDC proof, verifier credentials, wallet keys, or bid payload.

The market deployment command is `pnpm flare:deploy:market`. It is intentionally
non-runnable before every Gate 0–E evidence file has status `PASS`, all recorded
assertions are true, and blocker lists are empty. It also requires a clean
source commit and refuses to overwrite a prior Coston2 manifest. Runtime
verification compares every non-immutable byte to the exact Foundry artifact;
constructor calldata and the token, manager, FTSO, extension-registry, and
award-receipt immutable bindings are checked independently on-chain.

### Verify live behavior

- Compare runtime bytecode, source, constructor, immutables, registry wiring,
  extension image, machine policy, threshold, feed, and token with the manifest.
- Run XRP-authorized direct mint-and-fund plus direct EVM recovery funding.
- Run two- and three-vendor private multi-criteria lifecycles, FTSO close,
  2-of-3 finalize, payout/remainder/refund, and FXRP redemption journey.
- Run wrong-domain/root/rules/feed/machine/key/nonce/expiry, weak/split quorum,
  stale oracle, rollback, proxy/TEE restart, competing relay, reentrancy, and
  conservation cases.
- Re-run `pnpm flare:market:lifecycle:preflight` whenever live readiness needs
  checking; it is read-only and remains valid after evidence/state exists.
  Only `pnpm flare:market:lifecycle` reserves fresh evidence/state paths and
  refuses to overwrite an earlier lifecycle record.
- Promote `verified: true` only when every mandatory verification row passes and
  blockers are empty.

### Synchronize atomically

- Generate `packages/flare-bindings/generated/` from the Flare Foundry artifact
  with `pnpm bindings:flare:generate`; the checked-in package is now `verified`
  because the Coston2 deployment manifest and runtime verification are present.
- Point web, relay, and console only at generated Coston2 bindings.
- Commit manifest, source mapping, bindings, schemas, and sanitized evidence as
  one release unit; never rewrite an old release manifest.

## 7. Web, relay, and ingress deployment

The current source release provides:

- a wallet-free finalized tender/evidence route;
- Buyer (with direct Coston2 or XRP-native funding choices), Vendor, Public,
  Activity, and Evidence journeys;
- verified extension/code/machine/key/quorum/FTSO/FAssets/FDC/Smart Account
  metadata;
- a stateless relay that closes, requests, retrieves, groups exact digests, and
  submits threshold results without bid data or winner logic;
- an ingress service whose health rereads one finalized public tender and
  validates its three frozen machine bindings, while logs contain no body,
  ciphertext, credential, or plaintext;
- an immutable public Buyer Brief registry under
  `/flare/public-briefs/:metadataHash`; the browser publishes the public-safe
  preimage before requesting a funding transaction and independently
  recomputes the hash before rendering it;
- explicit unavailable/recovery states when RPC, proxy, FCC, FDC, FTSO,
  FAssets, or indexer dependencies fail.

The current v2 judge deployment is the separate Vercel project
`flare-quorum.vercel.app`; it is not the historical `veilbid-three` project.
The ciphertext-only vendor ingress is the separate Railway v2 service at
`https://veilbid-flare-ingress-production.up.railway.app`. Its `/health` route
is public and returns only the readiness envelope `{status, service, chainId,
schemaVersion, tenderId, machineBindingsValid, tenderStatus}`; browser builds
receive this origin through `VITE_FLARE_INGRESS_URL`, while all direct proxy
keys remain server-only. The service does not persist bid bodies or proxy
envelopes. It does persist only allowlisted public Buyer Brief JSON in the
directory configured by `FLARE_PUBLIC_BRIEF_DIR`. Hosted deployments must mount
that directory on a persistent volume; an ephemeral filesystem would make new
brief text disappear after a restart even though contract hashes remain safe.
The web may use a separate `VITE_FLARE_PUBLIC_BRIEF_URL`; when omitted it uses
`VITE_FLARE_INGRESS_URL`. Both variables are public origins, not credentials.
A successful ingress action is not by itself a settlement;
the receipt quorum still must be submitted to the frozen Coston2 market.
The Flare relay includes a read-only `health-server` mode (`/live` and
`/health`) that needs no signer. Settlement polling must be deployed only as a
separate Coston2 service after a dedicated finalizer key and the three verified
FCC proxy URLs are configured; it must never reuse a Sepolia service or key.

The browser deployment gets no relay signer, TEE secret, proxy database, XRPL
secret, or infrastructure credential. An optional GemWallet integration runs
only in the user's browser, checks XRPL Testnet and the entered owner, and
receives the public payment hash rather than wallet material.

Roll out the ingress registry before the web build that publishes briefs. A
buyer transaction is not requested when brief publication or returned-hash
verification fails. Existing tenders created before registry support remain
valid and appear as `BRIEF UNAVAILABLE · HASH ONLY`; operators must not invent
or backfill text unless the exact original preimage is available and hashes to
the on-chain value.

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
