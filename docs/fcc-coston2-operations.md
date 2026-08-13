# FCC Coston2 Operational Baseline

> Status: V2 completed a rolling replacement onto the dependency set pinned by
> the current scaffold. Extension `66142` and exactly three simulated product
> machines were re-registered at `PRODUCTION` with fresh availability in
> `evidence/coston2/fcc-market-v2-machines-refresh.json`. Availability remains a
> time-bounded fact and must be checked again at judge time. This
> baseline is derived from the project-owner-supplied
> [FCC redeploy message](original/fcc-coston2-redeploy-message.md) and current
> [known-good setup clarification](original/fcc-coston2-known-good-setup-2026-08-12.md).
> The former V1 extension `66011` remains historical release evidence; status
> `2` alone is never treated as sufficient readiness. Extension `66007` remains
> foundation-only compatibility evidence.

## 1. Authority and drift rule

The supplied message reports the live Coston2 `FlareTeeManager` as:

```text
0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE
```

That address currently agrees with the official
[`fce-extension-scaffold` Coston2 configuration](https://github.com/flare-foundation/fce-extension-scaffold/blob/main/config/coston2/deployed-addresses.json).
It is an observed operational input, not an immutable release constant.

Before every FCC deployment or registration:

1. pin the official scaffold commit;
2. resolve `FlareTeeManager` from that pinned configuration;
3. require deployed bytecode at the resolved address;
4. compare it with the expected manager interface;
5. record address, configuration hash, source commit, and check block in public
   evidence.

Never use the truncated retired `0x004224fa…5d41F` address. Never copy an FCC
address from this document directly into production source.

## 2. Required component baseline

The 2026-08-12 clarification requires:

- current `main` for `fce-extension-scaffold` or the applicable official
  example base;
- the exact dependency versions pinned together by that scaffold revision;
- no independent mixing of latest `tee-node`, `tee-proxy`, and
  `go-flare-common` revisions;
- new indexer credentials from the organizer's current pinned message.

Version names alone are insufficient. Gate 0 records exact commits, Go module
resolution, container digests, and a successful availability vote. If the
scaffold's resolved module is older than the bulletin minimum, the gate remains
blocked until a tested organizer-supported combination is pinned.

The 2026-08-12 audit observed scaffold commit
`e3f587949069780084e2ced8a53c9419ed05c250`, which pins `tee-node` `v0.0.24`,
`tee-proxy` `v0.0.18`, and
`go-flare-common` `v1.2.2-0.20260727094511-09a10067e6a4` for its extension.
These values are recorded in
`tooling/flare/coston2-operational-baseline.json` and must be rechecked before
the next deployment because `main` can move.

The verified V1 release used an earlier tested runtime line:

- official scaffold `f48cafb889441a62e47c083f4be8dd7d3f456f83` and sign
  example `6df972c64d34efe1d4497f0eafe6792d1f0862dd` still pin
  `tee-node` `v0.0.21` and `tee-proxy` `v0.0.18`;
- selected `tee-node` commit
  `9090eccbae1111742bd83ef0601485d9503b4a13` is tagged `v0.0.23`;
- selected `tee-proxy` `develop` commit
  `0c6d016b09948cba9a508ba357e592eb6088fd1c` resolves `tee-node`
  `v0.0.23` and Go `1.25.8`.

Do not rewrite that V1 release manifest or its evidence. V2 rebuilt and retested
the rolling runtime against the current scaffold pin set before promotion. The proxy release
recipe at `apps/fcc-extension/proxy/Dockerfile` downloads the exact official
source archive, verifies its checksum, and pins both image stages. The canonical
public pin set and repeatable live checks are in
`tooling/flare/coston2-foundations.json` and `pnpm flare:foundations:check`.
The recipe has now been built twice on `linux/amd64`. The executable OCI
manifest digest and extracted binary SHA-256 are pinned in the foundation
manifest and verified by `pnpm flare:proxy:image:verify`; sanitized build
evidence is stored at `evidence/coston2/gate-0-proxy-image.json`. Provenance
and SBOM are enabled, but their timestamp-bearing index digest is intentionally
not substituted for the stable executable platform digest.

The FlareQuorum extension recipe at `apps/fcc-extension/Dockerfile` is pinned by
the same policy. `pnpm flare:extension:image:verify` checks the executable
platform digest, extracted binary, `MODE=0` default, persistent sealed-store
volume, exact launch-policy environment allowlist, and absence of embedded
runtime secret variables. Its sanitized record is
`evidence/coston2/gate-0-extension-image.json`. A Coston2 simulation must still
opt into `MODE=1` explicitly and must never be described as hardware-backed.

## 3. Fresh registration workflow

Because the redeploy may have cleared prior registrations:

1. start without a reused `config/extension.env`;
2. deploy `VeilBidFoundationSenderV2`, then register that exact sender to create
   a fresh `EXTENSION_ID`;
3. call `setExtensionIdExplicit(EXTENSION_ID)` as the deployment owner and
   require the live registry to map that ID back to the V2 sender;
4. start the current TEE/proxy stack against Coston2;
5. require all machine `/info` envelopes to report the same intended governance
   hash, then register that exact signer set and threshold on-chain;
6. run `post-build` or the equivalent pinned registration commands;
7. ensure registration invokes `register-tee -command rRap`;
8. verify the capital `R` generated a fresh attestation challenge;
9. save the new extension/machine identifiers only after on-chain confirmation.

Reusing a historical extension ID, machine record, challenge, or address is a
failure. Re-running `pre-build --force` casually is also forbidden because it
can detach a machine from the expected extension.

### 3.1 Renewing V2 availability

FCC availability expires after six hours even when a machine remains in status
`2`. Recheck the exact three-machine set before a demo:

```bash
pnpm flare:v2:machines:preflight
```

If freshness is the only failed binding, renew it with:

```bash
pnpm flare:v2:availability:preflight
pnpm flare:v2:availability:refresh
pnpm flare:v2:machines:preflight
```

The refresh command keeps a production machine active, requests one fresh TEE
attestation and availability check, and calls the manager's
`confirmAvailability(proof)`. It does not pause a healthy identity and never
reuses a prior proof. If an interrupted operation finds an identity already in
status `4` (`PAUSED`), it requests one new attestation/check and uses
`toProduction(proof)` to restore that same identity. Any other status, binding
drift, unexpected active identity, or non-fresh final checkpoint fails closed.

The foundation sender evidence remains under
`evidence/coston2/fcc-extension-registration.json`. The historical V1 product sender
`0xFaEDc6793E72AFF05d29e6f0550d0FF8b90c4c05` is explicitly bound to extension
`66011` in `evidence/coston2/fcc-market-extension-registration.json`. The
current V2 product sender `0xE1252D445ee86ED78C1da2bD5f1bF4a69bF476AC`
is bound to extension `66142`; its refreshed set is recorded in
`evidence/coston2/fcc-market-v2-machines-refresh.json`. The
allowed FCC wire/code version `v0.2.2` and simulated code/platform record is in
`evidence/coston2/fcc-code-version.json`. The current reproducible FlareQuorum
application image is versioned independently in
`evidence/coston2/gate-0-extension-image.json`. In simulated mode the live
measurement remains the already registered code hash when the application
binary changes, and the manager rejects adding a second version for the same
hash. Do not relabel that on-chain record: compare the exact image digest and
binary SHA-256 as separate release evidence. The three product machines share
the approved wire/code binding and byte-identical application image while
retaining distinct identities and stable public origins.

FlareQuorum performs the missing governance step explicitly with
`pnpm flare:governance:preflight` followed by `pnpm flare:governance:set`. The
preflight derives the official plain-governance hash, compares it with all
three public machines and the current extension owner/policy, and refuses an
unexpected nonzero on-chain policy. This ordering prevents the manager's
`InvalidGovernanceHash` registration revert without weakening machine binding.

The deployed V1 sender at `0x44A322A45e8D796d890271209D59d529501113B9`
remains public evidence of manager/constructor compatibility only. It is
unregistered and uses the scaffold's historical scan-based `setExtensionId()`;
do not register it. Public extension IDs were already above `65900` during the
2026-08-04 live check, so every fresh FlareQuorum sender uses the constant-time V2
binding and separately verifies the registry mapping.

## 4. Stable public proxy URL

Each registered machine requires a stable HTTPS endpoint whose hostname remains
valid across restarts:

- named Cloudflare Tunnel; or
- reserved ngrok domain; or
- a persistent Railway service domain backed by one FCC machine service; or
- another organizer-approved stable HTTPS origin.

Do not register a `trycloudflare` quick-tunnel hostname. Before and after
registration, compare on-chain machine URL with the configured public URL and
verify the same `/info` identity through the registration control endpoint and
public origin. A hosted machine may use the same stable HTTPS URL for both by
setting `FCC_PROXY_CONTROL_URLS`. If a URL or identity rotates, update
configuration and re-run the supported post-build registration flow before any
test is accepted.

Register each machine with the bare origin and no trailing slash, for example
`https://tee.example` rather than `https://tee.example/`. The relay appends
`/instruction`; a trailing slash can produce a redirecting `//instruction`
route that changes the request method and prevents the TEE from receiving it.

Championship 2-of-3 operation requires exactly one active machine identity per
stable public endpoint. Although the registry can store several identities for
one URL, that layout is rejected because each dispatch selects one machine and
a stale identity can cause intermittent delivery failure.

## 5. Thirty-second machine diagnosis

With `FLARE_TEE_MANAGER` and `TEE_ID` resolved from pinned configuration:

```bash
cast call "$FLARE_TEE_MANAGER" \
  "getTeeMachine(address)((address,address,string))" "$TEE_ID" \
  --rpc-url "$COSTON2_RPC_URL"

cast call "$FLARE_TEE_MANAGER" \
  "getTeeMachineStatus(address)(uint8)" "$TEE_ID" \
  --rpc-url "$COSTON2_RPC_URL"
```

Expected status meanings from the supplied bulletin:

| Value | Meaning | Release interpretation |
|---:|---|---|
| `1` | `INITIALIZED` | Not ready; inspect URL, versions, indexer, challenge, and votes |
| `2` | `PRODUCTION` | Registration gate may proceed to action-result testing |
| `4` | `PAUSED` | Not ready; restore only with a fresh supported availability proof |

The machine record URL must equal the currently served stable URL. `PRODUCTION`
alone does not prove private ingress, sealed state, scoring correctness, or
multi-machine quorum.

### 5.1 Instruction delivery and indexer diagnosis

The newer 2026-08-12
[known-good setup clarification](original/fcc-coston2-known-good-setup-2026-08-12.md)
supersedes the older indexer-pull note. Providers POST the cosigned instruction
directly to the selected machine's stable HTTPS `/instruction` route on external
port `6664`. The proxy does not discover instructions from the indexer. An
on-chain dispatch therefore proves addressing, not delivery.

Diagnose a dispatched-but-unexecuted instruction in this order:

1. Confirm the selected machine is status `2`, has a registered `teeId`, and
   its availability validity has not expired. Derive the check time from the
   manager's validity window and require its age to be strictly less than six
   hours.
2. Confirm its on-chain URL is the stable HTTPS origin currently serving
   `/info`, and that a read-only `GET /instruction` probe returns `405`, proving
   the provider-facing POST route exists without submitting an instruction.
3. Query `getActiveTeeMachines(extensionId)` and require exactly the three
   intended identities and public origins. `pnpm flare:machines:register` now
   rejects a missing, additional, duplicated, stale, or expired identity/route.
4. Query `/action/status/<reward-epoch>/<instruction-id>` on the primary FTDC
   proxy, then the fallback when needed. A recent `404` can mean the instruction
   never reached that proxy; it does not by itself prove an outage.
5. If an old identity remains active, run
   `pnpm flare:machines:retirement:preflight`. Pause it only through
   `pnpm flare:machines:retire-stale` after the tool proves ownership, three
   healthy replacements, and that no unfinished tender froze the stale ID.
6. If the manager record contains `localhost`, an expired tunnel, or another
   wrong origin, use the owner-authorized route reconciliation in the machine
   registration tool or intentionally create a fresh extension. Re-running a
   registration command without reconciling the existing record is not proof
   that the URL changed.
7. When the exact tested proxy release exposes them, check
   `instructions_received` and `instructions_rejected` metrics. The scaffold's
   pinned `tee-proxy v0.0.18` rejects the newer `[metrics]` TOML section, so V2
   does not mix in a newer proxy merely to add that optional diagnostic.
   Provider attempt-level HTTP responses are not publicly queryable and require
   operator escalation with public-safe identifiers.

Indexer readiness is a separate check for policy and indexed protocol state.
Expected lag is effectively zero: `GET :6661/ready` returning `200` means the
indexer is current, while `503` with a C-chain indexer-delay message means it is
behind. Missing rows in the hackathon log table alone do not prove lag because
only selected contracts and topics are indexed.

The normal Coston2 FTDC proxies are
`https://tee-proxy-coston2-1.flare.rocks` (primary) and
`https://tee-proxy-coston2-2.flare.rocks` (fallback).

All custom FlareQuorum operation types must remain outside the reserved `F_`
namespace. The current `VEILBID_FOUNDATION`, `VEILBID_BID`, and
`VEILBID_SELECTION` values comply, and a source test prevents accidental
regression.

Do not copy shared chat credentials into a tracked file, command argument,
evidence record, browser variable, or container image. Obtain the current
read-only credential out of band and inject it only as the documented runtime
secret variables.

Before any new market deployment, FlareQuorum also re-resolves `FtsoV2` through
the live `FlareContractRegistry` and fails before sending a transaction if it
differs from the reviewed foundation binding. Deployed code at an old address is
not evidence that it is still the canonical protocol address.

## 6. Simulated TEE policy

The supplied organizer message states that `SIMULATED_TEE=true` on Coston2 is
acceptable for judging and GCP Confidential Space is not required. The current
[official FCC guide](https://dev.flare.network/fcc/guides/sign-extension) also
documents simulated Coston2 mode and the `rRap` registration sequence.

Evidence and UI must label the machine `SIMULATED TEE`. This approval removes a
GCP dependency; it does not justify claims of hardware-backed confidentiality.
The final submission must distinguish simulated execution from real
confidential hardware.

## 7. Restart and identity semantics

The pinned official runtime generates the TEE identity key during process
initialization and starts extension mode from `ZeroState`. Its public API does
not provide a supported identity restore path. Restarting `extension-tee`
therefore creates a new TEE ID even if the FlareQuorum sealed-bid volume survives.

Operational rules:

- never restart or recreate all three championship machines together;
- monitor the live `/info` identity and fail closed on any on-chain mismatch;
- treat one rotated identity as an unavailable member while the two surviving
  frozen identities remain usable for selection;
- bring up a replacement under the same extension and approved code, complete
  the normal registration/attestation/availability flow, and remove the stale
  identity from production rotation;
- reusing the public endpoint is supported when it resolves to the replacement;
- use replacement identities only for new tenders; an open tender's frozen
  identity/key set remains immutable and a replacement cannot decrypt its old
  ciphertext;
- never persist a raw identity key in `.env`, a Docker secret, or a host file;
- record a live replacement fault drill before marking production recovery
  passed; the three-machine drill is now preserved in
  `evidence/coston2/fcc-replacement-recovery.json`, and same-identity
  restoration is not a supported acceptance criterion.

The file-backed sealed-store test is still useful for handler state, but it is
not proof that the whole TEE machine can restart under the same identity.
The local restart boundary observation is kept in
`evidence/local/fcc-local-tee-restart-boundary.json`; it is deliberately not
promoted to Coston2 production evidence.

This policy was confirmed by the hackathon organizer on 2026-08-08: identity
rotation after restart is expected; recovery is replacement plus normal
registration, not identity restoration. The public-safe source note is
preserved in
[`docs/original/fcc-tee-recovery-response-2026-08-08.md`](original/fcc-tee-recovery-response-2026-08-08.md).

## 8. Gate 0 pass record

Gate 0 cannot pass without all of:

- pinned official scaffold/example, `tee-node`, and `tee-proxy` commits;
- resolved manager address and live bytecode/interface check;
- organizer-current indexer credentials working without logging them;
- stable named HTTPS origin reachable and equal to the on-chain machine URL;
- fresh extension ID and machine ID;
- fresh `rRap` challenge;
- machine status `2` (`PRODUCTION`);
- unexpired availability whose check age is strictly under six hours;
- a read-only confirmation that the registered public origin exposes the
  provider-facing `/instruction` POST route;
- one active TEE identity per stable endpoint;
- one successful current-domain action result;
- explicit simulated-versus-hardware mode;
- sanitized evidence containing public identifiers only.

Three-machine availability, private ingress, and supported replacement recovery
are separately evidenced. A one-machine `PRODUCTION` result does not satisfy
the championship quorum requirement.

The current V2 live records are
`evidence/coston2/fcc-market-v2-machines-refresh.json`,
`evidence/coston2/fcc-market-v2-extension-registration.json`,
`evidence/coston2/fcc-market-v2-governance.json`, and the canonical release
manifest. The immutable foundation and historical V1 records remain available
separately. Together they record the resolved source hashes, toolchains,
manager interface, registry discovery, FTestXRP binding, XRP/USD feed, indexer
configuration, extension registration, code-version allowlisting, governance,
stable proxy reachability, and all three production machines. Same-identity
simulated-TEE restart is an unsupported runtime boundary, not a remaining
Gate-B requirement; replacement and re-registration is the verified recovery
path. Availability is still time-bounded and must be rechecked near the demo.
