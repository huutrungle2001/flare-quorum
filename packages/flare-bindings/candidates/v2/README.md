# FlareQuorum V2 candidate bindings

These ABI files are generated from the locally tested V2 contracts. They are
not a deployment manifest and deliberately contain no Coston2 addresses,
extension IDs, TEE identities, or live evidence.

The package root does not export this staging directory. V2 has since passed
the promotion bundle in `tooling/flare/coston2-v2-release-plan.json`; current
applications consume the promoted copies under `generated/`, while this
address-free snapshot remains for reproducibility.

Regenerate with `pnpm flare:v2:prepare` and verify with
`pnpm flare:v2:prepare:check`.
