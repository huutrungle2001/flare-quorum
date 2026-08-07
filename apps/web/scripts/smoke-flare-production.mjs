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
  process.argv[2] ?? process.env.VEILBID_FLARE_PRODUCTION_URL ?? "https://veilbid-flare.vercel.app",
);
const evidencePath = resolve(
  root,
  process.env.VEILBID_FLARE_PRODUCTION_EVIDENCE ?? "evidence/coston2/web-production-smoke.json",
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

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
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
  const profile = mkdtempSync(join(tmpdir(), "veilbid-flare-smoke-"));
  const screenshotPath = join(screenshotDirectory, screenshotName);
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
    if (result.status !== 0 || !existsSync(screenshotPath)) {
      throw new Error(`Chrome smoke failed for ${path}`);
    }
    return { dom: result.stdout, screenshot: { viewport, sha256: sha256(screenshotPath) } };
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
}

async function fetchRoute(path) {
  const response = await fetch(new URL(path, baseUrl), { redirect: "follow" });
  return { path, status: response.status, body: await response.text() };
}

mkdirSync(dirname(evidencePath), { recursive: true });
mkdirSync(screenshotDirectory, { recursive: true });

const routes = await Promise.all(["/", "/flare", "/room", "/docs"].map(fetchRoute));
const rootHtml = routes.find((route) => route.path === "/")?.body ?? "";
const assetPaths = [...rootHtml.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
const assetSources = await Promise.all(assetPaths.map(async (path) => {
  const response = await fetch(new URL(path, baseUrl));
  if (!response.ok) throw new Error(`Failed to fetch production asset ${path}`);
  return response.text();
}));

const chrome = findChrome();
const desktop = browserCapture(chrome, "/", { width: 1440, height: 1000 }, "flare-production-desktop.png");
const mobile = browserCapture(chrome, "/flare", { width: 390, height: 844 }, "flare-production-mobile.png");
const docsMobile = browserCapture(chrome, "/docs", { width: 390, height: 844 }, "flare-production-docs-mobile.png");

const market = release.contracts.VeilBidFlareMarket.address;
const assertions = {
  allRoutesReturned200: routes.every((route) => route.status === 200),
  canonicalMarketBundled: assetSources.some((source) => source.toLowerCase().includes(market.toLowerCase())),
  coston2NetworkRendered: desktop.dom.includes('aria-label="Network: Flare Coston2"') && mobile.dom.includes("COSTON2"),
  verifiedReleaseRendered: desktop.dom.includes("VERIFIED COSTON2 RELEASE") && mobile.dom.includes("VERIFIED COSTON2 RELEASE"),
  walletFreeTenderListLoaded: desktop.dom.includes("COSTON2 DOSSIERS") && mobile.dom.includes("COSTON2 DOSSIERS"),
  awardedTenderVisible: desktop.dom.includes("AWARDED") && desktop.dom.includes("FTestXRP"),
  privacyBoundaryVisible: desktop.dom.includes("PRIVATE LOSING BIDS") && desktop.dom.includes("Bid payloads are never fetched"),
  noPublicStateFailureRendered: !desktop.dom.includes("Flare state unavailable") && !mobile.dom.includes("Flare state unavailable"),
  mobileTenderNavigationActive: mobile.dom.includes('class="primary-nav-link active"') && mobile.dom.includes('aria-current="page"'),
  docsRouteRendered: docsMobile.dom.includes("TROUBLESHOOTING") && docsMobile.dom.includes('class="docs-nav"'),
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
    sourceCommit: git("rev-parse", "HEAD"),
    provider: "vercel",
    project: "veilbid-flare",
    canonicalUrl: baseUrl.origin,
    network: release.network,
    chainId: release.chainId,
    deploymentKind: release.kind,
    deploymentVerified: release.verified,
    market,
    awardReceipt: release.contracts.VeilBidFlareAwardReceipt.address,
  },
  routeStatuses: Object.fromEntries(routes.map((route) => [route.path, route.status])),
  visualChecks: {
    desktop: desktop.screenshot,
    mobile: mobile.screenshot,
    docsMobile: docsMobile.screenshot,
  },
  assertions,
  blockers,
  notes: [
    "The deployed v2 Vercel project loaded the verified Coston2 public market without a wallet.",
    "Tender state and award receipts are read from finalized Coston2 contract state; sealed bid payloads are never fetched.",
    "Screenshots remain local smoke artifacts; only public-safe viewport and digest metadata are committed.",
  ],
};

writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(evidence, null, 2));
if (blockers.length > 0) process.exitCode = 1;
