# FlareQuorum V2 staged release runbook

## Current status

V2 is the **verified, consumer-selected Coston2 release**. Market
`0xE1252D445ee86ED78C1da2bD5f1bF4a69bF476AC`, award receipt
`0xA0249F4204503dcB9FE3A3153d7D48936E7a4Ac3`, extension `66142`, governance,
and exactly three fresh production machines are recorded in sanitized Coston2
evidence. The refreshed three-vendor encrypted-bid success lifecycle and a second
one-result-endpoint outage recovery both pass. A live credential-negative drill
also proves all three machines reject the wrong issuer signature, sign those
rejections, and accept the corrected credential without consuming the sealed
slot. Refund tender `2` passed the undispatched refund gate, and tender `5`
passed the separate selection-expired refund gate after their real fixed grace
periods.

The post-dispatch drill reached `ComputePending` through a real FCC dispatch
with request ID
`0x080ce5ba3a636cd2e6abce426a0a1f57e26d4e09dfc6341b3b5727b48cf3ba12`
and subsequently proved exact escrow return with no award mint.

Web, relay, console, and `@flarequorum/flare-bindings` now use V2. The V1
manifest remains preserved at `coston2.v1.release.json`; the address-free V2
candidate directory remains unexported.

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
that immutable preparation artifact captured the historical state before the
refund lifecycle and promotion passed. It is not the current consumer manifest.

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
- providers POST cosigned instructions directly to the selected registered
  proxy at `/instruction` on external port `6664`; the proxy does not discover
  instructions from the indexer;
- require status `2`, an availability check younger than six hours, and exactly
  one active identity per stable public endpoint; and
- keep indexer database credentials only in the secret store. A TCP connection
  alone does not prove the MySQL handshake or query path is healthy. Indexer
  readiness is for current policy/indexed state, not provider delivery.

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

3. Bring up exactly three fresh V2 machines and run the endpoint preflight. It
   rejects any identity already frozen in V1:

   ```bash
   pnpm flare:v2:machines:preflight
   ```

4. Bind governance after all three `/info` envelopes report the same expected
   policy and before `rRap`; otherwise registration correctly reverts with
   `InvalidGovernanceHash`:

   ```bash
   pnpm flare:v2:governance:preflight
   pnpm flare:v2:governance:set
   ```

5. Register exactly the three preflighted machines with `rRap` and require the
   complete active set to reach status `2`:

   ```bash
   pnpm flare:v2:machines:preflight
   pnpm flare:v2:machines:register
   ```

6. Prove the live success path with encrypted ingress, three receipts, FCC
   selection, two matching result signers, FTestXRP settlement, and award mint:

   ```bash
   pnpm flare:v2:success:preflight
   pnpm flare:v2:success
   ```

7. Prove one-result-endpoint recovery. The command excludes machine 3 only from
   result collection; the other two frozen identities must still agree and
   finalize the three-vendor tender:

   ```bash
   pnpm flare:v2:recovery:preflight
   pnpm flare:v2:recovery
   ```

8. Prove credential rejection at private ingress. The command sends one
   domain-bound encrypted bid with the wrong issuer signature to each machine,
   verifies all three signed rejections, then retries the same canonical slot
   with the correct issuer signature and requires three signed receipts:

   ```bash
   pnpm flare:v2:credential-negative
   ```

   Evidence contains only public action IDs, machine IDs, the accepted
   commitment, and assertion booleans. It never records the credential,
   signature, plaintext, ciphertext, or service secret.

9. Prove the closed-but-undispatched refund path. This is intentionally
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

10. Recheck the complete bundle and record a verified side-by-side V2 release:

   ```bash
   pnpm flare:v2:promotion:check
   pnpm flare:v2:promotion:require-ready
   pnpm flare:v2:promote
   ```

   Promotion rechecks runtime bytecode, constructor arguments, live getters,
   the registry-resolved FTSO address, extension sender, exact active machines,
   the success, outage-recovery, credential-negative, and refund lifecycle
   records. It sends no on-chain transaction.

### Optional post-dispatch refund drill

The post-dispatch drill uses a separate ignored state file and a separate
evidence target. It creates a short-deadline tender, closes it, performs a real
FCC selection dispatch, deliberately submits no result, then waits for the
fixed first-dispatch grace. Retries cannot extend this clock.

```bash
pnpm flare:v2:selection-refund:preflight
pnpm flare:v2:selection-refund
```

`PASSED` requires `ComputePending` before refund, a nonzero request ID,
`SelectionExpired`, exact FTestXRP escrow return, and no award mint. This proof
adds stateful fault breadth but never becomes a substitute for the mandatory
undispatched-refund lifecycle.

## Consumer switch record

The promotion-stage artifact remains immutable with `consumerSelectable:
false`. After explicit approval and full gate verification, the canonical
manifest and public bindings selected V2; V1 was copied to a dedicated
historical manifest before the switch. Relay deployment precedes web deployment
so the browser never points at an unready ingress.

Before promotion, any `NOT RUN`, `BLOCKED`, or `WAITING` result remains evidence
of the actual historical state and must not be replaced with synthetic success.
