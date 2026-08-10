import type { PublicBid, PublicTender } from "@flarequorum/chain-bindings";
import { useEffect, useRef } from "react";
import { SafeTreasuryWorkspace } from "../safe/SafeTreasuryWorkspace";
import { ContextHelp } from "../shell/ContextHelp";
import { scrollToPageTop } from "../shell/navigationScroll";
import type { WalletController } from "../wallet/WalletPanel";
import {
  RoleWorkspace,
  type PrivateBidsSection,
} from "./RoleWorkspace";

export type BuyerSection = "safe" | "eoa";

function SubNavigation<T extends string>({
  ariaLabel,
  active,
  items,
  onChange,
}: {
  ariaLabel: string;
  active: T;
    items: readonly { id: T; label: string; description: string; mobileLabel?: string }[];
  onChange: (id: T) => void;
}) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const activeButton = activeRef.current;
    const scrollParent = activeButton?.parentElement;
    if (!activeButton || !scrollParent) return;
    if (scrollParent.scrollWidth <= scrollParent.clientWidth) return;
    const rightEdge = activeButton.offsetLeft + activeButton.offsetWidth;
    scrollParent.scrollLeft = Math.max(
      0,
      rightEdge - scrollParent.clientWidth + 4,
    );
  }, [active]);

  return (
    <nav className="workspace-subnav" aria-label={ariaLabel}>
      <div className="workspace-subnav-heading">
        <span className="eyebrow">WORKSPACE VIEW</span>
        <ContextHelp
          compact
          label={`Help for ${ariaLabel}`}
          title="HOW TO USE THIS WORKSPACE"
          steps={items.map((item) => `${item.label}: ${item.description}`)}
          note="The selected view is kept in the URL so refresh and shared links remain stable."
        />
      </div>
      <div className="workspace-subnav-links">
        {items.map((item) => (
          <button
            key={item.id}
            ref={item.id === active ? activeRef : undefined}
            className={item.id === active ? "active" : ""}
            type="button"
            aria-current={item.id === active ? "page" : undefined}
            onClick={() => {
              scrollToPageTop();
              onChange(item.id);
            }}
          >
            <strong>
              <span className="workspace-label-full">{item.label}</span>
              <span className="workspace-label-mobile">
                {item.mobileLabel ?? item.label}
              </span>
            </strong>
            <small>{item.description}</small>
          </button>
        ))}
      </div>
    </nav>
  );
}

export function BuyerWorkspace({
  wallet,
  onRefresh,
  section,
  onSectionChange,
}: {
  wallet: WalletController;
  onRefresh: () => void;
  section: BuyerSection;
  onSectionChange: (section: BuyerSection) => void;
}) {
  return (
    <div className="combined-workspace">
      <SubNavigation
        ariaLabel="Buyer sections"
        active={section}
        onChange={onSectionChange}
        items={[
          {
            id: "eoa",
            label: "EOA BUYER",
            description: "Use a direct wallet",
            mobileLabel: "EOA",
          },
          {
            id: "safe",
            label: "SAFE BUYER",
            description: "Use a Safe treasury",
            mobileLabel: "SAFE",
          },
        ]}
      />
      {section === "safe" ? (
        <SafeTreasuryWorkspace wallet={wallet} onRefresh={onRefresh} />
      ) : (
        <RoleWorkspace
          role="BUYER"
          wallet={wallet}
          tenders={[]}
          bids={[]}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}

export function PrivateBidsWorkspace({
  wallet,
  tenders,
  bids,
  onRefresh,
  section,
  onSectionChange,
}: {
  wallet: WalletController;
  tenders: readonly PublicTender[];
  bids: readonly PublicBid[];
  onRefresh: () => void;
  section: PrivateBidsSection;
  onSectionChange: (section: PrivateBidsSection) => void;
}) {
  return (
    <div className="combined-workspace">
      <SubNavigation
        ariaLabel="Private bids sections"
        active={section}
        onChange={onSectionChange}
        items={[
          {
            id: "submit",
            label: "SUBMIT BID",
            description: "Encrypt and submit",
            mobileLabel: "BID",
          },
          {
            id: "my-bid",
            label: "MY BID",
            description: "Reveal or share",
            mobileLabel: "MY BID",
          },
          {
            id: "granted-access",
            label: "GRANTED ACCESS",
            description: "Review authorized bids",
            mobileLabel: "ACCESS",
          },
        ]}
      />
      <RoleWorkspace
        role="VENDOR"
        privateSection={section}
        wallet={wallet}
        tenders={tenders}
        bids={bids}
        onRefresh={onRefresh}
      />
    </div>
  );
}
