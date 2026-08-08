import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const baseUrl = new URL(
  process.argv[2] ?? process.env.VEILBID_FLARE_PRODUCTION_URL ?? "https://veilbid-flare.vercel.app",
);
const evidencePath = resolve(
  root,
  process.env.VEILBID_FLARE_ACCESSIBILITY_EVIDENCE ?? "evidence/coston2/web-keyboard-accessibility.json",
);
const release = JSON.parse(
  readFileSync(resolve(root, "packages/flare-contracts/deployments/coston2.release.json"), "utf8"),
);

if (baseUrl.protocol !== "https:") throw new Error("Flare accessibility smoke requires an HTTPS URL");
if (release.chainId !== 114 || release.verified !== true) throw new Error("COSTON2_RELEASE_NOT_VERIFIED");

const sourceCommitOverride = process.env.VEILBID_FLARE_SMOKE_SOURCE_COMMIT?.trim() ?? "";
if (sourceCommitOverride !== "" && !/^[0-9a-f]{40}$/i.test(sourceCommitOverride)) {
  throw new Error("VEILBID_FLARE_SMOKE_SOURCE_COMMIT_INVALID");
}

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const chrome = candidates.find((candidate) => existsSync(candidate));
  if (!chrome) throw new Error("Set CHROME_BIN to run Flare accessibility smoke");
  return chrome;
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function waitForDevTools(profile, process, stderr) {
  const portFile = join(profile, "DevToolsActivePort");
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (existsSync(portFile)) {
      const [port] = readFileSync(portFile, "utf8").trim().split("\n");
      if (port) return Number(port);
    }
    if (process.exitCode !== null) throw new Error(`Chrome exited early: ${stderr.value.slice(-500)}`);
    await delay(100);
  }
  throw new Error("Timed out waiting for Chrome DevTools");
}

async function findPage(port, origin) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
    const page = pages.find((entry) => entry.type === "page" && new URL(entry.url).origin === origin);
    if (page) return page;
    await delay(100);
  }
  throw new Error("Timed out waiting for the Flare browser page");
}

class CdpSession {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.onmessage = (event) => {
      const response = JSON.parse(event.data);
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      if (response.error) pending.reject(new Error(response.error.message));
      else pending.resolve(response.result);
    };
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolveSocket, rejectSocket) => {
      socket.onopen = resolveSocket;
      socket.onerror = rejectSocket;
    });
    return new CdpSession(socket);
  }

  request(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveRequest, rejectRequest) => {
      this.pending.set(id, { resolve: resolveRequest, reject: rejectRequest });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.request("Runtime.evaluate", {
      awaitPromise: true,
      expression,
      returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }

  close() {
    this.socket.close();
  }
}

async function waitFor(cdp, expression, label) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (await cdp.evaluate(expression)) return;
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function pressKey(cdp, key, code, keyCode) {
  for (const type of ["keyDown", "keyUp"]) {
    await cdp.request("Input.dispatchKeyEvent", {
      type,
      key,
      code,
      nativeVirtualKeyCode: keyCode,
      windowsVirtualKeyCode: keyCode,
    });
  }
  await delay(80);
}

const chrome = findChrome();
const profile = mkdtempSync(join(tmpdir(), "veilbid-flare-a11y-"));
const stderr = { value: "" };
const chromeProcess = spawn(
  chrome,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--window-size=1280,900",
    new URL("/flare", baseUrl).toString(),
  ],
  { cwd: root, stdio: ["ignore", "ignore", "pipe"] },
);
chromeProcess.stderr.setEncoding("utf8");
chromeProcess.stderr.on("data", (chunk) => { stderr.value = `${stderr.value}${chunk}`.slice(-4_000); });

let cdp;
try {
  const port = await waitForDevTools(profile, chromeProcess, stderr);
  const page = await findPage(port, baseUrl.origin);
  cdp = await CdpSession.connect(page.webSocketDebuggerUrl);
  await cdp.request("Page.enable");
  await cdp.request("Runtime.enable");
  await waitFor(cdp, `document.readyState === "complete" && Boolean(document.querySelector(".tender-card"))`, "the Coston2 tender list");

  await cdp.evaluate(`(() => { window.focus(); document.activeElement?.blur(); return true; })()`);
  const focusSequence = [];
  for (let index = 0; index < 8; index += 1) {
    await pressKey(cdp, "Tab", "Tab", 9);
    focusSequence.push(await cdp.evaluate(`(() => {
      const element = document.activeElement;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName,
        text: element.textContent.trim().replace(/\\s+/g, " ").slice(0, 80),
        ariaLabel: element.getAttribute("aria-label"),
        visible: rect.width > 0 && rect.height > 0,
        focusIndicator: style.outlineStyle !== "none" || style.boxShadow !== "none",
      };
    })()`));
  }
  await pressKey(cdp, "Escape", "Escape", 27);
  const desktop = await cdp.evaluate(`(() => {
    const observedFocus = ${JSON.stringify(focusSequence)};
    const interactive = [...document.querySelectorAll("a,button,input,select,textarea")].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    const unnamed = interactive.filter((element) => {
      const labelledBy = element.getAttribute("aria-labelledby");
      const labelledText = labelledBy ? document.getElementById(labelledBy)?.textContent : "";
      return !(element.getAttribute("aria-label") || labelledText || element.textContent.trim() || element.getAttribute("title"));
    });
    return {
      skipLink: Boolean(document.querySelector('a.skip-link[href="#main-content"]')),
      primaryNavigation: Boolean(document.querySelector('[aria-label="Primary navigation"]')),
      activeTenderNavigation: document.querySelector('[aria-current="page"]')?.textContent.trim() === "TENDERS",
      interactiveCount: interactive.length,
      unnamedInteractive: unnamed.length,
      focusSequence: observedFocus,
      focusIndicatorSeen: observedFocus.some((entry) => entry.focusIndicator),
      noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
    };
  })()`);

  await cdp.request("Emulation.setDeviceMetricsOverride", {
    width: 320,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await delay(300);
  const mobile = await cdp.evaluate(`(() => ({
    width: window.innerWidth,
    noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
    tenderVisible: Boolean(document.querySelector(".tender-card")),
    alertCount: document.querySelectorAll('[role="alert"]').length,
  }))()`);
  cdp.close();

  const html = await fetch(new URL("/flare", baseUrl)).then((response) => response.text());
  const cssPaths = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map((match) => match[1]);
  const cssSources = await Promise.all(cssPaths.map(async (path) => fetch(new URL(path, baseUrl)).then((response) => response.text())));
  const assertions = {
    skipLinkAndPrimaryNavigation: desktop.skipLink && desktop.primaryNavigation,
    activeCoston2TenderNavigation: desktop.activeTenderNavigation,
    allInteractiveControlsNamed: desktop.unnamedInteractive === 0,
    keyboardFocusVisitedControls: desktop.focusSequence.filter((entry) => entry.visible).length >= 4,
    keyboardFocusIndicatorPresent: desktop.focusIndicatorSeen,
    desktopNoHorizontalOverflow: desktop.noHorizontalOverflow,
    mobile320NoHorizontalOverflow: mobile.noHorizontalOverflow,
    mobileTenderVisible: mobile.tenderVisible,
    reducedMotionStylesPresent: cssSources.some((source) => source.includes("prefers-reduced-motion")),
    noUnexpectedErrorAlert: mobile.alertCount === 0,
  };
  const blockers = Object.entries(assertions).filter(([, passed]) => !passed).map(([name]) => name);
  const evidence = {
    schemaVersion: 1,
    suite: "coston2-frontend-keyboard-accessibility",
    recordedAt: new Date().toISOString(),
    publicIdentifiers: {
      sourceCommit: sourceCommitOverride || git("rev-parse", "HEAD"),
      provider: "vercel",
      project: "veilbid-flare",
      canonicalUrl: baseUrl.origin,
      network: release.network,
      chainId: release.chainId,
      market: release.contracts.VeilBidFlareMarket.address,
    },
    measurements: {
      desktopInteractiveCount: desktop.interactiveCount,
      mobileViewportWidth: mobile.width,
      focusSequence: desktop.focusSequence.map(({ tag, text, ariaLabel, visible, focusIndicator }) => ({ tag, text, ariaLabel, visible, focusIndicator })),
    },
    assertions,
    blockers,
    notes: [
      "The live Flare route was exercised with keyboard input and a 320px viewport.",
      "The smoke records labels, layout assertions, and public route state only; it does not connect a wallet or access confidential data.",
    ],
  };
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(evidence, null, 2));
  if (blockers.length > 0) process.exitCode = 1;
} finally {
  if (cdp) cdp.close();
  if (chromeProcess.exitCode === null) chromeProcess.kill("SIGTERM");
  rmSync(profile, { recursive: true, force: true });
}
