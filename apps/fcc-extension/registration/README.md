# FCC machine registration operator

This directory builds only the official scaffold's `register-tee` command from
the checksum-pinned commit in `tooling/flare/coston2-foundations.json`. Its Go
dependencies are realigned to VeilBid's selected `tee-node v0.0.23` and current
`go-flare-common` MachineManager ABI before the binary is built.

Build or verify the non-root linux/amd64 image with:

```bash
sg docker -c 'pnpm flare:registration:image:build'
sg docker -c 'pnpm flare:registration:image:verify'
```

The image contains no key, endpoint, addresses file, registration state, or
credential. Those inputs are mounted or injected only while registering a
specific machine. VeilBid's operator always invokes it with `-command rRap`
and a separate resumable state file per machine. Do not run registration until
all three stable HTTPS proxy origins pass local/public identity comparison.
