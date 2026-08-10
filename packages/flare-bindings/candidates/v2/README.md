# FlareQuorum V2 candidate bindings

These ABI files are generated from the locally tested V2 contracts. They are
not a deployment manifest and deliberately contain no Coston2 addresses,
extension IDs, TEE identities, or live evidence.

The package root does not export this directory. Applications, the relay, and
the operator console must continue to consume the verified V1 bindings until a
V2 promotion bundle passes every requirement in
`tooling/flare/coston2-v2-release-plan.json`.

Regenerate with `pnpm flare:v2:prepare` and verify with
`pnpm flare:v2:prepare:check`.
