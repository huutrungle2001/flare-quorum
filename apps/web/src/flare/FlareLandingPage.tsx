import { coston2FlarePublicRelease } from "@flarequorum/flare-bindings";
import { Link } from "react-router";
import { FlareLifecycleMarquee, FlareProcurementSignal } from "./FlareLandingVisuals";

const workspaces = [
  ["01", "PUBLIC", "Explore every tender and inspect its brief, rules, lifecycle, quorum, award, and settlement without a wallet.", "/flare", "EXPLORE PUBLIC STATE"],
  ["02", "BUYER", "Publish one brief and fund it directly with FTestXRP or through the advanced XRPL, FDC, and Smart Account path.", "/flare?role=buyer", "OPEN BUYER"],
  ["03", "PRIVATE BIDS", "Enter commercial terms in one active session, encrypt them to the fixed FCC machines, and track your public receipt.", "/flare?role=vendor", "OPEN PRIVATE BIDS"],
  ["04", "ACTIVITY", "Advance permissionless close checkpoints and monitor FCC readiness without choosing or decrypting the winner.", "/flare?role=finalizer", "OPEN ACTIVITY"],
  ["05", "AUDITOR", "Verify the frozen trust binding, bid commitments, result digest, payout, and remainder through a read-only path.", "/flare?role=auditor", "OPEN AUDITOR"],
] as const;

function shortAddress(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export function FlareLandingPage() {
  const release = coston2FlarePublicRelease;
  const marketExplorer = `https://coston2-explorer.flare.network/address/${release.market}`;

  return (
    <div className="marketing-page flare-marketing-page">
      <main className="landing-main" id="main-content">
        <section className="landing-hero flare-marketing-hero">
          <p className="eyebrow">CONFIDENTIAL PROCUREMENT / FLARE COSTON2</p>
          <h1>Private bids.<br /><em>Public awards.</em></h1>
          <div className="landing-lede">
            <div className="flare-marketing-signal"><FlareProcurementSignal /></div>
            <p>
              Run competitive procurement without publishing every vendor&apos;s
              losing price. Buyers publish the brief, rules, and budget; vendors
              encrypt their terms to three fixed FCC machines. The market settles
              only after two machines sign the same result.
            </p>
            <div className="hero-actions">
              <Link className="primary-button" to="/flare">EXPLORE LIVE TENDERS →</Link>
              <Link className="secondary-button" to="/flare?role=auditor">VIEW LIVE EVIDENCE →</Link>
            </div>
            <Link className="hero-guide-link" to="/docs">New here? Start with the guide →</Link>
            <p className="release-note">V2 · COSTON2 TESTNET · 3 SIMULATED TEES · 2-OF-3 RESULT · UNAUDITED</p>
          </div>
        </section>

        <FlareLifecycleMarquee />

        <section className="landing-flow">
          <div>
            <p className="eyebrow">ONE TENDER / FIVE CHECKPOINTS</p>
            <h2>From XRP funding to a public award.</h2>
            <p>
              Public state coordinates the tender. FCC performs eligibility,
              comparison, and selection inside the fixed machine set. Every
              checkpoint remains bound to the same rules and tender domain.
            </p>
          </div>
          <ol>
            <li><strong>01 / PUBLISH</strong><span>The buyer publishes the brief, scoring rules, approved vendors, deadline, and machine policy.</span></li>
            <li><strong>02 / FUND</strong><span>Escrow FTestXRP directly, or complete XRPL Payment → FDC proof → Smart Account funding.</span></li>
            <li><strong>03 / BID</strong><span>Each approved vendor encrypts one offer independently to three frozen FCC machines and earns three signed receipts.</span></li>
            <li><strong>04 / COMPUTE</strong><span>The market freezes the FTSO snapshot; FCC checks eligibility, compares sealed inputs, and produces one threshold result.</span></li>
            <li><strong>05 / SETTLE</strong><span>The market verifies two matching machine signatures, pays the winner, returns the remainder, and publishes the receipt.</span></li>
          </ol>
        </section>

        <section className="release-facts">
          <div><p className="eyebrow">VERIFIED V2 RELEASE</p><h2>Real Coston2 state. Clear test boundaries.</h2></div>
          <dl>
            <div><dt>V2 MARKET</dt><dd><a href={marketExplorer} target="_blank" rel="noreferrer">{shortAddress(release.market)} ↗</a> · Flare Coston2 / chain {release.chainId}</dd></div>
            <div><dt>FCC QUORUM</dt><dd>Extension {release.fcc.extensionId} · 3 simulated Coston2 TEEs · 3 receipts per accepted bid · {release.fcc.resultThreshold} matching results</dd></div>
            <div><dt>XRP FUNDING</dt><dd>External XRPL Payment → FDC proof → Smart Account direct mint and funded tender</dd></div>
            <div><dt>SETTLEMENT</dt><dd>FTSO XRP/USD snapshot · public FTestXRP winner payment, remainder or refund, and award receipt</dd></div>
            <div><dt>BOUNDARY</dt><dd>Testnet assets · SIMULATED_TEE=true · unaudited hackathon software, not production infrastructure</dd></div>
          </dl>
        </section>

        <section className="workspace-showcase">
          <header>
            <p className="eyebrow">FIVE WORKSPACES / ONE APP SHELL</p>
            <h2>Use only the workspace you need.</h2>
            <p>Start in Public for a wallet-free overview. Connect only when your role needs to create, fund, bid, or advance an on-chain checkpoint.</p>
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
            <article><strong>PUBLIC</strong><p>Brief, rules, approved participation, ceiling, deadline, commitments, signed receipts, machine identities, FTSO snapshot, threshold result, winner, payout, remainder, and award receipt.</p></article>
            <article><strong>PRIVATE / ENCRYPTED</strong><p>Price, delivery, warranty, credentials, and salt exist in the active vendor session, then are encrypted separately to each fixed TEE. Losing terms are evaluated only inside that boundary and are never published.</p></article>
            <article><strong>NEVER COLLECTED</strong><p>XRPL seeds, EVM private keys, TEE private keys, relay or proxy credentials, and wallet private signing material. Plaintext or ciphertext bids are never persisted in browser storage.</p></article>
          </div>
        </section>

        <section className="landing-faq">
          <div><p className="eyebrow">BEFORE YOU START</p><h2>Common questions.</h2></div>
          <div>
            <details><summary>Do I need a wallet to inspect FlareQuorum?</summary><p>No. Public dossiers and Auditor evidence are wallet-free. Connect only for a Coston2 transaction or the XRP-native funding handoff.</p></details>
            <details><summary>Is this a mainnet or production release?</summary><p>No. V2 is a verified Coston2 testnet release using FTestXRP and three simulated TEE identities. It is unaudited hackathon software.</p></details>
            <details><summary>How does XRP-funded tender creation work?</summary><p>Your external XRPL wallet signs the Payment. FDC proves it on Flare, a Smart Account completes the mint and funding job, and success means a funded tender exists. FlareQuorum never asks for the XRPL seed.</p></details>
            <details><summary>Why is the app split into Public and Activity?</summary><p>Public is the wallet-free inspection path. Activity exposes canonical lifecycle readiness and safe close or recovery actions without winner-selection or decryption authority.</p></details>
            <details><summary>Can a buyer or finalizer choose the winner?</summary><p>No. The market settles only a result signed by two distinct tender-fixed FCC identities over the exact frozen domain.</p></details>
            <details><summary>What can a vendor see after submitting?</summary><p>The vendor can track the public commitment and receipt quorum in My Submission. The browser does not save the plaintext price, delivery, warranty, credentials, salt, or ciphertext for later review.</p></details>
          </div>
        </section>

        <section className="truth-panel">
          <div><p className="eyebrow">READY TO VERIFY</p><h2>Inspect the evidence before connecting.</h2></div>
          <div><p>Open a public tender for the product journey, or use Auditor to check the V2 market, frozen machine binding, commitments, result signatures, and settlement. Neither path needs a wallet or bid-decryption capability.</p><div className="hero-actions"><Link className="primary-button" to="/flare">EXPLORE TENDERS →</Link><Link className="text-link" to="/flare?role=auditor">OPEN AUDITOR →</Link></div></div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-brand"><span className="wordmark inverted">FLAREQUORUM</span><p>Private bids. Public awards.</p></div>
        <nav className="landing-footer-links" aria-label="Landing page links">
          <Link to="/flare">PUBLIC TENDERS</Link>
          <Link to="/flare?role=auditor">LIVE EVIDENCE</Link>
          <Link to="/docs">GUIDE</Link>
          <a href="https://github.com/huutrungle2001/flare-quorum" target="_blank" rel="noreferrer">GITHUB ↗</a>
        </nav>
        <p className="footer-meta"><span>FLARE COSTON2 / 114</span><span>V2 · 3 SIMULATED TEES · 2-OF-3 RESULT</span><span>TEST ASSETS ONLY · UNAUDITED</span></p>
      </footer>
    </div>
  );
}
