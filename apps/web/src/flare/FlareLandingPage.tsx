import { coston2FlarePublicRelease } from "@veilbid/flare-bindings";
import { Link } from "react-router";
import { FlareLifecycleMarquee, FlareProcurementSignal } from "./FlareLandingVisuals";

const workspaces = [
  ["01", "PUBLIC", "Inspect finalized tender rules, receipt quorum, TEE binding, award proof, and settlement without a wallet.", "/flare", "EXPLORE PUBLIC STATE"],
  ["02", "BUYER", "Open an EVM recovery tender from a connected Coston2 wallet with the public brief hashed into the market.", "/flare?role=buyer", "OPEN BUYER"],
  ["03", "PRIVATE BIDS", "Submit a sealed vendor bid through the three-machine FCC ingress and keep commercial terms outside chain state.", "/flare?role=vendor", "OPEN PRIVATE BIDS"],
  ["04", "ACTIVITY", "Advance permissionless close and inspect relay-ready FCC checkpoints without choosing a winner in the browser.", "/flare?role=finalizer", "OPEN ACTIVITY"],
  ["05", "XRP TREASURY", "Prepare the XRP-native XRPL, FDC, and Smart Account funding handoff without placing an XRPL secret in VeilBid.", "/flare?role=treasury", "OPEN XRP TREASURY"],
  ["06", "AUDITOR", "Verify the public binding, commitments, result digest, payout, and remainder with no signer or reveal path.", "/flare?role=auditor", "OPEN AUDITOR"],
] as const;

export function FlareLandingPage() {
  const release = coston2FlarePublicRelease;
  return (
    <div className="marketing-page flare-marketing-page">
      <main className="landing-main" id="main-content">
        <section className="landing-hero flare-marketing-hero">
          <p className="eyebrow">CONFIDENTIAL PROCUREMENT / FLARE COSTON2</p>
          <h1>Private bids.<br /><em>Public awards.</em></h1>
          <div className="landing-lede">
            <div className="flare-marketing-signal"><FlareProcurementSignal /></div>
            <p>
              VeilBid makes public procurement rules easy to inspect while
              vendors seal price, delivery, warranty, and qualification terms
              to three fixed FCC TEEs. Two matching machines unlock one public
              FTestXRP award; losing offers never become browser or chain data.
            </p>
            <div className="hero-actions">
              <Link className="primary-button" to="/flare">EXPLORE TENDERS →</Link>
              <Link className="secondary-button" to="/docs">START WITH THE GUIDE</Link>
            </div>
            <p className="release-note">VERIFIED COSTON2 RELEASE · TEST ASSETS · WALLET OPTIONAL FOR EXPLORING</p>
          </div>
        </section>

        <FlareLifecycleMarquee />

        <section className="landing-proof-grid" aria-label="Flare protocol pillars">
          {[
            ["01", "PUBLIC RULES", "Ceiling, vendors, deadline, scoring weights, machine policy, and lifecycle remain inspectable."],
            ["02", "SEALED OFFERS", "Bid values, delivery, warranty, credentials, salts, and ciphertext never enter public state."],
            ["03", "THRESHOLD COMPUTE", "Every accepted bid needs three receipts; two exact result signatures are required to settle."],
            ["04", "XRP-NATIVE AWARD", "XRPL, FDC, Smart Account funding, FTSO pricing, and public FTestXRP settlement share one path."],
          ].map(([number, title, copy]) => (
            <article key={number}><span>{number}</span><h2>{title}</h2><p>{copy}</p></article>
          ))}
        </section>

        <section className="landing-flow">
          <div>
            <p className="eyebrow">ONE VERIFIABLE LIFECYCLE</p>
            <h2>Fund → Bid → Close → Compute → Settle</h2>
            <p>
              Public state coordinates the tender. FCC computes eligibility and
              comparison inside the fixed TEE set. The market accepts only a
              result bound to the frozen domain and signed by the registered
              machines.
            </p>
          </div>
          <ol>
            <li><strong>01 / TREASURY</strong><span>Build public rules and fund the exact FTestXRP ceiling through the supported XRP-native handoff.</span></li>
            <li><strong>02 / VENDORS</strong><span>Encrypt the commercial offer independently to each tender-fixed TEE before the deadline.</span></li>
            <li><strong>03 / FCC</strong><span>Rebuild the ordered root, validate eligibility, compare the sealed inputs, and sign the exact result domain.</span></li>
            <li><strong>04 / MARKET</strong><span>Verify two distinct matching signatures, mint the award receipt, pay the winner, and return the remainder.</span></li>
            <li><strong>05 / PUBLIC</strong><span>Inspect evidence at one finalized checkpoint without decryption capability, private keys, or mock fallback.</span></li>
          </ol>
        </section>

        <section className="workspace-showcase">
          <header>
            <p className="eyebrow">SIX WORKSPACES / ONE APP SHELL</p>
            <h2>Move from the brief to the proof.</h2>
            <p>Click TENDERS to enter the application. The tender room keeps operational controls in the left rail and the selected Flare workspace on the right.</p>
          </header>
          <div className="workspace-card-grid flare-workspace-card-grid">
            {workspaces.map(([number, title, copy, to, action]) => (
              <article key={title}><span>{number}</span><h3>{title}</h3><p>{copy}</p><Link to={to}>{action} →</Link></article>
            ))}
          </div>
        </section>

        <section className="landing-visibility">
          <div>
            <p className="eyebrow">KNOW WHAT OTHERS CAN SEE</p>
            <h2>Confidential competition. Public coordination.</h2>
          </div>
          <div className="visibility-grid">
            <article><strong>PUBLIC</strong><p>Buyer, approved participation, ceiling, deadline, rules hash, bid commitments, TEE identities, FTSO snapshot, winner, payout, remainder, and receipt.</p></article>
            <article><strong>SEALED IN TEE</strong><p>Losing prices, delivery and warranty terms, credentials, salts, intermediate eligibility, component scores, and ciphertext.</p></article>
            <article><strong>NOT COLLECTED</strong><p>XRPL seeds, EVM private keys, TEE keys, relay credentials, raw signatures, private reveal payloads, or browser-persisted bid data.</p></article>
          </div>
        </section>

        <section className="release-facts">
          <div><p className="eyebrow">CURRENT FLARE RELEASE</p><h2>Real Coston2 state. Explicit test boundaries.</h2></div>
          <dl>
            <div><dt>NETWORK</dt><dd>Flare Coston2 / chain 114</dd></div>
            <div><dt>CONFIDENTIAL COMPUTE</dt><dd>FCC extension {release.fcc.extensionId} with a 2-of-3 result threshold</dd></div>
            <div><dt>SETTLEMENT ASSET</dt><dd>Public FTestXRP escrow and ordinary public winner/remainder amounts</dd></div>
            <div><dt>VERIFICATION</dt><dd>Runtime, extension identity, machine fingerprints, result digest, and award receipt facts</dd></div>
          </dl>
        </section>

        <section className="landing-faq">
          <div><p className="eyebrow">BEFORE YOU START</p><h2>Common questions.</h2></div>
          <div>
            <details><summary>Do I need a wallet to inspect VeilBid?</summary><p>No. Public dossiers and Auditor evidence are wallet-free. Connect only for a Coston2 transaction or the XRP Treasury handoff.</p></details>
            <details><summary>Why is the app split into Public and Activity?</summary><p>Public is the wallet-free judge path. Activity/Public Finalizer exposes canonical lifecycle readiness and safe close/recovery actions without granting winner or decryption authority.</p></details>
            <details><summary>Can a buyer or finalizer choose the winner?</summary><p>No. The market settles only a result signed by two distinct tender-fixed FCC identities over the exact frozen domain.</p></details>
            <details><summary>Are losing bids private?</summary><p>Yes, within the documented TEE boundary. Public participation and the winning amount remain visible; losing commercial terms do not.</p></details>
          </div>
        </section>

        <section className="truth-panel">
          <div><p className="eyebrow">CURRENT RELEASE TRUTH</p><h2>Flare first. No historical claims mixed in.</h2></div>
          <div><p>The landing page describes the verified Coston2 target. The old Sepolia/Nox application remains isolated as historical regression material and is never used as Flare evidence.</p><div className="hero-actions"><Link className="primary-button" to="/flare">OPEN THE APP →</Link><Link className="text-link" to="/docs#flare-coston2">READ FLARE BOUNDARIES →</Link></div></div>
        </section>
      </main>
    </div>
  );
}
