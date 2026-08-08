import { useState } from "react";
import type { Address, Hex } from "viem";
import { sendXrplTestnetPaymentWithGemWallet } from "./xrplWallet";

export interface XrpFundingPrepareInput {
  xrplOwner: string;
  xrplTransactionId: string;
  walletId: string;
  executorFeeUBA: string;
}

export interface XrpFundingPreview {
  personalAccount: Address;
  nonce: string;
  walletId: number;
  executorFeeUBA: string;
  xrplTransactionId: Hex | null;
  paymentDestination: string;
  paymentAmountUBA: string;
  mintingFeeUBA: string;
  memoData: Hex;
  paymentDraftJson: string;
  jobJson: string | null;
}

interface FlareXrpFundingPanelProps {
  onPrepare: (input: XrpFundingPrepareInput) => Promise<XrpFundingPreview>;
}

export function FlareXrpFundingPanel({ onPrepare }: FlareXrpFundingPanelProps) {
  const [xrplOwner, setXrplOwner] = useState("");
  const [xrplTransactionId, setXrplTransactionId] = useState("");
  const [walletId, setWalletId] = useState("0");
  const [executorFeeUBA, setExecutorFeeUBA] = useState("");
  const [preview, setPreview] = useState<XrpFundingPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletSubmitted, setWalletSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [paymentCopied, setPaymentCopied] = useState(false);

  async function prepare() {
    setBusy(true);
    setError(null);
    setCopied(false);
    setPaymentCopied(false);
    setWalletSubmitted(false);
    try {
      setPreview(await onPrepare({ xrplOwner, xrplTransactionId, walletId, executorFeeUBA }));
    } catch (cause) {
      setPreview(null);
      setError(cause instanceof Error ? cause.message : "XRPL_FUNDING_PREVIEW_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function submitWithGemWallet() {
    if (!preview) return;
    setWalletBusy(true);
    setError(null);
    try {
      const transactionId = await sendXrplTestnetPaymentWithGemWallet({
        owner: xrplOwner,
        destination: preview.paymentDestination,
        amountUBA: preview.paymentAmountUBA,
        memoData: preview.memoData,
      });
      // Keep the public hash in the input immediately. If a subsequent RPC
      // refresh is unavailable, the user can retry preparation without ever
      // sending a second payment.
      setXrplTransactionId(transactionId);
      setWalletSubmitted(true);
      try {
        const refreshed = await onPrepare({
          xrplOwner,
          xrplTransactionId: transactionId,
          walletId,
          executorFeeUBA,
        });
        setPreview(refreshed);
      } catch {
        setError("XRPL_PAYMENT_SUBMITTED_PREPARE_RETRY");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "XRPL_WALLET_PAYMENT_FAILED");
    } finally {
      setWalletBusy(false);
    }
  }

  async function copyJob() {
    if (!preview?.jobJson) return;
    try {
      await navigator.clipboard.writeText(preview.jobJson);
      setCopied(true);
    } catch {
      setError("PUBLIC_JOB_COPY_UNAVAILABLE");
    }
  }

  async function copyPaymentDraft() {
    if (!preview) return;
    try {
      await navigator.clipboard.writeText(preview.paymentDraftJson);
      setPaymentCopied(true);
    } catch {
      setError("PUBLIC_PAYMENT_DRAFT_COPY_UNAVAILABLE");
    }
  }

  return (
    <section className="evidence-panel flare-xrp-funding-panel" aria-label="XRP-native funding handoff">
      <header className="detail-header">
        <div>
          <p className="eyebrow">FLAGSHIP FUNDING / XRPL → FDC → SMART ACCOUNT</p>
          <h2>Keep the XRPL signature outside VeilBid</h2>
        </div>
        <span className="privacy-badge verified">NON-CUSTODIAL</span>
      </header>
      <p className="funding-lede">
        Prepare a public-safe executor job from the buyer brief below. This browser
        step reads only the XRPL owner, PersonalAccount, nonce, and public payment
        ID; it never asks for a seed, private key, FDC credential, or direct-mint signer.
        <br /><small><strong>DirectMintingDelayed is not success.</strong> Keep the public checkpoint and resume it with the same payment and nonce.</small>
        <br /><small>The wallet-ready XRPL Payment draft reads the current AssetManager destination and fee; the transaction ID is optional until your external wallet signs or GemWallet submits.</small>
      </p>
      <ol className="lifecycle" aria-label="XRP-native funding stages">
        <li className="complete"><span>1</span>XRPL TESTNET PAYMENT</li>
        <li className="active"><span>2</span>FDC PROOF</li>
        <li><span>3</span>SMART ACCOUNT MINT</li>
        <li><span>4</span>FUNDED TENDER</li>
      </ol>
      <div className="funding-handoff-form">
        <label>
          XRPL owner address
          <input id="xrpl-owner-address" value={xrplOwner} onChange={(event) => setXrplOwner(event.target.value)} placeholder="r… (public classic address)" autoComplete="off" disabled={busy} />
          <small>Use an XRPL testnet classic address you control. Never paste a secret.</small>
        </label>
        <label>
          XRPL payment transaction ID
          <input id="xrpl-payment-transaction-id" value={xrplTransactionId} onChange={(event) => setXrplTransactionId(event.target.value)} placeholder="64-hex transaction ID (after payment)" autoComplete="off" disabled={busy} />
          <small>Leave blank to create the wallet-ready Payment draft. After external signing, enter the public transaction ID; GemWallet fills it after submission.</small>
        </label>
        <label>
          Smart Account wallet ID
          <input id="smart-account-wallet-id" inputMode="numeric" value={walletId} onChange={(event) => setWalletId(event.target.value)} placeholder="0" autoComplete="off" disabled={busy} />
        </label>
        <label>
          Executor fee (UBA, optional)
          <input id="executor-fee-uba" inputMode="numeric" value={executorFeeUBA} onChange={(event) => setExecutorFeeUBA(event.target.value)} placeholder="official Coston2 fee" autoComplete="off" disabled={busy} />
          <small>Leave blank to use the current official Coston2 fee; a custom value must match it. The dedicated executor still uses its own server-side key.</small>
        </label>
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="funding-actions">
        <button className="primary-button" type="button" onClick={() => void prepare()} disabled={busy || walletBusy}>
          {busy ? "READING COSTON2…" : "PREPARE PUBLIC 0xFE JOB →"}
        </button>
        <a className="secondary-button" href="/docs#flare-coston2">READ FUNDING RUNBOOK ↗</a>
      </div>
      {preview && (
        <section className="funding-preview" aria-label="Public XRP funding preview">
          <header className="detail-header">
            <div><p className="eyebrow">PUBLIC-SAFE HANDOFF READY</p><h3>Use this memo with your XRPL testnet wallet</h3></div>
            <span className="privacy-badge verified">NO CUSTODY</span>
          </header>
          <dl className="term-grid">
            <div><dt>PersonalAccount</dt><dd>{preview.personalAccount}</dd></div>
            <div><dt>Smart Account nonce</dt><dd>{preview.nonce}</dd></div>
            <div><dt>Wallet ID / fee</dt><dd>{preview.walletId} / {preview.executorFeeUBA} UBA</dd></div>
            <div><dt>XRPL payment</dt><dd>{preview.paymentAmountUBA} UBA · mint fee {preview.mintingFeeUBA} UBA</dd></div>
            <div><dt>Payment destination</dt><dd>{preview.paymentDestination}</dd></div>
            <div><dt>XRPL transaction</dt><dd>{preview.xrplTransactionId ? <a className="text-link" href={`https://testnet.xrpl.org/transactions/${preview.xrplTransactionId.slice(2)}`} target="_blank" rel="noreferrer">{preview.xrplTransactionId.slice(0, 10)}… ↗</a> : <span>Not submitted yet</span>}</dd></div>
          </dl>
          <details className="funding-job-details" open>
            <summary>WALLET-READY XRPL PAYMENT DRAFT</summary>
            <p className="form-hint">Copy this public JSON into an XRPL testnet wallet or use it to fill a Payment form. The wallet signs it; VeilBid never receives the seed or private key.</p>
            <pre>{preview.paymentDraftJson}</pre>
            <button className="secondary-button" type="button" onClick={() => void copyPaymentDraft()}>{paymentCopied ? "COPIED PAYMENT DRAFT ✓" : "COPY PAYMENT DRAFT JSON"}</button>
            <button className="secondary-button" type="button" onClick={() => void submitWithGemWallet()} disabled={busy || walletBusy || walletSubmitted || Boolean(preview.xrplTransactionId)}>
              {walletBusy ? "WAITING FOR GEMWALLET…" : walletSubmitted || preview.xrplTransactionId ? "PUBLIC PAYMENT ALREADY PROVIDED ✓" : "SIGN & SUBMIT WITH GEMWALLET ↗"}
            </button>
            <p className="form-hint">Optional browser-native path: GemWallet must be on XRPL Testnet and will show the exact destination, amount, and memo for your approval. VeilBid receives only the public transaction ID.</p>
          </details>
          <label className="funding-code-field">
            0xFE memo data
            <textarea readOnly value={preview.memoData} rows={3} aria-label="0xFE memo data" />
          </label>
          {preview.jobJson ? <>
            <details className="funding-job-details">
              <summary>SHOW PUBLIC EXECUTOR JOB JSON</summary>
              <pre>{preview.jobJson}</pre>
            </details>
            <button className="secondary-button" type="button" onClick={() => void copyJob()}>{copied ? "COPIED PUBLIC JOB ✓" : "COPY PUBLIC JOB JSON"}</button>
          </> : <p className="form-hint"><strong>Payment draft only.</strong> After your XRPL wallet confirms the payment, enter its transaction ID above and prepare again to produce the executor job.</p>}
          <p className="form-hint"><strong>Delayed is not success.</strong> If AssetManager returns <code>DirectMintingDelayed</code>, preserve this public-safe checkpoint and run <code>pnpm flare:funding:resume</code>. The executor reuses the same payment, FDC request, and nonce; it never requests a second XRPL payment.</p>
        </section>
      )}
      <div className="readiness-strip" aria-live="polite">
        <span className="signal-dot" aria-hidden="true" />
        <div>
          <strong>XRPL wallet signing stays outside VeilBid.</strong>
          <span>GemWallet may submit the public Payment after your approval; the dedicated executor still handles FDC/minting and never receives an XRPL signing key.</span>
        </div>
      </div>
    </section>
  );
}
