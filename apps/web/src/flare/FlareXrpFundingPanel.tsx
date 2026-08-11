import { useState } from "react";
import type { Address, Hex } from "viem";
import { ContextHelp } from "../shell/ContextHelp";
import { sendXrplTestnetPaymentWithGemWallet } from "./xrplWallet";
import {
  clearPublicFlareFundingCheckpoint,
  readPublicFlareFundingCheckpoint,
  savePublicFlareFundingCheckpoint,
  type PublicFlareFundingCheckpoint,
} from "./fundingCheckpoint";

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
  const [checkpoint, setCheckpoint] = useState<PublicFlareFundingCheckpoint | null>(() => readPublicFlareFundingCheckpoint());
  const [xrplOwner, setXrplOwner] = useState(() => checkpoint?.xrplOwner ?? "");
  const [xrplTransactionId, setXrplTransactionId] = useState(() => checkpoint?.xrplTransactionId ?? "");
  const [walletId, setWalletId] = useState(() => checkpoint?.walletId ?? "0");
  const [executorFeeUBA, setExecutorFeeUBA] = useState(() => checkpoint?.executorFeeUBA ?? "");
  const [preview, setPreview] = useState<XrpFundingPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletSubmitted, setWalletSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [paymentCopied, setPaymentCopied] = useState(false);

  function saveCheckpoint(input: { xrplOwner: string; xrplTransactionId: string; walletId: string; executorFeeUBA: string }) {
    const transactionBody = input.xrplTransactionId.trim().replace(/^0x/i, "");
    if (!/^[0-9a-f]{64}$/i.test(transactionBody)) return;
    const next = {
      xrplOwner: input.xrplOwner.trim(),
      xrplTransactionId: `0x${transactionBody.toLowerCase()}` as `0x${string}`,
      walletId: input.walletId.trim(),
      executorFeeUBA: input.executorFeeUBA.trim(),
    };
    try {
      savePublicFlareFundingCheckpoint(next);
      setCheckpoint({ schemaVersion: 1, ...next });
    } catch {
      // Invalid input remains visible in the form and is rejected by prepare.
    }
  }

  function forgetCheckpoint() {
    clearPublicFlareFundingCheckpoint();
    setCheckpoint(null);
  }

  async function resumeCheckpoint() {
    if (!checkpoint) return;
    await prepare();
  }

  async function prepare() {
    setBusy(true);
    setError(null);
    setCopied(false);
    setPaymentCopied(false);
    setWalletSubmitted(false);
    try {
      const nextPreview = await onPrepare({ xrplOwner, xrplTransactionId, walletId, executorFeeUBA });
      setPreview(nextPreview);
      if (nextPreview.xrplTransactionId) {
        saveCheckpoint({ xrplOwner, xrplTransactionId: nextPreview.xrplTransactionId, walletId, executorFeeUBA: nextPreview.executorFeeUBA });
      }
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
      saveCheckpoint({ xrplOwner, xrplTransactionId: transactionId, walletId, executorFeeUBA: preview.executorFeeUBA });
      setWalletSubmitted(true);
      try {
        const refreshed = await onPrepare({
          xrplOwner,
          xrplTransactionId: transactionId,
          walletId,
          executorFeeUBA,
        });
        setPreview(refreshed);
        if (refreshed.xrplTransactionId) {
          saveCheckpoint({ xrplOwner, xrplTransactionId: refreshed.xrplTransactionId, walletId, executorFeeUBA: refreshed.executorFeeUBA });
        }
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
    <section className="flare-xrp-funding-panel xrp-payment-step" aria-label="XRP-native funding handoff">
      <header className="detail-header input-card-header">
        <div>
          <p className="eyebrow">STEP 02 / CONNECT &amp; PAY</p>
          <h2>Review the XRP payment.</h2>
        </div>
        <div className="input-card-tools">
          <ContextHelp
            compact
            label="Help for XRP payment"
            title="HOW TO FUND THIS TENDER WITH XRP"
            steps={[
              "Enter an XRPL Testnet address you control, then review the payment calculated from the tender rules above.",
              "Approve the exact destination, amount, and memo inside GemWallet; FlareQuorum never receives your wallet key.",
              "After payment, preserve the public transaction ID and executor handoff. Do not pay a second time if minting is delayed.",
            ]}
            note="The current browser prepares the public executor handoff; it does not claim that FDC, minting, or tender creation has completed."
          />
          <span className="privacy-badge verified">NON-CUSTODIAL</span>
        </div>
      </header>
      <p className="funding-lede">
        Your XRPL wallet signs the payment. FlareQuorum reads only public account,
        payment, and Smart Account identifiers; it never asks for a seed, private
        key, FDC credential, or executor signer.
      </p>
      <div className="funding-handoff-form">
        <label>
          XRPL owner address
          <input id="xrpl-owner-address" required value={xrplOwner} onChange={(event) => setXrplOwner(event.target.value)} placeholder="r… (public classic address)" autoComplete="off" disabled={busy} />
          <small>Use an XRPL testnet classic address you control. Never paste a secret.</small>
        </label>
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="funding-actions">
        <button className="primary-button" type="button" onClick={() => void prepare()} disabled={busy || walletBusy}>
          {busy ? "READING COSTON2…" : xrplTransactionId.trim() ? "PREPARE EXECUTOR HANDOFF →" : "REVIEW XRP PAYMENT →"}
        </button>
      </div>
      {preview && (
        <section className="funding-preview" aria-label="Public XRP funding preview">
          <header className="detail-header">
            <div>
              <p className="eyebrow">{preview.xrplTransactionId ? "PAYMENT RECEIVED / HANDOFF READY" : "STEP 03 / REVIEW & PAY"}</p>
              <h3>{preview.xrplTransactionId ? "Preserve this payment for the executor." : "Approve the exact XRP payment in your wallet."}</h3>
            </div>
            <span className={`privacy-badge ${preview.xrplTransactionId ? "verified" : ""}`}>{preview.xrplTransactionId ? "PUBLIC TX CONFIRMED" : "AWAITING SIGNATURE"}</span>
          </header>
          <dl className="term-grid">
            <div><dt>XRPL payment</dt><dd>{preview.paymentAmountUBA} UBA · mint fee {preview.mintingFeeUBA} UBA</dd></div>
            <div><dt>Payment destination</dt><dd>{preview.paymentDestination}</dd></div>
            <div><dt>XRPL transaction</dt><dd>{preview.xrplTransactionId ? <a className="text-link" href={`https://testnet.xrpl.org/transactions/${preview.xrplTransactionId.slice(2)}`} target="_blank" rel="noreferrer">{preview.xrplTransactionId.slice(0, 10)}… ↗</a> : <span>Not submitted yet</span>}</dd></div>
          </dl>
          {!preview.xrplTransactionId && (
            <button className="secondary-button" type="button" onClick={() => void submitWithGemWallet()} disabled={busy || walletBusy || walletSubmitted || Boolean(preview.xrplTransactionId)}>
              {walletBusy ? "WAITING FOR GEMWALLET…" : "PAY XRP WITH GEMWALLET →"}
            </button>
          )}
          {preview.jobJson ? <>
            <div className="funding-pending-state" role="status">
              <strong>Executor handoff ready — tender not opened yet.</strong>
              <span>This browser has not run FDC verification, Smart Account minting, or Coston2 tender creation. Preserve this public job and do not pay again.</span>
            </div>
            <button className="secondary-button" type="button" onClick={() => void copyJob()}>{copied ? "COPIED EXECUTOR HANDOFF ✓" : "COPY EXECUTOR HANDOFF →"}</button>
          </> : <p className="form-hint"><strong>Payment review only.</strong> Pay with GemWallet or enter a confirmed transaction ID in Advanced funding details to prepare the executor handoff.</p>}
        </section>
      )}
      <details className="funding-job-details advanced-funding-details">
        <summary>ADVANCED FUNDING DETAILS <span aria-hidden="true">⌄</span></summary>
        <div className="funding-handoff-form">
          <label>
            XRPL payment transaction ID
            <input id="xrpl-payment-transaction-id" value={xrplTransactionId} onChange={(event) => {
              const value = event.target.value;
              setXrplTransactionId(value);
              saveCheckpoint({ xrplOwner, xrplTransactionId: value, walletId, executorFeeUBA });
            }} placeholder="64-hex transaction ID (after payment)" autoComplete="off" disabled={busy} />
            <small>GemWallet fills this automatically. Use manual entry only after an external wallet confirms the same payment.</small>
          </label>
          <label>
            Smart Account wallet ID
            <input id="smart-account-wallet-id" inputMode="numeric" value={walletId} onChange={(event) => setWalletId(event.target.value)} placeholder="0" autoComplete="off" disabled={busy} />
          </label>
          <label>
            Executor fee (UBA, optional)
            <input id="executor-fee-uba" inputMode="numeric" value={executorFeeUBA} onChange={(event) => setExecutorFeeUBA(event.target.value)} placeholder="official Coston2 fee" autoComplete="off" disabled={busy} />
            <small>Leave blank to use the official fee. A custom value must match the current AssetManager fee.</small>
          </label>
        </div>
        {preview && <>
          <dl className="term-grid">
            <div><dt>PersonalAccount</dt><dd>{preview.personalAccount}</dd></div>
            <div><dt>Smart Account nonce</dt><dd>{preview.nonce}</dd></div>
            <div><dt>Wallet ID / fee</dt><dd>{preview.walletId} / {preview.executorFeeUBA} UBA</dd></div>
          </dl>
          <label className="funding-code-field">0xFE memo data<textarea readOnly value={preview.memoData} rows={3} aria-label="0xFE memo data" /></label>
          <details className="funding-job-details">
            <summary>WALLET-READY XRPL PAYMENT JSON</summary>
            <pre>{preview.paymentDraftJson}</pre>
          </details>
          <button className="secondary-button" type="button" onClick={() => void copyPaymentDraft()}>{paymentCopied ? "COPIED PAYMENT JSON ✓" : "COPY PAYMENT JSON"}</button>
          {preview.jobJson && <details className="funding-job-details"><summary>PUBLIC EXECUTOR JOB JSON</summary><pre>{preview.jobJson}</pre></details>}
        </>}
        <a className="text-link" href="/docs#xrp-funding">VIEW TECHNICAL FUNDING GUIDE ↗</a>
      </details>
      {checkpoint && !preview && (
        <div className="form-hint" role="status">
          Public payment checkpoint restored after reload. It contains only the XRPL owner and transaction hash; no wallet secret or bid material is stored.
          <button className="secondary-button" type="button" onClick={() => void resumeCheckpoint()} disabled={busy || walletBusy}>RESTORE PAYMENT HANDOFF →</button>
          <button className="text-button" type="button" onClick={forgetCheckpoint}>FORGET CHECKPOINT</button>
        </div>
      )}
      <div className="readiness-strip" aria-live="polite">
        <span className="signal-dot" aria-hidden="true" />
        <div>
          <strong>XRPL wallet signing stays outside FlareQuorum.</strong>
          <span>GemWallet may submit the public Payment after your approval. The dedicated executor remains responsible for FDC and minting; this UI never claims those steps succeeded early.</span>
        </div>
      </div>
    </section>
  );
}
