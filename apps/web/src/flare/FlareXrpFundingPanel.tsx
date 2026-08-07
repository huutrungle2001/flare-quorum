export function FlareXrpFundingPanel() {
  return (
    <section className="evidence-panel flare-xrp-funding-panel" aria-label="XRP-native funding handoff">
      <header className="detail-header">
        <div>
          <p className="eyebrow">FLAGSHIP FUNDING / XRPL → FDC → SMART ACCOUNT</p>
          <h2>Keep the XRPL signature outside VeilBid</h2>
        </div>
        <span className="privacy-badge verified">NON-CUSTODIAL</span>
      </header>
      <p>
        The browser does not ask for an XRPL seed, private key, FDC credential,
        or direct-mint signer. Use an XRPL testnet wallet to make the public
        payment, then hand the public transaction ID to the dedicated funding
        executor.
      </p>
      <ol className="lifecycle" aria-label="XRP-native funding stages">
        <li className="complete"><span>1</span>XRPL TESTNET PAYMENT</li>
        <li className="active"><span>2</span>FDC PROOF</li>
        <li><span>3</span>SMART ACCOUNT MINT</li>
        <li><span>4</span>FUNDED TENDER</li>
      </ol>
      <div className="form-hint">
        <strong>Delayed is not success.</strong> If AssetManager returns
        <code>DirectMintingDelayed</code>, preserve the public-safe checkpoint
        and resume it with <code>pnpm flare:funding:resume</code>. The executor
        reuses the same payment, FDC request, and nonce; it never requests a
        second XRPL payment.
      </div>
      <div className="readiness-strip" aria-live="polite">
        <span className="signal-dot" aria-hidden="true" />
        <div>
          <strong>Browser writes use the labeled EVM recovery path below.</strong>
          <span>
            Read the <a className="text-link" href="/docs#flare-coston2">Coston2 funding runbook ↗</a> before operating the XRP-native executor.
          </span>
        </div>
      </div>
    </section>
  );
}
