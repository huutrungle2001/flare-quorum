# FCC Coston2 Operational Baseline

> Status: Phase 0 machine-registration checks are in progress, derived from the
> project-owner-supplied
> [FCC redeploy message](original/fcc-coston2-redeploy-message.md) and current
> official FCC sources. The live manager and core protocol discovery checks
> pass. VeilBid extension `66007`, its foundation sender, and simulated code
> version `v0.2.2` are registered on Coston2; no VeilBid TEE machine has reached
> `PRODUCTION` yet.

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

The group bulletin requires:

- current `main` for `fce-extension-scaffold`, `fce-sign`, or the applicable
  official example base;
- `tee-node` and `tee-proxy` from tested `develop` revisions;
- `tee-node >= v0.0.22`;
- new indexer credentials from the organizer's current pinned message.

Version names alone are insufficient. Gate 0 records exact commits, Go module
resolution, container digests, and a successful availability vote. If the
scaffold's resolved module is older than the bulletin minimum, the gate remains
blocked until a tested organizer-supported combination is pinned.

The foundation audit found this exact upstream drift:

- official scaffold `f48cafb889441a62e47c083f4be8dd7d3f456f83` and sign
  example `6df972c64d34efe1d4497f0eafe6792d1f0862dd` still pin
  `tee-node` `v0.0.21` and `tee-proxy` `v0.0.18`;
- selected `tee-node` commit
  `9090eccbae1111742bd83ef0601485d9503b4a13` is tagged `v0.0.23`;
- selected `tee-proxy` `develop` commit
  `0c6d016b09948cba9a508ba357e592eb6088fd1c` resolves `tee-node`
  `v0.0.23` and Go `1.25.8`.

The scaffold is therefore a reference, not a build-ready dependency snapshot.
VeilBid tests one wire-compatible node/proxy pair rather than combining their
independent latest tags. The proxy release
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

The VeilBid extension recipe at `apps/fcc-extension/Dockerfile` is pinned by
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
5. run `post-build`;
6. ensure registration invokes `register-tee -command rRap`;
7. verify the capital `R` generated a fresh attestation challenge;
8. save the new extension/machine identifiers only after on-chain confirmation.

Reusing a historical extension ID, machine record, challenge, or address is a
failure. Re-running `pre-build --force` casually is also forbidden because it
can detach a machine from the expected extension.

Steps 1–3 are now evidenced by
`evidence/coston2/fcc-extension-registration.json`: sender
`0xf522b863fb19496D21ac7D0D1d71435C1DDc2EdE` is explicitly bound to extension
`66007`. The allowed `v0.2.2` code/platform record is in
`evidence/coston2/fcc-code-version.json`. The three local machines share that
binding and image but have distinct identities; they remain local-only until
three stable public origins pass `pnpm flare:machines:preflight`.

The deployed V1 sender at `0x44A322A45e8D796d890271209D59d529501113B9`
remains public evidence of manager/constructor compatibility only. It is
unregistered and uses the scaffold's historical scan-based `setExtensionId()`;
do not register it. Public extension IDs were already above `65900` during the
2026-08-04 live check, so every fresh VeilBid sender uses the constant-time V2
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

Championship 2-of-3 operation requires one stable public origin and independent
machine identity per registered TEE unless the supported infrastructure defines
another routing model.

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

The machine record URL must equal the currently served stable URL. `PRODUCTION`
alone does not prove private ingress, sealed state, scoring correctness, or
multi-machine quorum.

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
therefore creates a new TEE ID even if the VeilBid sealed-bid volume survives.

Operational rules:

- never restart or recreate all three championship machines together;
- monitor the live `/info` identity and fail closed on any on-chain mismatch;
- treat one rotated identity as an unavailable member while the two surviving
  frozen identities remain usable for selection;
- re-run the supported `rRap` flow only for a replacement used by new tenders;
- never persist a raw identity key in `.env`, a Docker secret, or a host file;
- do not mark Gate B restart recovery passed until Flare supplies a supported
  sealed identity/state restore mechanism and live evidence verifies it.

The file-backed sealed-store test is still useful for handler state, but it is
not proof that the whole TEE machine can restart under the same identity.

## 8. Gate 0 pass record

Gate 0 cannot pass without all of:

- pinned official scaffold/example, `tee-node`, and `tee-proxy` commits;
- resolved manager address and live bytecode/interface check;
- organizer-current indexer credentials working without logging them;
- stable named HTTPS origin reachable and equal to the on-chain machine URL;
- fresh extension ID and machine ID;
- fresh `rRap` challenge;
- machine status `2` (`PRODUCTION`);
- one successful current-domain action result;
- explicit simulated-versus-hardware mode;
- sanitized evidence containing public identifiers only.

Three-machine availability, private ingress, and sealed recovery remain
separate feasibility gates. A one-machine `PRODUCTION` result does not satisfy
the championship quorum requirement.

The current partial live record is
`evidence/coston2/gate-0-foundations.json`. It is explicitly
`IN_PROGRESS`: source hashes, toolchains, manager interface, registry discovery,
FTestXRP binding, XRP/USD feed, indexer configuration, extension registration,
code-version allowlisting, and all three pinned FCC images pass. Stable proxy
reachability and three production machines remain blockers.
