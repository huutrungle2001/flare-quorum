import { Link } from "react-router";
import {
  NoxOrbMascot,
  TreasuryCrewMascot,
  VeilScoutMascot,
} from "./LandingMascots";

const workspaces = [
  {
    title: "PUBLIC",
    copy: "Inspect confirmed tender terms, bid counts, lifecycle state, winner receipts, and transaction evidence without a wallet; recent records are marked until finality.",
    to: "/room",
    action: "EXPLORE PUBLIC STATE",
  },
  {
    title: "EOA BUYER",
    copy: "Use the default Buyer view to create an exactly funded tender directly from the connected wallet, with confidential bidding and automatic post-finalization review.",
    to: "/room?role=buyer",
    action: "OPEN EOA BUYER",
  },
  {
    title: "SAFE BUYER",
    copy: "Select any owned Safe, deposit confidential funds, approve public terms through its threshold, and create a Safe-owned tender.",
    to: "/room?role=buyer&buyer=safe",
    action: "OPEN SAFE BUYER",
  },
  {
    title: "PRIVATE BIDS",
    copy: "Use Submit Bid, My Bid, and Granted Access to submit a sealed price, reveal or share your own bid, or review a bid authorized for this wallet.",
    to: "/room?role=private-bids",
    action: "OPEN PRIVATE BIDS",
  },
  {
    title: "ACTIVITY",
    copy: "Monitor automatic close, winner-proof, and settlement progress; use the manual fallback only when automation is delayed or interrupted.",
    to: "/room?role=activity",
    action: "OPEN ACTIVITY",
  },
];

export function LandingPage() {
  return (
    <div className="marketing-page">
      <main className="landing-main" id="main-content">
        <section className="landing-hero">
          <p className="eyebrow">CONFIDENTIAL PROCUREMENT / SAFE TREASURIES</p>
          <h1>
            Lowest valid bid.
            <br />
            <em>Without publishing prices.</em>
          </h1>
          <div className="landing-lede">
            <div className="landing-mascot landing-mascot-hero">
              <VeilScoutMascot />
            </div>
            <p>
              FlareQuorum combines public tender rules, encrypted vendor bids,
              Nox-computed selection, proof-derived awards, and confidential
              ERC-7984 settlement on Ethereum Sepolia. Buyers can start with
              a direct wallet or use a Safe treasury for threshold authority.
            </p>
            <div className="hero-actions">
              <Link className="primary-button" to="/room">
                EXPLORE TENDERS →
              </Link>
              <Link className="secondary-button" to="/docs">
                START WITH THE GUIDE
              </Link>
            </div>
            <p className="release-note">
              LIVE ON SEPOLIA · TEST ASSETS · WALLET OPTIONAL FOR EXPLORING
            </p>
          </div>
        </section>

        <section className="landing-proof-grid" aria-label="Protocol pillars">
          {[
            ["01", "PUBLIC RULES", "Tender terms, deadlines, bidders, status, winner, and transaction evidence remain inspectable."],
            ["02", "PRIVATE PRICES", "Bid values and confidential payment amounts remain Nox handles rather than a plaintext shadow ledger."],
            ["03", "SAFE AUTHORITY", "Preparation can bind encrypted inputs, but only a threshold-authorized Safe transaction can move Safe-owned funds."],
            ["04", "PROOF-DERIVED AWARD", "The market verifies the publicly decrypted winner ID and settles against the stored vendor—never a client-supplied winner."],
          ].map(([number, title, copy]) => (
            <article key={number}>
              <span>{number}</span>
              <h2>{title}</h2>
              <p>{copy}</p>
            </article>
          ))}
        </section>

        <section className="landing-flow">
          <div>
            <p className="eyebrow">ONE VERIFIABLE LIFECYCLE</p>
            <h2>Fund → Bid → Close → Prove → Settle</h2>
            <p>
              Public state coordinates the process. Confidential computation
              decides the result. On-chain verification binds the result to
              settlement.
            </p>
            <div className="landing-mascot landing-mascot-nox">
              <NoxOrbMascot />
            </div>
          </div>
          <ol>
            <li><strong>01 / BUYER</strong><span>Publishes terms, approves vendors, and escrows exactly the public ceiling.</span></li>
            <li><strong>02 / VENDORS</strong><span>Submit encrypted prices into fixed public slots before the deadline.</span></li>
            <li><strong>03 / NOX</strong><span>Selects the earliest valid minimum while all bid values stay encrypted.</span></li>
            <li><strong>04 / PROOF</strong><span>Only the encrypted winner ID is deliberately opened and verified on-chain.</span></li>
            <li><strong>05 / ANYONE</strong><span>Permissionlessly finalizes confidential payment or the full encrypted refund path.</span></li>
          </ol>
        </section>

        <section className="workspace-showcase">
          <header>
            <p className="eyebrow">FOUR WORKSPACES / TWO BUYER VIEWS</p>
            <h2>Follow the lifecycle from either side.</h2>
            <p>
              Start in Public mode to inspect the release. Connect a compatible
              browser wallet only when a workspace needs a signature.
            </p>
          </header>
          <div className="workspace-card-grid">
            {workspaces.map((workspace, index) => (
              <article key={workspace.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{workspace.title}</h3>
                <p>{workspace.copy}</p>
                <Link to={workspace.to}>{workspace.action} →</Link>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-visibility">
          <div>
            <p className="eyebrow">KNOW WHAT OTHERS CAN SEE</p>
            <h2>Confidential price. Public coordination.</h2>
            <div className="landing-mascot landing-mascot-treasury">
              <TreasuryCrewMascot />
            </div>
          </div>
          <div className="visibility-grid">
            <article>
              <strong>PUBLIC</strong>
              <p>
                Tender identity, buyer, approved vendor addresses, public
                ceiling, deadline, status, winner, transaction hashes, and
                receipt IDs.
              </p>
            </article>
            <article>
              <strong>CONFIDENTIAL</strong>
              <p>
                Bid values, best price, settlement and refund amounts, and
                confidential balances remain encrypted by default.
              </p>
            </article>
            <article>
              <strong>SELECTIVE</strong>
              <p>
                A stored bid can be disclosed only to its vendor or an
                explicitly authorized per-handle viewer.
              </p>
            </article>
          </div>
        </section>

        <section className="release-facts">
          <div>
            <p className="eyebrow">CURRENT RELEASE</p>
            <h2>A working testnet path, not a mock.</h2>
          </div>
          <dl>
            <div><dt>NETWORK</dt><dd>Ethereum Sepolia / chain 11155111</dd></div>
            <div><dt>CONFIDENTIAL COMPUTE</dt><dd>iExec Nox in the real close and settlement path</dd></div>
            <div><dt>ASSET MODEL</dt><dd>ERC-7984 confidential test vUSDC with internal market custody</dd></div>
            <div><dt>VERIFICATION</dt><dd>Source/runtime mappings and two-vendor lifecycle evidence</dd></div>
          </dl>
        </section>

        <section className="landing-faq">
          <div>
            <p className="eyebrow">BEFORE YOU START</p>
            <h2>Common questions.</h2>
          </div>
          <div>
            <details>
              <summary>Do I need a wallet to inspect FlareQuorum?</summary>
              <p>No. Public tender state is wallet-free. Connect only for Safe Buyer, EOA Buyer, Private Bids, or Activity actions.</p>
            </details>
            <details>
              <summary>Which wallets work?</summary>
              <p>The app discovers EIP-6963 compatible browser wallets and lets you explicitly choose among every detected provider.</p>
            </details>
            <details>
              <summary>Are vendor identities private?</summary>
              <p>No. Vendor addresses and transaction timing are public. FlareQuorum protects bid and settlement values, not transaction-graph metadata.</p>
            </details>
            <details>
              <summary>Can the buyer change the winner?</summary>
              <p>No. The winner is produced by confidential comparison and accepted only after the public winner-ID proof verifies on-chain.</p>
            </details>
            <details>
              <summary>When should I use EOA Buyer or Safe Buyer?</summary>
              <p>EOA Buyer is the default and needs fewer signatures. Safe Buyer separates treasury funds from a personal wallet and applies the Safe’s configured owner threshold to treasury actions.</p>
            </details>
            <details>
              <summary>Does a multi-owner Safe divide funds among its owners?</summary>
              <p>No. Owners approve actions; they are not automatic beneficiaries. Tender settlement pays the stored vendor, while any separate Safe withdrawal still needs the configured threshold.</p>
            </details>
          </div>
        </section>

        <section className="truth-panel">
          <div>
            <p className="eyebrow">CURRENT RELEASE TRUTH</p>
            <h2>Real Sepolia state. Explicit test boundaries.</h2>
          </div>
          <div>
            <p>
              The canonical release has exact source/runtime mappings and a
              real two-vendor Safe lifecycle on Ethereum Sepolia. FlareQuorum does
              not claim anonymous bidders, hidden metadata, formal auditing,
              or mainnet readiness.
            </p>
            <div className="hero-actions">
              <Link className="primary-button" to="/room">OPEN THE APP →</Link>
              <Link className="text-link" to="/docs#boundaries">READ ALL BOUNDARIES →</Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
