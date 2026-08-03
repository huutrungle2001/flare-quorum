# FCC Coston2 Operational Baseline

> Status: Phase 0 pre-deployment checks are in progress, derived from the
> project-owner-supplied
> [FCC redeploy message](original/fcc-coston2-redeploy-message.md) and current
> official FCC sources. The live manager and core protocol discovery checks
> pass; no VeilBid extension or TEE is registered yet.

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

The 2026-08-03 foundation audit found this exact upstream drift:

- official scaffold `f48cafb889441a62e47c083f4be8dd7d3f456f83` and sign
  example `6df972c64d34efe1d4497f0eafe6792d1f0862dd` still pin
  `tee-node` `v0.0.21` and `tee-proxy` `v0.0.18`;
- selected `tee-node` `develop` commit
  `adc67a29eb7162f6f1b5dabcbca320009480695e` is tagged `v0.0.24`;
- selected `tee-proxy` `develop` commit
  `0c6d016b09948cba9a508ba357e592eb6088fd1c` resolves `tee-node`
  `v0.0.23` and Go `1.25.8`.

The scaffold is therefore a reference, not a build-ready dependency snapshot.
VeilBid must upgrade and test the node/proxy pins when instantiating the
extension. The canonical public pin set and repeatable live checks are in
`tooling/flare/coston2-foundations.json` and `pnpm flare:foundations:check`.

## 3. Fresh registration workflow

Because the redeploy may have cleared prior registrations:

1. start without a reused `config/extension.env`;
2. run `pre-build` to create a fresh `EXTENSION_ID` and instruction sender;
3. start the current TEE/proxy stack against Coston2;
4. run `post-build`;
5. ensure registration invokes `register-tee -command rRap`;
6. verify the capital `R` generated a fresh attestation challenge;
7. save the new extension/machine identifiers only after on-chain confirmation.

Reusing a historical extension ID, machine record, challenge, or address is a
failure. Re-running `pre-build --force` casually is also forbidden because it
can detach a machine from the expected extension.

## 4. Stable public proxy URL

Each registered machine requires a stable HTTPS endpoint whose hostname remains
valid across restarts:

- named Cloudflare Tunnel; or
- reserved ngrok domain; or
- another organizer-approved stable HTTPS origin.

Do not register a `trycloudflare` quick-tunnel hostname. Before and after
registration, compare on-chain machine URL with `EXT_PROXY_URL` and verify the
same `/info` response through local and public origins. If a URL rotates, update
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

## 7. Gate 0 pass record

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
FTestXRP binding, and XRP/USD feed pass, while Docker, digest-pinned tee-proxy
images, stable proxy reachability, indexer access, and three production machines
remain blockers.
