import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const baseUrl = new URL(
  process.argv[2] ??
    process.env.FLAREQUORUM_PRODUCTION_URL ??
    "https://flare-quorum.vercel.app",
);
const evidencePath = resolve(
  root,
  process.env.FLAREQUORUM_KEYBOARD_EVIDENCE ??
    "evidence/sepolia/production-keyboard.json",
);
const deploymentEvidence = JSON.parse(
  readFileSync(
    resolve(root, "evidence/sepolia/production-smoke.json"),
    "utf8",
  ),
);

if (
  baseUrl.protocol !== "https:" &&
  !["127.0.0.1", "localhost"].includes(baseUrl.hostname)
) {
  throw new Error("Keyboard smoke requires HTTPS or a local test URL");
}

function git(...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const chrome = candidates.find((candidate) => existsSync(candidate));
  if (!chrome) {
    throw new Error("Set CHROME_BIN to run production keyboard smoke");
  }
  return chrome;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForDevTools(profile, chromeProcess, stderr) {
  const portFile = join(profile, "DevToolsActivePort");
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (existsSync(portFile)) {
      const [port] = readFileSync(portFile, "utf8").trim().split("\n");
      if (port) return Number(port);
    }
    if (chromeProcess.exitCode !== null) {
      throw new Error(
        `Chrome exited before DevTools became ready: ${stderr.value.slice(-500)}`,
      );
    }
    await delay(100);
  }
  throw new Error("Timed out waiting for Chrome DevTools");
}

async function findPage(port) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(
      (response) => response.json(),
    );
    const page = pages.find(
      (entry) =>
        entry.type === "page" &&
        new URL(entry.url).origin === baseUrl.origin,
    );
    if (page) return page;
    await delay(100);
  }
  throw new Error("Timed out waiting for the FlareQuorum browser page");
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
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });
    return new CdpSession(socket);
  }

  request(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.request("Runtime.evaluate", {
      awaitPromise: true,
      expression,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text);
    }
    return result.result.value;
  }

  close() {
    this.socket.close();
  }
}

async function waitFor(cdp, expression, label) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await cdp.evaluate(expression)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const keys = {
  Enter: { code: "Enter", keyCode: 13 },
  Escape: { code: "Escape", keyCode: 27 },
  Space: { code: "Space", key: " ", keyCode: 32 },
  Tab: { code: "Tab", keyCode: 9 },
};

async function pressKey(cdp, key, modifiers = 0) {
  const definition = keys[key];
  await cdp.request("Input.dispatchKeyEvent", {
    code: definition.code,
    key: definition.key ?? key,
    modifiers,
    nativeVirtualKeyCode: definition.keyCode,
    type: "keyDown",
    windowsVirtualKeyCode: definition.keyCode,
  });
  await cdp.request("Input.dispatchKeyEvent", {
    code: definition.code,
    key: definition.key ?? key,
    modifiers,
    nativeVirtualKeyCode: definition.keyCode,
    type: "keyUp",
    windowsVirtualKeyCode: definition.keyCode,
  });
  await delay(100);
}

async function activeElement(cdp) {
  return cdp.evaluate(`(() => {
    const element = document.activeElement;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      label: element.textContent.trim().replace(/\\s+/g, " "),
      tag: element.tagName,
      ariaCurrent: element.getAttribute("aria-current"),
      focusIndicatorVisible:
        (style.outlineStyle !== "none" &&
          Number.parseFloat(style.outlineWidth) >= 2) ||
        style.boxShadow !== "none",
      visible:
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < innerHeight &&
        rect.left < innerWidth,
    };
  })()`);
}

const chrome = findChrome();
const profile = mkdtempSync(join(tmpdir(), "flare-quorum-keyboard-"));
const stderr = { value: "" };
const chromeProcess = spawn(
  chrome,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-background-networking",
    "--disable-extensions",
    "--disable-gpu",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--window-size=1280,900",
    baseUrl.toString(),
  ],
  {
    cwd: root,
    stdio: ["ignore", "ignore", "pipe"],
  },
);
chromeProcess.stderr.setEncoding("utf8");
chromeProcess.stderr.on("data", (chunk) => {
  stderr.value = `${stderr.value}${chunk}`.slice(-4_000);
});

let cdp;
try {
  const port = await waitForDevTools(profile, chromeProcess, stderr);
  const page = await findPage(port);
  cdp = await CdpSession.connect(page.webSocketDebuggerUrl);
  await cdp.request("Page.enable");
  await cdp.request("Runtime.enable");
  await waitFor(
    cdp,
    `document.readyState === "complete" &&
      Boolean(document.querySelector('[aria-label="Primary navigation"]'))`,
    "the shared navigation",
  );
  await cdp.evaluate(`(() => {
    document.querySelector(".topbar").dataset.keyboardSmoke = "persistent";
    window.focus();
    document.activeElement?.blur();
    return true;
  })()`);

  const forwardFocus = [];
  for (let index = 0; index < 5; index += 1) {
    await pressKey(cdp, "Tab");
    forwardFocus.push(await activeElement(cdp));
  }

  await pressKey(cdp, "Space");
  await waitFor(
    cdp,
    `document.querySelector(".wallet-trigger")?.getAttribute("aria-expanded") ===
      "true"`,
    `the wallet selector from ${JSON.stringify(forwardFocus.at(-1))}`,
  );
  const walletMenu = await cdp.evaluate(`(() => {
    const trigger = document.querySelector(".wallet-trigger");
    return {
      expanded: trigger.getAttribute("aria-expanded"),
      emptyMessage:
        document.querySelector(".wallet-empty")?.textContent.trim(),
    };
  })()`);
  await pressKey(cdp, "Escape");
  await pressKey(cdp, "Tab", 8);
  const reverseFocus = await activeElement(cdp);
  await pressKey(cdp, "Enter");
  await waitFor(
    cdp,
    `location.pathname === "/docs" &&
      location.hash === "" &&
      document.querySelector('[aria-current="page"]')?.textContent.trim() ===
        "DOCS"`,
    "the Docs route",
  );
  await cdp.evaluate(`(() => {
    document.getElementById("evidence").scrollIntoView();
    return true;
  })()`);
  await delay(300);
  const docsRoute = await cdp.evaluate(`(() => {
    const header = document.querySelector(".topbar");
    const sidebar = document.querySelector(".docs-nav");
    const headerRect = header.getBoundingClientRect();
    const sidebarRect = sidebar.getBoundingClientRect();
    const parseColor = (value) => {
      const parts = value.match(/[\\d.]+/g)?.map(Number) ?? [];
      return {
        red: parts[0] ?? 0,
        green: parts[1] ?? 0,
        blue: parts[2] ?? 0,
        alpha: parts[3] ?? 1,
      };
    };
    const luminance = ({ red, green, blue }) => {
      const channels = [red, green, blue].map((channel) => {
        const value = channel / 255;
        return value <= 0.03928
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      });
      return (
        channels[0] * 0.2126 +
        channels[1] * 0.7152 +
        channels[2] * 0.0722
      );
    };
    const backgroundFor = (element) => {
      let current = element;
      while (current) {
        const background = parseColor(getComputedStyle(current).backgroundColor);
        if (background.alpha > 0) return background;
        current = current.parentElement;
      }
      return { red: 255, green: 255, blue: 255, alpha: 1 };
    };
    const candidates = [...document.body.querySelectorAll("*")].filter(
      (element) => {
        const directText = [...element.childNodes].some(
          (node) =>
            node.nodeType === Node.TEXT_NODE &&
            Boolean(node.textContent.trim()),
        );
        const style = getComputedStyle(element);
        return (
          directText &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      },
    );
    const contrastFailures = [];
    for (const element of candidates) {
      const style = getComputedStyle(element);
      const foreground = parseColor(style.color);
      const background = backgroundFor(element);
      const lighter = Math.max(luminance(foreground), luminance(background));
      const darker = Math.min(luminance(foreground), luminance(background));
      const ratio = (lighter + 0.05) / (darker + 0.05);
      const fontSize = Number.parseFloat(style.fontSize);
      const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
      const largeText =
        fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
      const minimum = largeText ? 3 : 4.5;
      if (ratio + 0.01 < minimum) {
        contrastFailures.push({
          selector: element.className || element.tagName,
          text: element.textContent.trim().replace(/\\s+/g, " ").slice(0, 80),
          ratio: Number(ratio.toFixed(2)),
          minimum,
        });
      }
    }
    return {
      activeLabel:
        document.querySelector('[aria-current="page"]')?.textContent.trim(),
      headerPersistent: header.dataset.keyboardSmoke === "persistent",
      sidebarPosition: getComputedStyle(sidebar).position,
      sidebarVisible:
        sidebarRect.top >= headerRect.bottom - 2 &&
        sidebarRect.top < innerHeight &&
        sidebarRect.bottom > headerRect.bottom,
      contrastChecked: candidates.length,
      contrastFailures,
    };
  })()`);
  await cdp.evaluate(`(() => {
    document
      .querySelector('[aria-label="Primary navigation"] a[href="/room"]')
      .focus();
    return true;
  })()`);
  await pressKey(cdp, "Enter");
  await waitFor(
    cdp,
    `location.pathname === "/room" &&
      Boolean(document.querySelector(".privacy-panel .privacy-badge:not(.encrypted)"))`,
    "the live Tender view",
  );
  await cdp.evaluate(`(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    return true;
  })()`);
  await delay(300);
  const tenderRoute = await cdp.evaluate(`(() => {
    const header = document.querySelector(".topbar");
    const rolebar = document.querySelector(".rolebar");
    const surface = document.querySelector(".tender-surface");
    const badge = document.querySelector(
      ".privacy-panel .privacy-badge:not(.encrypted)",
    );
    const headerRect = header.getBoundingClientRect();
    const rolebarRect = rolebar.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    const badgeStyle = getComputedStyle(badge);
    return {
      activeLabel:
        document.querySelector('[aria-current="page"]')?.textContent.trim(),
      rolebarPosition: getComputedStyle(rolebar).position,
      rolebarVisible:
        rolebarRect.top >= headerRect.bottom - 2 &&
        rolebarRect.top < innerHeight &&
        rolebarRect.bottom > headerRect.bottom,
      rolebarIsLeftOfContent: rolebarRect.right <= surfaceRect.left + 1,
      publicMetadataColor: badgeStyle.color,
      publicMetadataBackground: badgeStyle.backgroundColor,
    };
  })()`);

  const expectedFocusOrder = [
    "SKIP TO CONTENT",
    "FLAREQUORUM",
    "TENDERS",
    "DOCS",
    "◇CONNECT WALLET",
  ];
  const observedFocusOrder = forwardFocus.map((entry) => entry.label);
  const assertions = {
    primaryNavigationKeyboardReachable:
      JSON.stringify(observedFocusOrder) ===
      JSON.stringify(expectedFocusOrder),
    everyFocusTargetVisible: forwardFocus.every((entry) => entry.visible),
    everyFocusIndicatorVisible: forwardFocus.every(
      (entry) => entry.focusIndicatorVisible,
    ),
    skipLinkVisibleOnFocus: forwardFocus[0]?.visible === true,
    walletSelectorOpenedByKeyboard:
      walletMenu.expanded === "true" &&
      walletMenu.emptyMessage?.includes("No compatible browser wallet"),
    reverseTraversalReturnedToDocs: reverseFocus.label === "DOCS",
    docsActivatedByKeyboard: docsRoute.activeLabel === "DOCS",
    docsSidebarRemainsSticky:
      docsRoute.sidebarPosition === "sticky" && docsRoute.sidebarVisible,
    docsTextMeetsWcagContrast: docsRoute.contrastFailures.length === 0,
    tenderWorkspaceNavigationRemainsSticky:
      tenderRoute.rolebarPosition === "sticky" &&
      tenderRoute.rolebarVisible &&
      tenderRoute.rolebarIsLeftOfContent,
    publicMetadataBadgeHasExplicitContrast:
      tenderRoute.publicMetadataColor === "rgb(0, 0, 0)" &&
      tenderRoute.publicMetadataBackground === "rgb(255, 255, 255)",
    headerPersistedAcrossRoutes: docsRoute.headerPersistent,
  };
  const blockers = Object.entries(assertions)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const evidence = {
    schemaVersion: 1,
    suite: "production-keyboard-navigation",
    recordedAt: new Date().toISOString(),
    publicIdentifiers: {
      testCommit: git("rev-parse", "HEAD"),
      deploymentSourceCommit:
        deploymentEvidence.publicIdentifiers.sourceCommit,
      deploymentId: deploymentEvidence.publicIdentifiers.deploymentId,
      canonicalUrl: baseUrl.origin,
      browser: execFileSync(chrome, ["--version"], {
        encoding: "utf8",
      }).trim(),
      viewport: "1280x900",
    },
    observations: {
      expectedFocusOrder,
      observedFocusOrder,
      activeRouteSequence: [docsRoute.activeLabel, tenderRoute.activeLabel],
      docsContrast: {
        checked: docsRoute.contrastChecked,
        failures: docsRoute.contrastFailures,
      },
    },
    assertions,
    blockers,
    notes: [
      "A real headless Chrome session used Tab, Shift+Tab, Enter, Space, and Escape to traverse the production navigation and wallet selector.",
      "The smoke records public labels and route assertions only; it does not connect a wallet or access confidential state.",
    ],
  };
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
    mode: 0o600,
  });
  console.log(JSON.stringify(evidence, null, 2));
  if (blockers.length > 0) process.exitCode = 1;
} finally {
  cdp?.close();
  chromeProcess.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => chromeProcess.once("exit", resolve)),
    delay(2_000),
  ]);
  if (chromeProcess.exitCode === null) chromeProcess.kill("SIGKILL");
  rmSync(profile, { force: true, recursive: true });
}
