# FCC machine registration operator

This directory builds only the official scaffold's `register-tee` command from
the checksum-pinned commit in `tooling/flare/coston2-foundations.json`. Its Go
dependencies are built unchanged from that scaffold's `tools/go.mod`: `tee-node
v0.0.24` and the matching `go-flare-common` MachineManager ABI. The operator
does not independently rewrite the upstream dependency graph.

Build or verify the non-root linux/amd64 image with:

```bash
sg docker -c 'pnpm flare:registration:image:build'
sg docker -c 'pnpm flare:registration:image:verify'
```

The image contains no key, endpoint, addresses file, registration state, or
credential. Those inputs are mounted or injected only while registering a
specific machine. FlareQuorum's operator always invokes it with `-command rRap`
and a separate resumable state file per machine. Do not run registration until
all three stable HTTPS proxy origins pass local/public identity comparison.
