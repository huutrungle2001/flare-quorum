import type { PublicBid, PublicTender } from "@flarequorum/chain-bindings";
import { DisclosurePanel } from "../disclosure/DisclosurePanel";
import { WalletPanel, type WalletController } from "../wallet/WalletPanel";
import { BuyerTenderForm } from "./BuyerTenderForm";
import { VendorBidForm } from "./VendorBidForm";
import { ContextHelp } from "../shell/ContextHelp";
import { GrantedAccessPanel } from "../auditor/AuditorWorkspace";

export type InteractiveRole = "BUYER" | "VENDOR";
export type PrivateBidsSection = "submit" | "my-bid" | "granted-access";

export function RoleWorkspace({
  role,
  wallet,
  tenders,
  bids,
  onRefresh,
  privateSection,
}: {
  role: InteractiveRole;
  wallet: WalletController;
  tenders: readonly PublicTender[];
  bids: readonly PublicBid[];
  onRefresh: () => void;
  privateSection?: PrivateBidsSection;
}) {
  const buyer = role === "BUYER";
  const privateSectionToRender = privateSection ?? "submit";
  const privateView =
    privateSectionToRender === "my-bid"
      ? {
          eyebrow: "PRIVATE BIDS / MY BID",
          title: "Reveal or share your bid.",
          description:
            "Decrypt only your own stored bid or grant one viewer access to that bid.",
          stages: [
            "Select your stored bid",
            "Reveal in this session or enter a viewer",
            "Confirm the per-bid action",
            "Keep the plaintext in this browser only",
          ],
        }
      : privateSectionToRender === "granted-access"
        ? {
            eyebrow: "PRIVATE BIDS / GRANTED ACCESS",
            title: "Review one authorized bid.",
            description:
              "See only bids whose on-chain viewer permission includes this wallet, then reveal one privately.",
            stages: [
              "Load authorized bid references",
              "Select a granted bid",
              "Reveal the authorized handle",
              "Clear plaintext when the wallet session changes",
            ],
          }
        : {
            eyebrow: "PRIVATE BIDS / VENDOR & REVIEWER",
            title: "Submit a sealed bid.",
            description:
              "Vendors submit one immutable encrypted price; reviewers reveal only authorized bids.",
            stages: [
              "Verify vendor admission",
              "Encrypt price for market",
              "Simulate and sign the bid transaction",
              "Refresh the confirmed dossier",
            ],
          };
  return (
    <main className="role-workspace" id="main-content">
      <section className="workspace-intro">
        <ContextHelp
          label={`Help for ${buyer ? "EOA Buyer" : "Private Bids"} workspace`}
          title={buyer ? "HOW TO USE EOA BUYER" : "HOW TO USE PRIVATE BIDS"}
          steps={
            buyer
              ? [
                  "Connect the Sepolia wallet that will own the tender.",
                  "Enter public metadata, the vUSDC ceiling, a future deadline, and 1–8 approved vendor addresses.",
                  "Ensure Test USDC covers the ceiling, then confirm wrap, operator approval, and creation in order.",
                  "Wait for the Nox funding proof, then confirm the permissionless transaction that opens the tender. The relay remains a fallback.",
                ]
              : [
                  "Connect the exact Sepolia account approved by the buyer.",
                  "Select an Open tender and enter a private price no higher than its public ceiling.",
                  "Confirm encryption, simulation, and the bid transaction; the plaintext stays in this browser session.",
                  "Use My Bid to reveal or share your own bid, and Granted Access for bids shared with this wallet.",
                ]
          }
          note={
            buyer
              ? "Tender terms and vendor addresses are public; escrow and bid values remain confidential."
              : "Each approved vendor submits one immutable encrypted bid before the deadline."
          }
        />
        <p className="eyebrow">{buyer ? "EOA BUYER / DIRECT WALLET" : privateView.eyebrow}</p>
        <h1>
          {buyer ? "Fund public terms." : privateView.title}
        </h1>
        <p>
          {buyer
            ? "Create an exactly funded tender without gaining access to open vendor prices."
            : privateView.description}
        </p>
      </section>
      <WalletPanel wallet={wallet} />
      {buyer && (
        <BuyerTenderForm wallet={wallet} onConfirmed={onRefresh} />
      )}
      {!buyer && privateSectionToRender === "submit" && (
        <VendorBidForm
          wallet={wallet}
          tenders={tenders}
          onConfirmed={onRefresh}
        />
      )}
      {!buyer && privateSectionToRender === "my-bid" && (
          <DisclosurePanel
            role={role}
            wallet={wallet}
            tenders={tenders}
            bids={bids}
            onConfirmed={onRefresh}
          />
      )}
      {!buyer && privateSectionToRender === "granted-access" && (
        <GrantedAccessPanel wallet={wallet} tenders={tenders} bids={bids} />
      )}
      <section className="journey-preview">
        <p className="eyebrow">TRANSACTION STAGES</p>
        <ol>
          {(buyer
            ? [
                "Check Test USDC and wrap the ceiling",
                "Approve market operator",
                "Create funded tender",
                "Wait for exact-funding proof",
                "Confirm and open tender on-chain",
              ]
            : privateView.stages
          ).map((stage, index) => (
            <li key={stage}>
              <span>{index + 1}</span>
              {stage}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
