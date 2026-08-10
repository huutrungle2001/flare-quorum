# FlareQuorum V2 staged release runbook

## Current status

V2 is **prepared locally and not deployed**. Its source, bytecode, candidate
ABIs, deployment tooling, FCC registration profile, machine/governance profile,
success lifecycle, bounded-refund lifecycle, and promotion gate are available.
No V2 address, extension ID, TEE identity, lifecycle result, or verified-release
claim exists yet.

The verified V1 Coston2 release remains the only consumer-selectable release.
Web, relay, console, and `@flarequorum/flare-bindings` continue to use V1. The
V2 candidate directory is intentionally not exported from that package.

## Safety boundary

- Never reuse, pause, retire, or rewrite one of the three verified V1 machine
  identities while bringing up V2.
- Never point a V2 machine at a V1 extension ID or reuse a V1 public endpoint.
- Every write-capable command has an explicit execution form; its preflight
  form sends no transaction.
- Write-capable commands require a clean worktree. Commit or otherwise resolve
  existing operator work before the live window; scripts do not stash it.
- Candidate and release artifacts use V2-only paths listed in
  `tooling/flare/coston2-v2-release-plan.json`.
- Do not copy indexer credentials, proxy keys, direct API keys, deployment keys,
  or TEE keys into manifests, evidence, logs, commands, or documentation.

## Prepared artifacts

Run the local preparation gate after compiling the contracts:

```bash
pnpm flare:v2:prepare
pnpm flare:v2:prepare:check
pnpm flare:slither:v2
```

The generated candidate manifest is address-free and records
`consumerSelectable: false`. Local readiness is recorded as `PARTIAL`, because
live facts are intentionally absent.

## Live prerequisites

Provision three new proxy/node services exclusively for V2. Each service needs
its own TEE/proxy private material and direct API key. Configure these variables
locally or in the deployment platform; do not commit their values:

```text
COSTON2_RPC_URL
FLARE_DEPLOYMENT_PRIVATE_KEY
FLARE_FCC_V2_PROXY_URLS
FCC_V2_PROXY_CONTROL_URLS
FCC_V2_NORMAL_PROXY_URL
FCC_V2_DIRECT_API_KEY_1
FCC_V2_DIRECT_API_KEY_2
FCC_V2_DIRECT_API_KEY_3
FCC_V2_GOVERNANCE_SIGNERS
FCC_V2_GOVERNANCE_THRESHOLD
```

`FCC_V2_EXTENSION_ID` is written to the local environment only after a fresh
extension registration succeeds. `FCC_V2_TEE_IDS` is written only after the
exact three-machine set is verified.

Operational constraints learned from the current FCC Coston2 deployment also
apply:

- resolve protocol contracts through the Flare registry and reject registry
  drift rather than trusting stale documentation addresses;
- use the current FCC scaffold and `tee-node >= v0.0.22`;
- use three stable HTTPS proxy origins (named Cloudflare tunnels, reserved
  domains, or equivalent), never changing quick-tunnel hostnames;
- verify the URL stored on-chain is the URL currently serving `/info`;
- the extension proxy pulls instructions from the indexer database and the node
  polls that proxy; port `6664` is inbound for cosigned responses, not an
  instruction-delivery endpoint; and
- keep indexer database credentials only in the secret store. A TCP connection
  alone does not prove the MySQL handshake or query path is healthy.

`SIMULATED_TEE=true` remains a Coston2 feasibility configuration. It must not be
described as hardware-backed production confidentiality.

## Release sequence

Run one stage at a time and commit its public-safe evidence before proceeding.
Use each preflight first.

1. Deploy the immutable V2 candidate alongside V1:

   ```bash
   pnpm flare:v2:deploy:preflight
   pnpm flare:v2:deploy
   ```

2. Register a fresh FCC extension whose instruction sender is exactly the new
   V2 market:

   ```bash
   pnpm flare:v2:extension:preflight
   pnpm flare:v2:extension:register
   ```

3. Bring up and register exactly three fresh V2 machines with `rRap`. The
   preflight rejects any identity already frozen in V1:

   ```bash
   pnpm flare:v2:machines:preflight
   pnpm flare:v2:machines:register
   ```

4. Bind governance only after all three `/info` envelopes report the same
   expected policy:

   ```bash
   pnpm flare:v2:governance:preflight
   pnpm flare:v2:governance:set
   ```

5. Prove the live success path with encrypted ingress, three receipts, FCC
   selection, two matching result signers, FTestXRP settlement, and award mint:

   ```bash
   pnpm flare:v2:success:preflight
   pnpm flare:v2:success
   ```

6. Prove the closed-but-undispatched refund path. This is intentionally
   resumable and never fabricates elapsed time:

   ```bash
   pnpm flare:v2:refund:preflight
   pnpm flare:v2:refund
   ```

   The first execution creates a short-deadline tender, the next eligible run
   closes it without calling `requestSelection`, and a run after the on-chain
   24-hour grace refunds it. Each early invocation returns `WAITING` with the
   chain timestamp at which it can resume. `PASSED` requires full escrow return,
   `UndispatchedTimeout`, no request ID, and no award receipt.

7. Recheck the complete bundle and record a verified side-by-side V2 release:

   ```bash
   pnpm flare:v2:promotion:check
   pnpm flare:v2:promotion:require-ready
   pnpm flare:v2:promote
   ```

   Promotion rechecks runtime bytecode, constructor arguments, live getters,
   the registry-resolved FTSO address, extension sender, exact active machines,
   and both lifecycle records. It sends no on-chain transaction.

## Consumer switch is a separate decision

Even after V2 promotion, the recorded V2 release has
`consumerSelectable: false` and V1 remains the application default. Switching
web, relay, console, or the public binding manifest requires a separate user
approval, consumer migration, full validation, and rollback review. Do not
silently rewrite the existing V1 manifest.

Until every live stage passes, describe V2 as **planned**, **local candidate**,
or **not yet verified**. A `NOT RUN`, `BLOCKED`, or `WAITING` result is evidence
of the actual state and must not be replaced with a synthetic success.
