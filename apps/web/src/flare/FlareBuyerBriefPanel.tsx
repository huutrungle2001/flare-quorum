import { useEffect, useState } from "react";
import type { FlarePublicBuyerBrief } from "@flarequorum/flare-bindings";
import type { FlarePublicTender } from "../public-market/loadFlareMarket";
import { PublicValue } from "../shell/PublicValue";
import { loadFlarePublicBrief, type FlarePublicBriefLoadState } from "./flarePublicBriefRegistry";

const initialState: FlarePublicBriefLoadState = { status: "loading", brief: null };

function categoryLabel(value: FlarePublicBuyerBrief["category"]): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function useVerifiedFlareBuyerBrief(
  metadataHash: FlarePublicTender["metadataHash"],
  env?: Record<string, string | undefined>,
) {
  const [state, setState] = useState<FlarePublicBriefLoadState>(initialState);
  useEffect(() => {
    let cancelled = false;
    setState(initialState);
    void loadFlarePublicBrief(metadataHash, env ?? import.meta.env).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => { cancelled = true; };
  }, [env, metadataHash]);
  return state;
}

export function FlareBuyerBriefPanel({ tender, compact = false, env }: {
  tender: FlarePublicTender;
  compact?: boolean;
  env?: Record<string, string | undefined>;
}) {
  const state = useVerifiedFlareBuyerBrief(tender.metadataHash, env);
  if (state.status !== "verified") {
    const copy = state.status === "loading"
      ? ["VERIFYING PUBLIC BRIEF…", "Checking the registry response against this tender's immutable metadata hash."]
      : state.status === "invalid"
      ? ["BRIEF VERIFICATION FAILED", "The registry response did not match this tender's immutable metadata hash."]
      : state.status === "missing"
        ? ["BRIEF UNAVAILABLE · HASH ONLY", "This earlier tender has no recoverable public Buyer Brief in the registry."]
        : ["BRIEF REGISTRY UNAVAILABLE", "The public Buyer Brief could not be loaded. Contract facts remain available below."];
    return (
      <section className={`buyer-brief-state ${state.status}`} aria-label="Public Buyer Brief status">
        <strong>{copy[0]}</strong>
        <span>{copy[1]} No content is reconstructed or invented.</span>
      </section>
    );
  }
  const brief = state.brief;
  return (
    <section className={`verified-buyer-brief${compact ? " compact" : ""}`} aria-label={`Verified public Buyer Brief: ${brief.title}`}>
      <header>
        <div>
          <p className="eyebrow">PUBLIC BUYER BRIEF / HASH VERIFIED</p>
          <h3>{brief.title}</h3>
        </div>
        <span className="privacy-badge verified">BRIEF VERIFIED</span>
      </header>
      <dl className="buyer-brief-facts">
        <div><dt>Category</dt><dd>{categoryLabel(brief.category)}</dd></div>
        <div><dt>Asset</dt><dd>{brief.asset}</dd></div>
        <div className="wide"><dt>Public objective</dt><dd>{brief.objective}</dd></div>
        <div className="wide"><dt>Acceptance criteria</dt><dd>{brief.acceptanceCriteria}</dd></div>
        <div className="wide"><dt>Vendor questions</dt><dd>{brief.vendorQuestions || "No additional questions."}</dd></div>
      </dl>
      <div className="buyer-brief-vendors">
        <strong>Approved vendors · {brief.approvedVendors.length}</strong>
        <div>{brief.approvedVendors.map((vendor) => <PublicValue key={vendor} value={vendor} label="approved vendor address" />)}</div>
      </div>
    </section>
  );
}
