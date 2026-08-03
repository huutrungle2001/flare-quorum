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
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";

const root = resolve(import.meta.dirname, "../../..");
const baseUrl = new URL(
  process.argv[2] ??
    process.env.VEILBID_PRODUCTION_URL ??
    "https://veilbid-three.vercel.app",
);
const evidencePath = resolve(
  root,
  process.env.VEILBID_PRODUCTION_EVIDENCE ??
    "evidence/sepolia/production-smoke.json",
);
const screenshotDirectory = resolve(root, ".local/screenshots");
const deployment = JSON.parse(
  readFileSync(
    resolve(
      root,
      "packages/chain-bindings/generated/addresses/sepolia.release.json",
    ),
    "utf8",
  ),
);

if (baseUrl.protocol !== "https:") {
  throw new Error("Production smoke requires an HTTPS URL");
}

function git(...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function findChrome() {
  const configured = process.env.CHROME_BIN;
  const candidates = [
    configured,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const chrome = candidates.find((candidate) => existsSync(candidate));
  if (!chrome) {
    throw new Error("Set CHROME_BIN to run production browser smoke");
  }
  return chrome;
}

function browserCapture(chrome, path, viewport, screenshotName) {
  const profile = mkdtempSync(join(tmpdir(), "veilbid-smoke-"));
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
        "--virtual-time-budget=15000",
        `--screenshot=${screenshotPath}`,
        "--dump-dom",
        new URL(path, baseUrl).toString(),
      ],
      {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    if (result.status !== 0) {
      throw new Error(`Chrome smoke failed for ${path}`);
    }
    if (!existsSync(screenshotPath)) {
      throw new Error(`Chrome did not create ${screenshotName}`);
    }
    return {
      dom: result.stdout,
      screenshot: {
        viewport,
        sha256: sha256(screenshotPath),
      },
    };
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
}

async function fetchRoute(path) {
  const response = await fetch(new URL(path, baseUrl), {
    redirect: "follow",
  });
  return {
    path,
    status: response.status,
    body: await response.text(),
  };
}

mkdirSync(dirname(evidencePath), { recursive: true });
mkdirSync(screenshotDirectory, { recursive: true });

const routes = await Promise.all(["/", "/room", "/docs"].map(fetchRoute));
const roomHtml = routes.find((route) => route.path === "/room").body;
const assetPaths = [
  ...roomHtml.matchAll(/<script[^>]+src="([^"]+)"/g),
].map((match) => match[1]);
const assetSources = await Promise.all(
  assetPaths.map(async (path) => {
    const response = await fetch(new URL(path, baseUrl));
    if (!response.ok) {
      throw new Error(`Failed to fetch production asset ${path}`);
    }
    return response.text();
  }),
);

const chrome = findChrome();
const desktop = browserCapture(
  chrome,
  "/",
  { width: 1440, height: 1000 },
  "production-landing-desktop.png",
);
const mobile = browserCapture(
  chrome,
  "/room",
  { width: 390, height: 844 },
  "production-room-mobile.png",
);
const docsDesktop = browserCapture(
  chrome,
  "/docs",
  { width: 1440, height: 1000 },
  "production-docs-desktop.png",
);
const docsMobile = browserCapture(
  chrome,
  "/docs",
  { width: 390, height: 844 },
  "production-docs-mobile.png",
);
const canonicalMarket = deployment.contracts.VeilBidMarket.address;
const observedBlock =
  mobile.dom.match(/Block ([0-9]+)/)?.[1] ?? "not-observed";

const assertions = {
  allRoutesReturned200: routes.every((route) => route.status === 200),
  canonicalMarketBundled: assetSources.some((source) =>
    source.toLowerCase().includes(canonicalMarket.toLowerCase()),
  ),
  desktopLandingRendered:
    desktop.dom.includes("Lowest valid bid.") &&
    desktop.dom.includes("EXPLORE TENDERS"),
  sharedNavigationRendered:
    ["TENDERS", "DOCS"].every(
      (label) => desktop.dom.includes(label) && mobile.dom.includes(label),
    ),
  evidenceRemovedFromPrimaryNavigation:
    !desktop.dom.includes(">EVIDENCE</a>") &&
    !mobile.dom.includes(">EVIDENCE</a>"),
  walletControlRendered:
    desktop.dom.includes("CONNECT WALLET") &&
    mobile.dom.includes("CONNECT WALLET"),
  docsGuideRendered:
    docsDesktop.dom.includes("Use VeilBid from tender to settlement.") &&
    docsDesktop.dom.includes("BUYER GUIDE") &&
    docsMobile.dom.includes("TROUBLESHOOTING"),
  docsSidebarRendered:
    docsDesktop.dom.includes('class="docs-nav"') &&
    docsMobile.dom.includes('class="docs-nav"'),
  mobileTenderNavigationActive:
    mobile.dom.includes('class="primary-nav-link active"') &&
    mobile.dom.includes('aria-current="page"') &&
    mobile.dom.includes(">TENDERS</a>"),
  mobileReleaseLabelRendered: mobile.dom.includes(
    "RELEASE DEPLOYMENT · SOURCE/DEPLOYMENT VERIFIED",
  ),
  walletFreeCanonicalTenderLoaded:
    mobile.dom.includes("TENDER / 1") &&
    mobile.dom.includes("Confidential procurement #1"),
  awardedStateRendered:
    mobile.dom.includes("AWARDED") &&
    mobile.dom.includes("Receipt #1"),
  noPublicStateFailureRendered: !mobile.dom.includes(
    "Public state unavailable",
  ),
  desktopScreenshotCaptured: desktop.screenshot.sha256.length === 64,
  mobileScreenshotCaptured: mobile.screenshot.sha256.length === 64,
  docsDesktopScreenshotCaptured:
    docsDesktop.screenshot.sha256.length === 64,
  docsMobileScreenshotCaptured: docsMobile.screenshot.sha256.length === 64,
};
const blockers = Object.entries(assertions)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
const evidence = {
  schemaVersion: 1,
  suite: "production-frontend-smoke",
  recordedAt: new Date().toISOString(),
  publicIdentifiers: {
    sourceCommit: git("rev-parse", "HEAD"),
    provider: "vercel",
    project: "veilbid",
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? "not-recorded",
    canonicalUrl: baseUrl.origin,
    network: deployment.network,
    chainId: deployment.chainId,
    deploymentKind: deployment.kind,
    deploymentVerified: deployment.verified,
    market: canonicalMarket,
    tenderId: "1",
    observedBlock,
  },
  routeStatuses: Object.fromEntries(
    routes.map((route) => [route.path, route.status]),
  ),
  visualChecks: {
    desktop: desktop.screenshot,
    mobile: mobile.screenshot,
    docsDesktop: docsDesktop.screenshot,
    docsMobile: docsMobile.screenshot,
  },
  assertions,
  blockers,
  notes: [
    "The production SPA loaded the canonical verified Sepolia release without a wallet.",
    "Desktop and mobile screenshots are local smoke artifacts; only their public-safe viewport and digest metadata are committed.",
    "No wallet secrets, RPC credentials, confidential values, handles, proofs, or signatures are recorded.",
  ],
};

writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
  mode: 0o600,
});
console.log(JSON.stringify(evidence, null, 2));

if (blockers.length > 0) {
  process.exitCode = 1;
}
