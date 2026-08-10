import { Link } from "react-router";
import { coston2FlarePublicRelease } from "@flarequorum/flare-bindings";

function short(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function explorerAddress(address: string): string {
  return `https://coston2-explorer.flare.network/address/${address}`;
}

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

function ProtocolLink({ label, address, description }: { label: string; address: string; description: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <a className="text-link" href={explorerAddress(address)} target="_blank" rel="noreferrer">
          {short(address)} ↗
        </a>
        <small>{description}</small>
      </dd>
    </div>
  );
}

/** Current Flare documentation. The historical Nox guide stays on /room. */
export function FlareDocsPage() {
  const release = coston2FlarePublicRelease;
  return (
    <div className="marketing-page docs-page">
      <main className="docs-main" id="main-content">
        <aside className="docs-nav" aria-label="Flare documentation sections">
          <strong>ON THIS PAGE</strong>
          {[
            ["flare-coston2", "CURRENT RELEASE"],
            ["quick-start", "JUDGE QUICK START"],
            ["integrations", "FLARE INTEGRATIONS"],
            ["buyer", "BUYER"],
            ["vendor", "VENDOR"],
            ["recovery", "RECOVERY"],
            ["privacy", "PRIVACY"],
            ["verification", "VERIFICATION"],
            ["boundaries", "BOUNDARIES"],
          ].map(([id, label]) => <a href={`#${id}`} key={id}>{label}</a>)}
        </aside>
        <article className="docs-content">
          <section id="flare-coston2">
            <p className="eyebrow">FLAREQUORUM / COSTON2 · CURRENT JUDGE PATH</p>
            <h1>Public evidence.<br /><em>Private computation.</em></h1>
            <p className="docs-lede">
              FlareQuorum turns an XRP-native procurement decision into one verifiable
              Coston2 lifecycle: public rules and FTestXRP escrow, browser-encrypted
              vendor bids, private FCC scoring, and a matching threshold result.
            </p>
            <div className="docs-callout">
              <strong>VERIFIED RELEASE · TESTNET ONLY</strong>
              <p>
                Chain 114 is the only current Flare judge path. The app never
                falls back to Sepolia or fabricated state when an RPC, ingress,
                FDC, or TEE dependency is unavailable.
              </p>
            </div>
            <div className="docs-actions">
              <Link className="primary-button" to="/flare">OPEN COSTON2 DOSSIERS →</Link>
              <a className="secondary-button" href="/flare?role=evidence">OPEN AUDITOR LEDGER →</a>
              <a className="secondary-button" href="/flare?role=buyer">OPEN BUYER →</a>
              <a className="secondary-button" href="/flare?role=vendor">OPEN PRIVATE BIDS →</a>
            </div>
          </section>

          <section id="quick-start">
            <p className="eyebrow">JUDGE QUICK START</p>
            <h2>Inspect first. Sign only when intentional.</h2>
            <StepList steps={[
              { title: "Open the public dossier", copy: "No wallet is needed. Confirm the verified market, extension, three machine fingerprints, FTestXRP, FTSO, FDC, FAssets, and Smart Account bindings." },
              { title: "Read Activity / Evidence", copy: "Inspect a finalized tender's rules hash, receipt quorum, ordered root, FTSO snapshot, FCC binding, and award/refund state. Losing bid values are never fetched." },
              { title: "Try the Buyer brief", copy: "The structured public brief commits an immutable metadata hash and rules hash. Direct EVM funding is a recovery path; the XRP panel prepares a public-safe 0xFE Payment/job handoff." },
              { title: "Inspect the Vendor boundary", copy: "The browser checks the approved vendor slot and frozen machine keys, encrypts separately to each TEE, verifies three signed receipts, and submits one atomic receipt set." },
              { title: "Follow the evidence links", copy: "Close captures the official XRP/USD FTSO snapshot, FCC selects privately, two matching machines sign, and anyone can finalize the public settlement." },
            ]} />
          </section>

          <section id="integrations">
            <p className="eyebrow">FLARE INTEGRATIONS</p>
            <h2>Five primitives, one product path.</h2>
            <p>Each integration changes a real procurement step; none is a decorative address card.</p>
            <dl className="docs-definition-grid">
              <div><dt>Confidential Compute</dt><dd>Three registered TEEs hold sealed bid state, validate credentials, score XRP/USD terms, and sign the result. The browser never supplies a winner.</dd></div>
              <div><dt>FTSO XRP/USD</dt><dd>The market freezes the official feed value, decimals, and timestamp at close; FCC scoring binds to that snapshot.</dd></div>
              <div><dt>FDC + Smart Accounts</dt><dd>An XRPL testnet payment carries a 0xFE commitment. FDC proves it, then the Smart Account atomically mints FTestXRP and creates/funds the tender.</dd></div>
              <div><dt>FAssets</dt><dd>The official FXRP AssetManager supplies the payment destination, fee, direct-mint boundary, and amount-based redemption request path.</dd></div>
              <div><dt>FTestXRP settlement</dt><dd>The market pays the public winner and buyer remainder, or refunds the full escrow. Ordinary token amounts are public.</dd></div>
            </dl>
            <dl className="term-grid">
              <ProtocolLink label="FCC manager" address={release.fcc.manager} description={`extension ${release.fcc.extensionId} · ${release.fcc.version}`} />
              <ProtocolLink label="FTestXRP" address={release.protocols.fTestXRP} description="Coston2 settlement token" />
              <ProtocolLink label="FAssets FXRP manager" address={release.protocols.assetManagerFXRP} description="official mint/redeem boundary" />
              <ProtocolLink label="FTSO v2" address={release.protocols.ftsoV2} description="XRP/USD feed contract" />
              <ProtocolLink label="FDC verification" address={release.protocols.fdcVerification} description="XRPPayment proof verifier" />
              <ProtocolLink label="Smart Account controller" address={release.protocols.masterAccountController} description="XRPL-native direct mint execution" />
            </dl>
          </section>

          <section id="buyer">
            <p className="eyebrow">BUYER / PUBLIC RULES + ESCROW</p>
            <h2>Describe the work before anyone bids.</h2>
            <p>
              A Buyer Brief contains the title, category, objective, acceptance
              criteria, deadline, asset, approved vendors, scoring weights, and
              optional vendor questions. The public brief is hashed into tender
              metadata; the immutable rules hash prevents silent rule changes.
            </p>
            <StepList steps={[
              { title: "Connect a Coston2 wallet for a write", copy: "The wallet must explicitly approve FTestXRP and create the tender; the public dossier remains wallet-free." },
              { title: "Use the XRP-native handoff when needed", copy: "Prepare the exact XRPL Testnet Payment draft and 0xFE memo. GemWallet is optional and receives only the public transaction hash; FlareQuorum never receives a seed." },
              { title: "Treat delayed minting as pending", copy: "A DirectMintingDelayed response is not success. The executor checkpoint reuses the same public payment, FDC request, and Smart Account nonce without asking for a second payment." },
            ]} />
          </section>

          <section id="vendor">
            <p className="eyebrow">VENDOR / PRIVATE BID INGRESS</p>
            <h2>Encrypt locally. Prove receipt quorum publicly.</h2>
            <p>
              An approved vendor enters price, currency, delivery, warranty, and
              any required credentials in the active browser session. The client
              binds the bid to chain, market, tender, vendor, rules, and a one-time
              nonce, then sends independent ECIES ciphertexts over authenticated
              HTTPS to the three frozen machine URLs.
            </p>
            <div className="docs-callout">
              <strong>WHAT THE PUBLIC SEES</strong>
              <p>Only signed receipt commitments, the common quorum bitmap, the ordered root, and the final public outcome. No plaintext or ciphertext is published or persisted by the gateway.</p>
            </div>
          </section>

          <section id="recovery">
            <p className="eyebrow">RECOVERY / FAIL CLOSED</p>
            <h2>Resume public checkpoints, never invent success.</h2>
            <ul className="docs-checklist">
              <li>The public Activity ledger rereads finalized Coston2 state and is safe to reopen after a browser or relay interruption.</li>
              <li>The XRP funding panel stores only the public XRPL owner, transaction hash, wallet ID, and executor fee; it offers explicit resume and forget controls.</li>
              <li>A live three-vendor run finalized with one result endpoint unavailable; two frozen machines signed the same result.</li>
              <li>Same-identity restore is not claimed or supported. Simulated tee-node startup generates a new identity after restart, so Flare's supported recovery is replacement registration under the same extension and approved code, followed by removal of the stale identity.</li>
              <li>The live rolling drill replaced and re-registered all three product identities, safely retired stale rotation, and completed tender 23 on the new machine set.</li>
              <li>A replacement restores capacity for new tenders only. It cannot replace a frozen key or decrypt ciphertext from an already-open tender.</li>
              <li>Two-machine loss, stale FTSO, split-result, replay, and credential cases fail closed in local/negative suites; those records are not relabeled as live fault-injection evidence.</li>
            </ul>
          </section>

          <section id="privacy">
            <p className="eyebrow">PRIVACY MAP</p>
            <h2>Public coordination is not anonymous bidding.</h2>
            <div className="privacy-table" role="table" aria-label="Flare data visibility">
              <div role="row"><strong role="cell">Public</strong><span role="cell">Buyer, approved vendors, rules, ceiling, deadline, commitments, receipt quorum, FTSO snapshot, winner, and token settlement.</span></div>
              <div role="row"><strong role="cell">Confidential</strong><span role="cell">Bid plaintext, ciphertext, credentials, losing commercial terms, eligibility inputs, component scores, and TEE decryption state.</span></div>
              <div role="row"><strong role="cell">Never requested</strong><span role="cell">XRPL seed, EVM private key, TEE key, proxy/indexer credential, or mainnet asset.</span></div>
            </div>
          </section>

          <section id="verification">
            <p className="eyebrow">VERIFICATION</p>
            <h2>Reproduce the public proof.</h2>
            <p>The judge package, release manifest, generated bindings, and sanitized evidence are the authorities for the current release.</p>
            <ul className="docs-checklist">
              <li><a className="text-link" href="/flare?role=evidence">Open the finalized Auditor evidence ↗</a></li>
              <li><a className="text-link" href="https://github.com/huutrungle2001/flare-quorum/blob/main/submission/flare/README.md" target="_blank" rel="noreferrer">Read the judge package ↗</a></li>
              <li><a className="text-link" href="https://github.com/huutrungle2001/flare-quorum/blob/main/docs/verification.md" target="_blank" rel="noreferrer">Read the verification matrix ↗</a></li>
              <li>Run <code>pnpm lint</code>, <code>pnpm test</code>, <code>pnpm build</code>, <code>pnpm evidence:validate</code>, and <code>pnpm flare:judge:check</code> from the repository.</li>
            </ul>
          </section>

          <section id="boundaries">
            <p className="eyebrow">BOUNDARIES</p>
            <h2>What this release does not promise.</h2>
            <ul className="docs-checklist">
              <li>Coston2 and FTestXRP are testnet infrastructure; no mainnet asset is used.</li>
              <li>The current machines use simulated FCC mode, not hardware-backed confidential-space attestation.</li>
              <li>The software is unaudited and does not verify off-chain service delivery or prevent collusion.</li>
              <li>Ordinary token settlement is public; an FAssets redemption request is not an instant native-XRP payout.</li>
              <li>The supported replacement-TEE drill passes; broader wallet coverage, stateful adversarial breadth, and structured buyer/vendor validation remain open.</li>
            </ul>
            <div className="docs-actions">
              <Link className="primary-button" to="/flare">OPEN THE CURRENT APP →</Link>
              <Link className="secondary-button" to="/room">OPEN HISTORICAL SEPOLIA BASELINE →</Link>
            </div>
          </section>
        </article>
      </main>
    </div>
  );
}
