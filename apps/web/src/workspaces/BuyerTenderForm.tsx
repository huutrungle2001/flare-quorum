import { useEffect, useState } from "react";
import {
  createBuyerTender,
  type BuyerTenderStage,
} from "../transactions/buyerTender";
import type { WalletController } from "../wallet/WalletPanel";
import { useToasts } from "../shell/ToastProvider";
import {
  confirmCreatedTenderFunding,
  type FundingConfirmationStage,
} from "../transactions/tenderFunding";
import { transactionErrorMessage } from "../transactions/errors";
import type { Hex } from "viem";
import { ContextHelp } from "../shell/ContextHelp";

const labels: Record<BuyerTenderStage, string> = {
  "approve-wrapper": "Approving official wrapper",
  wrap: "Wrapping confidential vUSDC",
  "approve-market": "Authorizing market operator",
  create: "Creating and funding tender",
  confirmed: "Tender created; preparing exact-funding verification",
};

const fundingLabels: Record<FundingConfirmationStage, string> = {
  reading: "Reading the new tender funding state",
  "requesting-proof": "Waiting for the public Nox funding proof",
  simulating: "Simulating exact-funding confirmation",
  signing: "Confirm funding in your wallet",
  confirming: "Waiting for Sepolia to open the tender",
  open: "Exact funding confirmed; tender is Open",
  cancelled: "Funding was insufficient; tender is Cancelled",
};

function minimumLocalDeadline() {
  const deadline = new Date(Date.now() + 300_000);
  deadline.setMinutes(
    deadline.getMinutes() - deadline.getTimezoneOffset(),
  );
  return deadline.toISOString().slice(0, 16);
}

function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function BuyerTenderForm({
  wallet,
  onConfirmed,
}: {
  wallet: WalletController;
  onConfirmed: () => void;
}) {
  const toasts = useToasts();
  const [metadata, setMetadata] = useState("");
  const [ceiling, setCeiling] = useState("");
  const [deadline, setDeadline] = useState("");
  const [vendors, setVendors] = useState([""]);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const pending = stage !== null;
  const connected =
    wallet.state.status === "connected" &&
    wallet.state.account &&
    wallet.state.walletClient;

  useEffect(() => {
    setStage(null);
    setError(null);
    setResult(null);
  }, [wallet.state.sessionRevision]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!connected) return;
    const toastId = toasts.startStack(
      "CREATE TENDER",
      "Validating public terms and test balances…",
    );
    setStage("Validating public terms and test balances");
    setError(null);
    setResult(null);
    let createdTender: {
      tenderId: bigint;
      transactionHash: Hex;
    } | null = null;
    try {
      const created = await createBuyerTender({
        walletClient: wallet.state.walletClient!,
        account: wallet.state.account!,
        draft: {
          metadata,
          ceilingInput: ceiling,
          deadlineInput: deadline,
          vendorInput: vendors.join("\n"),
        },
        onStage: (nextStage) => {
          const nextLabel = labels[nextStage];
          setStage(nextLabel);
          toasts.update(toastId, nextLabel);
        },
      });
      createdTender = created;
      setResult(
        `Tender ${created.tenderId.toString()} created; verifying exact funding…`,
      );
      onConfirmed();
      const funding = await confirmCreatedTenderFunding({
        tenderId: created.tenderId,
        triggerTransactionHash: created.transactionHash,
        walletClient: wallet.state.walletClient!,
        account: wallet.state.account!,
        onStage: (nextStage) => {
          const nextLabel = fundingLabels[nextStage];
          setStage(nextLabel);
          toasts.update(toastId, nextLabel);
        },
      });
      if (funding.status === "cancelled") {
        throw new Error(
          "The tender was cancelled because the wallet could not escrow the full public ceiling.",
        );
      }
      setResult(`Tender ${created.tenderId.toString()} is Open and accepting bids.`);
      setStage(null);
      toasts.succeed(toastId, fundingLabels.open);
      onConfirmed();
    } catch (cause) {
      setStage(null);
      toasts.fail(
        toastId,
        createdTender
          ? "Tender was created, but direct funding confirmation stopped. The relay fallback can finish it."
          : "Tender creation stopped. Review the form or wallet request.",
      );
      setError(
        transactionErrorMessage(
          cause,
          createdTender
            ? "Tender creation succeeded, but funding confirmation is still pending. Resume from Activity or allow the relay fallback to finish."
            : "Tender creation stopped before confirmation.",
        ),
      );
    }
  }

  return (
    <form
      className="write-form safe-tender-form eoa-tender-form"
      onSubmit={(event) => void submit(event)}
    >
      <header className="safe-tender-form-header">
        <div className="form-heading">
          <p className="eyebrow">CREATE TENDER / DIRECT WALLET</p>
          <h2>Create an EOA-owned tender</h2>
          <p>
            Define the public terms and fund the exact confidential ceiling
            directly from this wallet.
          </p>
          <ContextHelp
            compact
            label="Help for EOA tender creation"
            title="HOW TO CREATE AN EOA TENDER"
            steps={[
              "Enter public terms, ceiling, deadline, and approved vendors.",
              "Ensure BALANCES has enough Test USDC; the form never calls the faucet automatically.",
              "The connected wallet wraps and funds the exact ceiling.",
              "Confirm the funding proof so the tender becomes Open.",
            ]}
            note="If the browser stops after creation, Activity or the relay can recover funding confirmation."
          />
        </div>
        <div className="safe-tender-context eoa-tender-context">
          <span>DIRECT WALLET</span>
          <strong>{connected ? shortAddress(wallet.state.account!) : "NOT CONNECTED"}</strong>
          <small>EOA owner · threshold 1</small>
        </div>
      </header>

      <div className="safe-tender-form-body">
        <section className="safe-tender-terms">
          <div className="safe-tender-section-heading">
            <span>01</span>
            <div>
              <strong>TENDER TERMS</strong>
              <small>Public procurement rules</small>
            </div>
          </div>
          <label className="safe-tender-metadata">
            <span>Public metadata</span>
            <input
              value={metadata}
              onChange={(event) => setMetadata(event.target.value)}
              maxLength={240}
              disabled={pending}
              placeholder="Procurement title or terms fingerprint source"
              required
            />
          </label>
          <label>
            <span>Public ceiling (vUSDC)</span>
            <input
              value={ceiling}
              onChange={(event) => setCeiling(event.target.value)}
              inputMode="decimal"
              disabled={pending}
              placeholder="100"
              required
            />
          </label>
          <label>
            <span>Bid deadline</span>
            <input
              type="datetime-local"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
              min={minimumLocalDeadline()}
              disabled={pending}
              required
            />
            <small className="field-hint">
              Local machine time; choose at least five minutes from now so
              funding proof and vendor signing have time to complete.
            </small>
          </label>
        </section>

        <fieldset className="safe-tender-vendors">
          <legend>
            <span className="safe-tender-section-heading">
              <span>02</span>
              <span>
                <strong>APPROVED VENDORS</strong>
                <small>One immutable bid slot per address</small>
              </span>
            </span>
            <span className="safe-vendor-count">{vendors.length} / 8</span>
          </legend>
          <small id="approved-vendors-help" className="field-hint">
            Add one wallet address per row. You can also paste comma- or
            whitespace-separated addresses into a row.
          </small>
          <div className="safe-vendor-list">
            {vendors.map((vendor, index) => (
              <div className="safe-vendor-row" key={`eoa-vendor-${index}`}>
                <label htmlFor={`approved-vendor-${index}`}>
                  <span>Vendor {index + 1}</span>
                  <input
                    id={`approved-vendor-${index}`}
                    value={vendor}
                    onChange={(event) => {
                      const pasted = event.target.value
                        .split(/[\s,]+/)
                        .filter(Boolean);
                      if (pasted.length > 1) {
                        setVendors((current) => [
                          ...current.slice(0, index),
                          ...pasted.slice(0, 8 - index),
                          ...current.slice(index + 1),
                        ]);
                      } else {
                        setVendors((current) =>
                          current.map((value, itemIndex) =>
                            itemIndex === index ? event.target.value : value,
                          ),
                        );
                      }
                    }}
                    disabled={pending}
                    placeholder="0x…"
                    aria-describedby="approved-vendors-help"
                    required
                  />
                </label>
                {vendors.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setVendors((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    disabled={pending}
                    aria-label={`Remove vendor ${index + 1}`}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            className="safe-vendor-add"
            type="button"
            onClick={() => setVendors((current) => [...current, ""])}
            disabled={pending || vendors.length >= 8}
          >
            + ADD VENDOR
          </button>
        </fieldset>
      </div>

      <footer className="safe-tender-submit">
        <div>
          <p className="eyebrow">03 / REVIEW &amp; SUBMIT</p>
          <dl>
            <div>
              <dt>WALLET AUTHORITY</dt>
              <dd>DIRECT EOA</dd>
            </div>
            <div>
              <dt>REVIEW ACCESS</dt>
              <dd>AFTER FINALIZATION</dd>
            </div>
          </dl>
          <small>
            This wallet signs normal transactions and receives private bid
            access only after proof-derived finalization.
          </small>
        </div>
        <button
          className="primary-button"
          type="submit"
          disabled={!connected || pending}
        >
          {connected ? "CREATE WITH EOA →" : "CONNECT WALLET TO CREATE"}
        </button>
      </footer>

      {stage && (
        <p className="progress-line" aria-live="polite">
          <span className="signal-dot" aria-hidden="true" />
          {stage}
        </p>
      )}
      {error && <p className="inline-error" role="alert">{error}</p>}
      {result && <p className="result-line" aria-live="polite">{result}</p>}
    </form>
  );
}
