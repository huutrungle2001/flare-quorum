import { Link } from "react-router";

const navItems = [
  ["flare-coston2", "FLARE COSTON2"],
  ["overview", "OVERVIEW"],
  ["quick-start", "QUICK START"],
  ["public", "PUBLIC EXPLORER"],
  ["buyer", "EOA BUYER"],
  ["vendor", "PRIVATE BIDS"],
  ["activity", "CLOSE & RECOVERY"],
  ["safe", "SAFE BUYER"],
  ["architecture", "ARCHITECTURE"],
  ["privacy", "PRIVACY"],
  ["evidence", "VERIFICATION"],
  ["troubleshooting", "TROUBLESHOOTING"],
  ["boundaries", "BOUNDARIES"],
] as const;

function StepList({
  steps,
}: {
  steps: readonly { title: string; copy: string }[];
}) {
  return (
    <ol className="docs-steps">
      {steps.map((step, index) => (
        <li key={step.title}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <div>
            <h3>{step.title}</h3>
            <p>{step.copy}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function DocsPage() {
  return (
    <div className="marketing-page docs-page">
      <main className="docs-main" id="main-content">
        <aside className="docs-nav" aria-label="Documentation sections">
          <strong>ON THIS PAGE</strong>
          {navItems.map(([id, label]) => (
            <a href={`#${id}`} key={id}>{label}</a>
          ))}
        </aside>
        <article className="docs-content">
          <section id="flare-coston2">
            <p className="eyebrow">FLAREQUORUM FLARE / COSTON2 · CURRENT JUDGE PATH</p>
            <h1>Public evidence.<br /><em>Private computation.</em></h1>
            <p className="docs-lede">
              The verified Summer Signal release runs on Flare Coston2. Buyers
              fund public FTestXRP rules, vendors encrypt bids to a fixed FCC
              quorum, and the market accepts only a threshold-signed result.
              FTSO, FAssets, FDC, and Smart Account bindings are visible as
              public protocol facts; private bid payloads never enter this UI.
            </p>
            <div className="docs-callout">
              <strong>USE THE CURRENT RELEASE</strong>
              <p>
                Start wallet-free, then connect only when a buyer or vendor
                write is intentional. The Activity/Evidence ledger rereads
                finalized Coston2 state and never falls back to Sepolia or
                mock success.
              </p>
            </div>
            <div className="docs-actions">
              <Link className="primary-button" to="/">OPEN COSTON2 DOSSIERS →</Link>
              <a className="secondary-button" href="/?role=evidence">OPEN ACTIVITY LEDGER →</a>
              <a className="secondary-button" href="/?role=buyer">OPEN BUYER →</a>
              <a className="secondary-button" href="/?role=vendor">OPEN VENDOR →</a>
            </div>
          </section>
          <section id="overview">
            <p className="eyebrow">HISTORICAL BASELINE / SEPOLIA + NOX</p>
            <h1>Use FlareQuorum from tender to settlement.</h1>
            <p className="docs-lede">
              FlareQuorum is a confidential procurement protocol for Safe
              treasuries. Buyers publish rules and escrow a public ceiling;
              approved vendors submit encrypted bids; iExec Nox selects the
              earliest valid minimum; the market verifies a public winner-ID
              proof before confidential settlement.
            </p>
            <div className="docs-callout">
              <strong>TESTNET NOTICE</strong>
              <p>
                This release runs on Ethereum Sepolia with test assets. Never
                paste a private key into the app. Wallet signatures remain in
                your selected browser wallet.
              </p>
            </div>
          </section>

          <section id="quick-start">
            <p className="eyebrow">QUICK START</p>
            <h2>Inspect first. Connect only when needed.</h2>
            <StepList steps={[
              { title: "Open Tenders", copy: "Use the TENDERS link to load confirmed public state. No wallet is required to browse; recent records are marked until finality." },
              { title: "Choose a workspace", copy: "The primary bar contains Public, Buyer, Private Bids, and Activity. Buyer opens EOA Buyer by default, with Safe Buyer beside it; Private Bids contains Submit Bid, My Bid, and Granted Access." },
              { title: "Use contextual help", copy: "Hover or focus the ? control beside the workspace tabs, at a card corner, or beside Balances for page-specific instructions." },
              { title: "Connect your wallet", copy: "Select CONNECT WALLET beside the network indicator, then choose a detected EIP-6963 provider. FlareQuorum requests the Sepolia switch automatically when needed." },
              { title: "Confirm wallet requests", copy: "Your wallet may show separate connection and network confirmations for security. Both belong to the same guided action on FlareQuorum." },
              { title: "Follow transaction progress", copy: "A bottom-right notification moves through validation, simulation, wallet signature, confirmation, and completion. Verify every target and value in the wallet prompt." },
              { title: "Refresh confirmed state", copy: "After confirmation, refresh the public dossier. It appears immediately with a finality-pending label; proof requests can be resumed from Activity if interrupted." },
            ]} />
            <div className="docs-actions">
              <Link className="primary-button" to="/room">OPEN TENDERS →</Link>
              <a className="secondary-button" href="#buyer">READ BUYER GUIDE</a>
            </div>
          </section>

          <section id="public">
            <p className="eyebrow">PUBLIC EXPLORER</p>
            <h2>Read canonical state without signing.</h2>
            <p>
              Public mode indexes confirmed Sepolia events and shows each
              tender’s ceiling, deadline, bid count, buyer, lifecycle status,
              winner where available, award receipt, and transaction
              fingerprints. It never substitutes mock tenders when RPC or
              indexing fails.
            </p>
            <ul className="docs-checklist">
              <li>Select a tender card to open its public dossier.</li>
              <li>Use Open only for tenders still accepting bids. An on-chain Open tender moves to the derived Ready to close view as soon as its deadline passes or every Vendor submits; it becomes contract-level Closed only after the permissionless close transaction confirms.</li>
              <li>Use Current &amp; awarded for the main lifecycle or the terminal-status filters for history. The dossier count, refresh, and filter controls remain visible while the list scrolls.</li>
              <li>On mobile, use ALL DOSSIERS to return from the selected detail to the compact tender list.</li>
              <li>Use the lifecycle and readiness labels to distinguish contract state from derived next actions.</li>
              <li>Inspect Sepolia links and receipt ownership for awarded tenders.</li>
              <li>Refresh to reread confirmed logs; recent records remain marked until the 12-block finality boundary.</li>
            </ul>
          </section>

          <section id="buyer">
            <p className="eyebrow">EOA BUYER / DIRECT WALLET</p>
            <h2>Create an exactly funded tender without a Safe.</h2>
            <StepList steps={[
              { title: "Connect a Sepolia wallet", copy: "Open Buyer—the default EOA Buyer view—and connect the account that will directly own the tender." },
              { title: "Define public terms", copy: "Enter public metadata, a public ceiling, a future bid deadline, and between one and eight approved vendor addresses." },
              { title: "Acquire enough Test USDC", copy: "Use GET TEST USDC before creation. If the public ceiling exceeds the wallet balance, the form stops before any transaction; it never calls the faucet automatically." },
              { title: "Wrap and fund", copy: "Once Test USDC covers the ceiling, the guided flow approves the wrapper when needed, wraps the exact ceiling to vcUSDC, and creates the funded tender." },
              { title: "Authorize the market", copy: "Approve the market as the confidential-token operator required for escrow." },
              { title: "Create funded tender", copy: "Simulate, review, and sign the tender creation transaction. The public terms and encrypted budget are bound together." },
              { title: "Prove exact funding", copy: "The web waits for the public equality result proving escrow equals the ceiling, without opening the confidential balance itself." },
              { title: "Open bidding", copy: "Confirm the permissionless proof transaction in the connected wallet. The relay remains a fallback if the browser flow stops." },
            ]} />
            <p className="docs-note">
              If the funding proof is interrupted, do not create another
              tender. Open Activity and resume the stored public checkpoint.
              The eye beside vcUSDC performs an explicit, session-only reveal
              and appears disabled when no confidential balance exists.
              UNWRAP vcUSDC supports Full directly from the encrypted balance,
              or a custom amount after reveal. Public-proof finalization
              releases Test USDC to the connected wallet and makes amount and
              recipient public.
              The EOA is also bound as the review wallet: it cannot inspect
              other vendors’ bids while Open and receives scoped access
              automatically only after finalization.
            </p>
          </section>

          <section id="vendor">
            <p className="eyebrow">PRIVATE BIDS / VENDOR &amp; REVIEWER</p>
            <h2>Submit your bid or review authorized bids.</h2>
            <StepList steps={[
              { title: "Open Submit Bid", copy: "Connect the approved account and choose Submit Bid. The address must occupy an approved vendor slot on an Open tender and must not already have submitted." },
              { title: "Select the tender", copy: "Only eligible Open, unexpired tenders are selectable. The local deadline, remaining time, and canonical UTC time are shown before any private value is entered." },
              { title: "Enter the bid privately", copy: "The plaintext exists only in the active browser session while the Nox input is prepared for this market." },
              { title: "Encrypt for the market", copy: "Bind the confidential input to the chain, market contract, tender, and connected vendor." },
              { title: "Simulate and sign", copy: "The app simulates the write first. Review the wallet request, sign once, and wait for confirmation." },
              { title: "Refresh the dossier", copy: "The public bid count updates, but neither the price nor a plaintext shadow value is indexed." },
              { title: "Use My Bid", copy: "Reveal your own stored bid in the current browser session or grant one exact wallet access to that bid handle." },
              { title: "Use Granted Access", copy: "The app automatically checks per-bid ACLs and lists only bids shared with this wallet. After finalization, the configured review wallet can select an authorized bid and reveal it directly; this grants no token, Safe, or protocol authority." },
            ]} />
            <div className="docs-callout">
              <strong>IMMUTABILITY</strong>
              <p>
                One approved address can submit one bid for its assigned slot.
                There is no edit or plaintext recovery path in the public UI.
              </p>
            </div>
            <p className="docs-note">
              The same workspace also checks per-bid ACL before revealing a
              stored bid. Vendors can reveal or share only their own bid. A
              tender’s public review wallet is authorized automatically after
              proof-derived finalization, never while the tender is Open.
            </p>
          </section>

          <section id="activity">
            <p className="eyebrow">CLOSE, PROVE, SETTLE</p>
            <h2>Permissionless progress with resumable checkpoints.</h2>
            <p>
              Once every approved vendor has submitted, or once the deadline
              passes, any connected Sepolia account
              can close an eligible tender. Nox performs the winner comparison,
              and only the encrypted winner identifier is deliberately sent
              through public decryption. The market verifies the proof and
              settles against its stored vendor mapping. The hosted relay
              advances this flow automatically; Activity manual actions are
              optional recovery fallbacks.
            </p>
            <StepList steps={[
              { title: "Monitor automation", copy: "Activity keeps Automation Status compact by default while its three counters remain visible. It opens automatically only when a saved checkpoint Needs Attention; otherwise Show Details exposes optional relay and manual-recovery information." },
              { title: "Advance only when needed", copy: "ADVANCE MANUALLY is a secondary fallback when the relay is delayed or unavailable; it derives eligibility and simulates against canonical on-chain state." },
              { title: "Request winner proof", copy: "The relay requests public decryption for the winner ID, not for bid or settlement values." },
              { title: "Resume after interruption", copy: "Activity stores only public tender IDs and trigger transaction hashes; handles and proofs are reread when resuming." },
              { title: "Finalize once", copy: "On-chain proof verification and replay protection permit confidential vendor payment or the protocol’s full refund outcome." },
              { title: "Notify the winner", copy: "When the connected wallet is named by a confirmed TenderAwarded event, FlareQuorum shows a new-award banner. Opening it automatically acknowledges the notification; the complete history remains in Activity with the exact award transaction and receipt link." },
              { title: "Review lifecycle history", copy: "Activity lists each indexed public lifecycle event with its confirmed block and Sepolia transaction link; no confidential amount or bid value is stored there." },
            ]} />
            <p className="docs-note">
              Award records are reconstructed from Sepolia after reload. The
              browser stores only which tender notification this wallet has
              opened; it never stores a bid value, settlement amount, handle,
              proof, or signature in notification history.
            </p>
          </section>

          <section id="safe">
            <p className="eyebrow">SAFE BUYER / TREASURY</p>
            <h2>Preparation is not execution.</h2>
            <p>
              Choose any discovered Sepolia Safe owned by the connected wallet.
              FlareQuorum lets the connected wallet deposit confidential funding,
              then proposes tender setup, tender creation, balance-view grants,
              and unwraps through the Safe Transaction Service. Every treasury
              spend still satisfies that Safe’s configured threshold.
            </p>
            <StepList steps={[
              { title: "Select and fund", copy: "Select a Safe card or paste an address. DEPOSIT TO SAFE approves public test vUSDC from the connected wallet and wraps vcUSDC directly to that Safe." },
              { title: "Configure when creating", copy: "The tender form shows CONFIGURE THIS SAFE only when required. Its one-time threshold batch deploys/enables the deterministic module and binds the canonical Market." },
              { title: "Bind the review wallet", copy: "The connected owner is included in the threshold-approved tender calldata as its public review wallet. It gains no cross-bid access while Open; finalization grants scoped access automatically." },
              { title: "Reveal only when needed", copy: "The eye grants the connected owner viewer access to the current balance handle, then decrypts only in this browser session. A new handle requires a new grant." },
              { title: "Validate the ceiling", copy: "Tender creation stays locked until the current Safe balance is revealed. The public ceiling cannot exceed that private session balance." },
              { title: "Open the tender", copy: "After the Safe creation batch executes, the web waits for the exact-funding proof and asks the connected owner to submit the permissionless confirmation. Relay automation remains the fallback." },
              { title: "Enter an amount or use Full", copy: "The Full shortcut uses the encrypted balance directly without reveal. A custom amount first reveals the current balance privately, then encrypts only that amount for an atomic preparation + wrapper batch." },
              { title: "Finalize the public exit", copy: "After the Safe executes, FINALIZE UNWRAP completes the permissionless public proof and releases public vUSDC to the connected wallet. The amount and recipient become public; remaining vcUSDC and bid values stay confidential." },
            ]} />
            <div className="docs-callout">
              <strong>AUTHORITY BOUNDARY</strong>
              <p>
                Neither preparation contract can execute from the Safe, custody
                funds, or bypass owners. Multi-owner proposals remain pending
                until the normal threshold is reached.
              </p>
            </div>
            <p className="docs-note">
              Safe owners are approvers, not automatic beneficiaries. The
              canonical demo uses a 1-owner, threshold-1 Safe for predictable
              signing; comprehensive multi-signer UX and 2-of-3 regression
              coverage are planned after the hackathon.
            </p>
          </section>

          <section id="architecture">
            <p className="eyebrow">ARCHITECTURE</p>
            <h2>Four boundaries, one settlement path.</h2>
            <dl className="docs-definition-grid">
              <div><dt>Tender Room</dt><dd>Wallet-free public index plus Buyer (Safe/EOA), Private Bids (Submit/My Bid/Granted Access), and Activity workspaces.</dd></div>
              <div><dt>FlareQuorum Market</dt><dd>Non-upgradeable market, ERC-7984 demo assets, non-transferable receipt, and preparation-only Safe module.</dd></div>
              <div><dt>Settlement Relay</dt><dd>Stateless permissionless close and finalize automation with bounded, sequential actions.</dd></div>
              <div><dt>Operator Console</dt><dd>Strict-schema MCP stdio tools with no signer, write, or private-decryption surface.</dd></div>
            </dl>
            <p>
              Chain bindings provide canonical ABIs, release addresses, event
              codecs, domain types, and the public index shared by these
              components.
            </p>
          </section>

          <section id="privacy">
            <p className="eyebrow">PRIVACY MAP</p>
            <h2>Public coordination is not anonymous bidding.</h2>
            <div className="privacy-table" role="table" aria-label="Data visibility">
              <div role="row"><strong role="cell">Public</strong><span role="cell">Tender ID, buyer, review wallet, vendors, ceiling, deadline, status, winner, hashes, receipt.</span></div>
              <div role="row"><strong role="cell">Confidential</strong><span role="cell">Bid values, best price, payment and refund values, confidential balances.</span></div>
              <div role="row"><strong role="cell">Selective</strong><span role="cell">A stored bid is visible to its vendor, vendor-granted viewers, and the tender review wallet only after finalization.</span></div>
            </div>
          </section>

          <section id="evidence">
            <p className="eyebrow">VERIFICATION</p>
            <h2>Evidence stays useful—and sanitized.</h2>
            <p>
              The release records public chain IDs, block numbers, contract
              addresses, transaction hashes, statuses, runtime mappings, and
              lifecycle assertions. It excludes private keys, wallet
              signatures, plaintext bids, confidential balance values,
              encrypted handles, and proof bytes.
            </p>
            <ul className="docs-checklist">
              <li>Runtime bytecode and source mappings are checked against the canonical release manifest.</li>
              <li>Sepolia evidence covers exact funding, encrypted argmin, public winner proof, confidential settlement, refund, and Safe authority boundaries.</li>
              <li>Frontend smoke checks exercise wallet-free loading, responsive rendering, navigation, and keyboard focus.</li>
            </ul>
            <Link className="primary-button" to="/room">INSPECT PUBLIC STATE →</Link>
          </section>

          <section id="troubleshooting">
            <p className="eyebrow">TROUBLESHOOTING</p>
            <h2>Recover without inventing state.</h2>
            <dl className="troubleshooting-list">
              <div><dt>No wallet detected</dt><dd>Unlock or install an EIP-6963 compatible browser wallet, then reload. Public mode remains available.</dd></div>
              <div><dt>Sepolia switch declined</dt><dd>Open the header wallet menu and select RETRY SEPOLIA CONNECTION. Write actions remain disabled until chain 11155111 is active.</dd></div>
              <div><dt>Public state unavailable</dt><dd>Retry the Sepolia read. FlareQuorum deliberately shows an error instead of substituting mock data.</dd></div>
              <div><dt>EOA ceiling exceeds Test USDC</dt><dd>Use GET TEST USDC in Balances, wait for confirmation, then submit again. Create Tender never calls the faucet automatically.</dd></div>
              <div><dt>Safe assets are not listed</dt><dd>Safe Buyer intentionally shows only vcUSDC. Open the selected account in Safe Wallet to inspect or transfer public ETH, vUSDC, and unrelated assets.</dd></div>
              <div><dt>Custom unwrap is unavailable</dt><dd>Reveal the current holder’s vcUSDC balance first. Full unwrap does not require reveal. Safe exits need the Safe threshold; EOA exits use the connected wallet directly. Both finish through public-proof finalization.</dd></div>
              <div><dt>Proof request interrupted</dt><dd>Open Activity and resume the public checkpoint. Do not repeat tender creation or submit an alternate winner.</dd></div>
              <div><dt>Review wallet cannot reveal</dt><dd>Confirm the tender is finalized and the connected account matches its public review wallet. Vendor grants still apply only to that exact bid handle.</dd></div>
              <div><dt>Safe action unavailable</dt><dd>Confirm the connected wallet is a Safe owner and the live module is enabled. Enabling or re-enabling it requires a normal Safe threshold transaction.</dd></div>
            </dl>
          </section>

          <section id="boundaries">
            <p className="eyebrow">NON-CLAIMS</p>
            <h2>What FlareQuorum does not promise.</h2>
            <ul>
              <li>Bidder identities, timing, tender metadata, and transaction graphs are public.</li>
              <li>FlareQuorum does not verify delivered service quality or prevent off-chain collusion.</li>
              <li>The current release is Sepolia test infrastructure, not audited or mainnet-ready software.</li>
              <li>A closed tender waits for a valid Nox proof; there is no buyer timeout override or plaintext fallback.</li>
              <li>Safe preparation does not bypass the Safe threshold, and review access does not imply custody authority.</li>
            </ul>
            <div className="docs-actions">
              <Link className="primary-button" to="/room">USE THE APP →</Link>
              <a className="secondary-button" href="#overview">BACK TO TOP ↑</a>
            </div>
          </section>
        </article>
      </main>
    </div>
  );
}
