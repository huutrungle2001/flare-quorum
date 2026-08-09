import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const baseUrl = new URL(
  process.argv[2] ?? process.env.VEILBID_FLARE_PRODUCTION_URL ?? "https://veilbid-flare.vercel.app",
);
const evidencePath = resolve(
  root,
  process.env.VEILBID_FLARE_FUNDING_CHECKPOINT_EVIDENCE ?? "evidence/coston2/web-xrp-funding-checkpoint.json",
);
const release = JSON.parse(
  readFileSync(resolve(root, "packages/flare-contracts/deployments/coston2.release.json"), "utf8"),
);
const storageKey = "veilbid:flare-funding-checkpoint:v1";
const checkpoint = {
  schemaVersion: 1,
  xrplOwner: "rDhpmiPq4BVBDWMVdSrmkgt8thKyRzGV1p",
  xrplTransactionId: `0x${"ab".repeat(32)}`,
  walletId: "0",
  executorFeeUBA: "",
};

if (baseUrl.protocol !== "https:") throw new Error("Flare funding checkpoint smoke requires an HTTPS URL");
if (release.chainId !== 114 || release.verified !== true) throw new Error("COSTON2_RELEASE_NOT_VERIFIED");

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

const sourceCommitOverride = process.env.VEILBID_FLARE_SMOKE_SOURCE_COMMIT?.trim() ?? "";
if (sourceCommitOverride !== "" && !/^[0-9a-f]{40}$/i.test(sourceCommitOverride)) {
  throw new Error("VEILBID_FLARE_SMOKE_SOURCE_COMMIT_INVALID");
}

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const chrome = candidates.find((candidate) => existsSync(candidate));
  if (!chrome) throw new Error("Set CHROME_BIN to run Flare funding checkpoint smoke");
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

async function findPage(port) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
    const page = pages.find((entry) => entry.type === "page");
    if (page) return page;
    await delay(100);
  }
  throw new Error("Timed out waiting for the Flare checkpoint page");
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
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await cdp.evaluate(expression)) return;
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const chrome = findChrome();
const profile = mkdtempSync(join(tmpdir(), "veilbid-flare-funding-checkpoint-"));
const stderr = { value: "" };
const chromeProcess = spawn(
  chrome,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--window-size=1440,1000",
    "about:blank",
  ],
  { cwd: root, stdio: ["ignore", "ignore", "pipe"] },
);
chromeProcess.stderr.setEncoding("utf8");
chromeProcess.stderr.on("data", (chunk) => { stderr.value = `${stderr.value}${chunk}`.slice(-4_000); });

let cdp;
try {
  const port = await waitForDevTools(profile, chromeProcess, stderr);
  const page = await findPage(port);
  cdp = await CdpSession.connect(page.webSocketDebuggerUrl);
  await cdp.request("Page.enable");
  await cdp.request("Runtime.enable");
  const injection = await cdp.request("Page.addScriptToEvaluateOnNewDocument", {
    source: `localStorage.setItem(${JSON.stringify(storageKey)}, ${JSON.stringify(JSON.stringify(checkpoint))});`,
  });
  await cdp.request("Page.navigate", { url: new URL("/flare?role=treasury", baseUrl).toString() });
  await waitFor(cdp, `document.readyState === "complete" && document.body.innerText.includes("Public payment checkpoint restored after reload")`, "the persisted checkpoint");
  const firstLoad = await cdp.evaluate(`(() => ({
    restoredNotice: document.body.innerText.includes("Public payment checkpoint restored after reload"),
    owner: document.querySelector("#xrpl-owner-address")?.value,
    transaction: document.querySelector("#xrpl-payment-transaction-id")?.value,
    walletId: document.querySelector("#smart-account-wallet-id")?.value,
    executorFee: document.querySelector("#executor-fee-uba")?.value,
  }))()`);
  await cdp.request("Page.removeScriptToEvaluateOnNewDocument", { identifier: injection.identifier });
  await cdp.request("Page.reload", { ignoreCache: true });
  await waitFor(cdp, `document.readyState === "complete" && document.body.innerText.includes("Public payment checkpoint restored after reload")`, "the reload-safe checkpoint");
  const reload = await cdp.evaluate(`(() => ({
    restoredNotice: document.body.innerText.includes("Public payment checkpoint restored after reload"),
    resumeControl: Array.from(document.querySelectorAll("button")).some((button) => button.textContent?.includes("RESUME PUBLIC CHECKPOINT")),
    owner: document.querySelector("#xrpl-owner-address")?.value,
    transaction: document.querySelector("#xrpl-payment-transaction-id")?.value,
    walletId: document.querySelector("#smart-account-wallet-id")?.value,
    executorFee: document.querySelector("#executor-fee-uba")?.value,
  }))()`);
  await cdp.evaluate(`document.querySelector("button.text-button")?.click()`);
  await waitFor(cdp, `!document.body.innerText.includes("Public payment checkpoint restored after reload") && localStorage.getItem(${JSON.stringify(storageKey)}) === null`, "the explicit checkpoint forget action");
  const forgotten = await cdp.evaluate(`({
    noticeGone: !document.body.innerText.includes("Public payment checkpoint restored after reload"),
    storageCleared: localStorage.getItem(${JSON.stringify(storageKey)}) === null,
  })`);
  const assertions = {
    initialCheckpointRestored: firstLoad.restoredNotice,
    reloadCheckpointRestored: reload.restoredNotice,
    resumeControlRendered: reload.resumeControl,
    publicFieldsRestored: [firstLoad, reload].every((value) =>
      value.owner === checkpoint.xrplOwner &&
      value.transaction === checkpoint.xrplTransactionId &&
      value.walletId === checkpoint.walletId &&
      value.executorFee === checkpoint.executorFeeUBA),
    explicitForgetClearsState: forgotten.noticeGone && forgotten.storageCleared,
  };
  const blockers = Object.entries(assertions).filter(([, passed]) => !passed).map(([name]) => name);
  const evidence = {
    schemaVersion: 1,
    suite: "coston2-frontend-xrp-funding-checkpoint",
    recordedAt: new Date().toISOString(),
    publicIdentifiers: {
      sourceCommit: sourceCommitOverride || git("rev-parse", "HEAD"),
      provider: "vercel",
      project: "veilbid-flare",
      canonicalUrl: baseUrl.origin,
      network: release.network,
      chainId: release.chainId,
    },
    assertions,
    blockers,
    notes: [
      "The production XRP Treasury route restored a browser-safe public checkpoint after a real page reload.",
      "The restored route rendered an explicit resume control; the smoke does not click it or submit a payment.",
      "The checkpoint test used only a public XRPL owner, transaction hash, wallet ID, and executor fee; it never entered a signing flow or touched a secret, bid, ciphertext, or FDC proof.",
      "The explicit forget action removed the checkpoint from browser storage and the rendered recovery notice.",
    ],
  };
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(resolve(evidencePath, ".."), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(evidence, null, 2));
  if (blockers.length > 0) process.exitCode = 1;
} finally {
  if (cdp) cdp.close();
  if (chromeProcess.exitCode === null) chromeProcess.kill("SIGTERM");
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
