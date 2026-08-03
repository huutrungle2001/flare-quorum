# FCC on Coston2 — Original Redeploy Message

> Source: Telegram/group-chat message supplied by the project owner on
> 2026-08-03. Preserved verbatim below as operational input. This is not a
> canonical release manifest; live values must still be checked against the
> official scaffold configuration and Coston2 before deployment.

📌 FCC on Coston2 — read this before asking about register-tee / 404s

Coston2 FCC was redeployed. Almost every FCC issue posted this week is a stale stack
still talking to the old deployment.

Live FlareTeeManager: 0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE
Old, dead since 22 Jul: 0x004224fa…5d41F → this is what gives you
FunctionNotFound, only reward offers manager, and register() reverts.

The availability check and the Coston2 data providers are working — a simulated TEE
reaches PRODUCTION in seconds on a current stack. If yours is stuck, it's client-side.

Fix, in order:

1. Pull latest main on the scaffold / fce-sign / fce-weather-insurance. Repos are on
GitHub with the fce- prefix. tee-node + tee-proxy on develop (tee-node ≥ v0.0.22)
— older versions get every data-provider vote rejected, so your main queue stays
empty forever. Own extension on an older base? Rebase onto latest main.

2. The redeploy might have wiped all registrations. Re-run pre-build for a fresh
EXTENSION_ID, then post-build. Use register-tee -command rRap (capital R = fresh
challenge).

3. Don't register a trycloudflare quick tunnel. Data providers push to the URL
stored on-chain, and quick-tunnel hostnames change on restart. Machines stuck at
INITIALIZED right now have dead hostnames on-chain. Use a named cloudflared tunnel or
a reserved ngrok domain. Tunnel rotated? Update EXT_PROXY_URL, re-run post-build.

4. Check your own state first — 30 seconds, tells you which side is broken:
cast call 0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE "getTeeMachine(address)((address,address,string))" <teeId>
→ is that URL the one you're serving right now?
cast call 0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE "getTeeMachineStatus(address)(uint8)" <teeId>
→ 1 = INITIALIZED, 2 = PRODUCTION

SIMULATED_TEE=true on Coston2 is fine for judging. GCP Confidential Space is not
required. Indexer DB creds: pinned message (the indexer-reader ones in old docs are
dead).

Guides are still catching up to the redeploy.
