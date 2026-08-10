# Chain Bindings

> Historical baseline: these bindings are canonical only for the Sepolia/Nox
> release. Planned Flare consumers will use a separate
> `packages/flare-bindings` package.

Generated ABI/address snapshots and shared event, index, readiness, and domain
types. Generated content comes only from canonical production artifacts and
deployments under `packages/contracts`.

Run `pnpm bindings:generate` at the repository root after compiling the
historical market workspace. `pnpm bindings:check` fails when committed JSON differs from
the canonical artifacts or deployment manifest.

Runtime consumers use the verified `sepolia.release` snapshot. The separate
`sepolia.test` snapshot remains deliberately marked `verified: false` for
reusable historical E2E checks and must not be relabeled as a release.
