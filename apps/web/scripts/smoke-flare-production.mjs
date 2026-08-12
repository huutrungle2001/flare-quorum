import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const baseUrl = new URL(
  process.argv[2] ?? process.env.FLAREQUORUM_PRODUCTION_URL ?? "https://flare-quorum.vercel.app",
);
const evidencePath = resolve(
  root,
  process.env.FLAREQUORUM_PRODUCTION_EVIDENCE ?? "evidence/coston2/web-production-smoke.json",
);
const screenshotDirectory = resolve(root, ".local/screenshots");
const release = JSON.parse(
  readFileSync(resolve(root, "packages/flare-contracts/deployments/coston2.release.json"), "utf8"),
);

if (baseUrl.protocol !== "https:") throw new Error("Flare production smoke requires an HTTPS URL");
if (release.chainId !== 114 || release.verified !== true) throw new Error("COSTON2_RELEASE_NOT_VERIFIED");

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

const sourceCommitOverride = (process.env.FLAREQUORUM_SMOKE_SOURCE_COMMIT)?.trim() ?? "";
if (sourceCommitOverride !== "" && !/^[0-9a-f]{40}$/i.test(sourceCommitOverride)) {
  throw new Error("FLAREQUORUM_SMOKE_SOURCE_COMMIT_INVALID");
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function delaySync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const chrome = candidates.find((candidate) => existsSync(candidate));
  if (!chrome) throw new Error("Set CHROME_BIN to run Flare production browser smoke");
  return chrome;
}

function browserCapture(chrome, path, viewport, screenshotName) {
  const screenshotPath = join(screenshotDirectory, screenshotName);
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const profile = mkdtempSync(join(tmpdir(), "flare-quorum-smoke-"));
    try {
      const result = spawnSync(
        chrome,
        [
          "--headless=new",
          "--no-sandbox",
          "--disable-gpu",
          "--hide-scrollbars",
          `--user-data-dir=${profile}`,
          `--window-size=${viewport.width},${viewport.height}`,
          "--virtual-time-budget=30000",
          `--screenshot=${screenshotPath}`,
          "--dump-dom",
          new URL(path, baseUrl).toString(),
        ],
        { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
      );
      const appRendered = result.stdout.includes("FLAREQUORUM") && result.stdout.includes("SKIP TO CONTENT");
      const publicStateLoaded = !result.stdout.includes("Coston2 state unavailable");
      if (result.status === 0 && existsSync(screenshotPath) && appRendered && publicStateLoaded) {
        delaySync(2_000);
        return { dom: result.stdout, screenshot: { viewport, sha256: sha256(screenshotPath) } };
      }
    } finally {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
    delaySync(attempt * 4_000);
  }
  throw new Error(`Chrome smoke failed to render the app for ${path} after 5 attempts`);
}

async function fetchRoute(path) {
  const response = await fetch(new URL(path, baseUrl), { redirect: "follow" });
  return { path, status: response.status, body: await response.text() };
}

mkdirSync(dirname(evidencePath), { recursive: true });
mkdirSync(screenshotDirectory, { recursive: true });

const routes = await Promise.all([
  "/",
  "/flare",
  "/flare?role=treasury",
  "/flare?role=buyer",
  "/flare?role=vendor",
  "/flare?role=finalizer",
  "/flare?role=evidence",
  "/room",
  "/docs",
].map(fetchRoute));
const rootHtml = routes.find((route) => route.path === "/")?.body ?? "";
const assetPaths = [...rootHtml.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
const assetSources = await Promise.all(assetPaths.map(async (path) => {
  const response = await fetch(new URL(path, baseUrl));
  if (!response.ok) throw new Error(`Failed to fetch production asset ${path}`);
  return response.text();
}));

const chrome = findChrome();
const desktop = browserCapture(chrome, "/", { width: 1440, height: 1000 }, "flare-production-desktop.png");
const tenderRoom = browserCapture(chrome, "/flare", { width: 1440, height: 1000 }, "flare-production-tenders.png");
const mobile = browserCapture(chrome, "/flare", { width: 390, height: 844 }, "flare-production-mobile.png");
const evidenceRoute = browserCapture(chrome, "/flare?role=evidence", { width: 1440, height: 1000 }, "flare-production-evidence.png");
const treasuryRoute = browserCapture(chrome, "/flare?role=treasury", { width: 1440, height: 1000 }, "flare-production-treasury.png");
const buyerRoute = browserCapture(chrome, "/flare?role=buyer", { width: 1440, height: 1000 }, "flare-production-buyer.png");
const vendorRoute = browserCapture(chrome, "/flare?role=vendor", { width: 1440, height: 1000 }, "flare-production-vendor.png");
const finalizerRoute = browserCapture(chrome, "/flare?role=finalizer", { width: 1440, height: 1000 }, "flare-production-finalizer.png");
const docsMobile = browserCapture(chrome, "/docs", { width: 390, height: 844 }, "flare-production-docs-mobile.png");

const market = release.contracts.FlareQuorumMarketV2.address;
const assertions = {
  allRoutesReturned200: routes.every((route) => route.status === 200),
  canonicalMarketBundled: assetSources.some((source) => source.toLowerCase().includes(market.toLowerCase())),
  coston2NetworkRendered: desktop.dom.includes('aria-label="Network: Flare Coston2"') && mobile.dom.includes("COSTON2"),
  verifiedReleaseRendered: desktop.dom.includes("VERIFIED COSTON2 RELEASE") && mobile.dom.includes("VERIFIED COSTON2 RELEASE"),
  walletFreeTenderListLoaded: tenderRoom.dom.includes("COSTON2 DOSSIERS") && mobile.dom.includes("COSTON2 DOSSIERS"),
  productStoryRendered: desktop.dom.includes("Private bids.") && desktop.dom.includes("Public awards.") && desktop.dom.includes("THRESHOLD COMPUTE"),
  roleTaxonomyRendered: buyerRoute.dom.includes("PUBLIC") && buyerRoute.dom.includes("BUYER") && buyerRoute.dom.includes("PRIVATE BIDS") && finalizerRoute.dom.includes("ACTIVITY") && evidenceRoute.dom.includes("AUDITOR") && !buyerRoute.dom.includes(">XRP TREASURY<"),
  redundantRailControlsRemoved: !treasuryRoute.dom.includes("sidebar-wallet-button") && !treasuryRoute.dom.includes("WRAP TO vcUSDC") && !treasuryRoute.dom.includes("UNWRAP vcUSDC") && !treasuryRoute.dom.includes("OPEN XRP TREASURY") && !vendorRoute.dom.includes(">FXRP REDEMPTION<"),
  globalRefreshAndWalletAssetsRendered: buyerRoute.dom.includes('aria-label="Refresh state"') && buyerRoute.dom.includes("WALLET ASSETS") && buyerRoute.dom.includes("READ-ONLY"),
  tenderSortRendered: tenderRoom.dom.includes('aria-label="Sort Coston2 tenders"') && tenderRoom.dom.includes("Newest first") && tenderRoom.dom.includes("Oldest first"),
  publicProtocolFactsCollapsed: tenderRoom.dom.includes("protocol-facts-compact") && tenderRoom.dom.includes("Inspect protocol deployment facts"),
  awardedTenderVisible: tenderRoom.dom.includes("AWARDED") && tenderRoom.dom.includes("FTestXRP"),
  privacyBoundaryVisible: tenderRoom.dom.includes("PRIVATE LOSING BIDS") && tenderRoom.dom.includes("Bid payloads are never fetched"),
  publicEvidenceDossierRendered: evidenceRoute.dom.includes("Inspect the binding, not the bids.") && evidenceRoute.dom.includes("AUDIT DOSSIER") && evidenceRoute.dom.includes("Binding → receipts → public outcome") && evidenceRoute.dom.includes("TRUST BINDING") && evidenceRoute.dom.includes("ACCEPTED BID RECEIPTS") && evidenceRoute.dom.includes("Ordered bid root"),
  publicEvidenceNoWalletGate: evidenceRoute.dom.includes("PUBLIC VERIFICATION ONLY") && evidenceRoute.dom.includes("NO BID DECRYPTION") && !evidenceRoute.dom.includes("Wallet providers are unavailable"),
  publicFinalizerRendered: finalizerRoute.dom.includes("Advance public checkpoints.") && finalizerRoute.dom.includes("ACTION CENTER / CANONICAL CHECKPOINTS") && finalizerRoute.dom.includes("TRACKING ONLY") && finalizerRoute.dom.includes("Activity shows the next step only.") && finalizerRoute.dom.includes("VIEW PUBLIC DOSSIER") && finalizerRoute.dom.includes("no bid-decryption capability") && !finalizerRoute.dom.includes("Selection attempt") && !finalizerRoute.dom.includes("OPEN RELAY RUNBOOK"),
  buyerBriefRendered: buyerRoute.dom.includes("Public objective") && buyerRoute.dom.includes("Acceptance criteria") && buyerRoute.dom.includes("Optional vendor questions"),
  vendorSubmissionNavigationRendered: vendorRoute.dom.includes("SUBMIT BID") && vendorRoute.dom.includes("MY SUBMISSIONS") && vendorRoute.dom.includes("REVIEW SEALED BID") && vendorRoute.dom.includes("THIS PRIVATE BID IS NOT SAVED"),
  xrpFundingJourneyRendered: treasuryRoute.dom.includes("BUYER / CHOOSE A FUNDING PATH") && treasuryRoute.dom.includes("FLAGSHIP FUNDING / XRPL → FDC → SMART ACCOUNT") && treasuryRoute.dom.includes("DEFINE RULES") && treasuryRoute.dom.includes("CONNECT &amp; PAY") && treasuryRoute.dom.includes("FDC &amp; MINT") && treasuryRoute.dom.includes("TENDER OPENED") && treasuryRoute.dom.includes("Define your tender rules.") && treasuryRoute.dom.includes("Review the XRP payment.") && treasuryRoute.dom.includes("NON-CUSTODIAL") && treasuryRoute.dom.includes("XRPL owner address") && treasuryRoute.dom.includes("ADVANCED FUNDING DETAILS") && treasuryRoute.dom.includes("XRPL wallet signing stays outside FlareQuorum."),
  unifiedBuyerDefaultsToCoston2: buyerRoute.dom.includes("BUYER / CHOOSE A FUNDING PATH") && buyerRoute.dom.includes("COSTON2 / FTESTXRP") && buyerRoute.dom.includes("XRPL / XRP · ADVANCED") && buyerRoute.dom.includes("Open a Coston2 tender") && !buyerRoute.dom.includes("Keep the XRPL signature outside FlareQuorum"),
  activityRedemptionBoundaryRendered: finalizerRoute.dom.includes("ASSETS &amp; REDEMPTION") && finalizerRoute.dom.includes("Redeem awarded FTestXRP.") && finalizerRoute.dom.includes("XRP REDEMPTION · LOCKED") && finalizerRoute.dom.includes("Available after your wallet wins an awarded tender.") && !vendorRoute.dom.includes("Redeem awarded FTestXRP."),
  noPublicStateFailureRendered: [desktop, tenderRoom, mobile, evidenceRoute, treasuryRoute, buyerRoute, vendorRoute, finalizerRoute]
    .every((capture) => !capture.dom.includes("Coston2 state unavailable") && !capture.dom.includes("Flare state unavailable")),
  mobileTenderNavigationActive: mobile.dom.includes('class="primary-nav-link active"') && mobile.dom.includes('aria-current="page"'),
  docsRouteRendered: docsMobile.dom.includes("CURRENT JUDGE PATH") && docsMobile.dom.includes("Five primitives, one product path") && docsMobile.dom.includes("Same-identity restore is not claimed") && docsMobile.dom.includes('class="docs-nav"'),
  historicalSepoliaRouteHiddenFromCurrentDocs: docsMobile.dom.includes("Chain 114 is the only current Flare judge path") && !docsMobile.dom.includes("OPEN HISTORICAL SEPOLIA BASELINE") && !docsMobile.dom.includes('href="/room"'),
  desktopScreenshotCaptured: desktop.screenshot.sha256.length === 64,
  mobileScreenshotCaptured: mobile.screenshot.sha256.length === 64,
  docsMobileScreenshotCaptured: docsMobile.screenshot.sha256.length === 64,
};
const blockers = Object.entries(assertions).filter(([, passed]) => !passed).map(([name]) => name);
const evidence = {
  schemaVersion: 1,
  suite: "coston2-frontend-smoke",
  recordedAt: new Date().toISOString(),
  publicIdentifiers: {
    sourceCommit: sourceCommitOverride || git("rev-parse", "HEAD"),
    provider: "vercel",
    project: "flare-quorum",
    canonicalUrl: baseUrl.origin,
    network: release.network,
    chainId: release.chainId,
    deploymentKind: release.kind,
    deploymentVerified: release.verified,
    market,
    awardReceipt: release.contracts.FlareQuorumAwardReceiptV2.address,
  },
  routeStatuses: Object.fromEntries(routes.map((route) => [route.path, route.status])),
  visualChecks: {
    desktop: desktop.screenshot,
    tenders: tenderRoom.screenshot,
    mobile: mobile.screenshot,
    evidence: evidenceRoute.screenshot,
    treasury: treasuryRoute.screenshot,
    buyer: buyerRoute.screenshot,
    vendor: vendorRoute.screenshot,
    finalizer: finalizerRoute.screenshot,
    docsMobile: docsMobile.screenshot,
  },
  assertions,
  blockers,
  notes: [
    "The deployed v2 Vercel project loaded the verified Coston2 public market without a wallet.",
    "The Auditor route reread the same finalized market snapshot without a wallet, bid payload, signer, or decryption capability.",
    "The Public Finalizer route exposes only canonical lifecycle actions; FCC dispatch and threshold grouping remain dedicated relay operations.",
    "Activity exposes the official redemption boundary in a locked state until the connected Coston2 wallet is the public winner of an awarded tender; Private Bids does not duplicate redemption controls.",
    "The unified Buyer route defaults to direct Coston2/FTestXRP funding and exposes the structured public brief without collecting bid plaintext.",
    "The legacy treasury URL selects the advanced XRP-native option inside Buyer and presents one ordered Define Rules → Connect & Pay → FDC & Mint → Tender Opened journey; this wallet-free smoke does not submit a payment and no XRPL secret is accepted.",
    "The global refresh control, read-only wallet-assets panel, and public tender sort controls are rendered without requesting a signature.",
    "The /docs route serves only the current Flare judge path and does not expose a navigation link to the historical Sepolia/Nox route.",
    "Tender state and award receipts are read from finalized Coston2 contract state; sealed bid payloads are never fetched.",
    "Screenshots remain local smoke artifacts; only public-safe viewport and digest metadata are committed.",
  ],
};

writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(evidence, null, 2));
if (blockers.length > 0) process.exitCode = 1;
