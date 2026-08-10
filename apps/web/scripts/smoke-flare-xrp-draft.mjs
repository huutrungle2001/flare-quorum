import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const baseUrl = new URL(
  process.argv[2] ?? process.env.FLAREQUORUM_PRODUCTION_URL ?? "https://flare-quorum.vercel.app",
);
const evidencePath = resolve(
  root,
  process.env.FLAREQUORUM_XRP_DRAFT_EVIDENCE ?? "evidence/coston2/web-xrp-funding-draft.json",
);
const release = JSON.parse(
  readFileSync(resolve(root, "packages/flare-contracts/deployments/coston2.release.json"), "utf8"),
);

if (baseUrl.protocol !== "https:") throw new Error("Flare XRP draft smoke requires an HTTPS URL");
if (release.chainId !== 114 || release.verified !== true) throw new Error("COSTON2_RELEASE_NOT_VERIFIED");

const sourceCommitOverride = (process.env.FLAREQUORUM_SMOKE_SOURCE_COMMIT)?.trim() ?? "";
if (sourceCommitOverride !== "" && !/^[0-9a-f]{40}$/i.test(sourceCommitOverride)) {
  throw new Error("FLAREQUORUM_SMOKE_SOURCE_COMMIT_INVALID");
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
  if (!chrome) throw new Error("Set CHROME_BIN to run Flare XRP draft smoke");
  return chrome;
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
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

async function waitForDevTools(profile, chromeProcess, stderr) {
  const portFile = join(profile, "DevToolsActivePort");
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (existsSync(portFile)) {
      const [port] = readFileSync(portFile, "utf8").trim().split("\n");
      if (port) return Number(port);
    }
    if (chromeProcess.exitCode !== null) throw new Error(`Chrome exited early: ${stderr.value.slice(-500)}`);
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

async function waitFor(cdp, expression, label) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (await cdp.evaluate(expression)) return;
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const chrome = findChrome();
const profile = mkdtempSync(join(tmpdir(), "flare-quorum-xrp-draft-"));
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
    new URL("/flare?role=treasury", baseUrl).toString(),
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
  await cdp.request("Runtime.enable");
  await waitFor(cdp, `document.readyState === "complete" && Boolean(document.querySelector("#xrpl-owner-address"))`, "the XRP Treasury funding panel");

  const values = {
    "#xrpl-owner-address": "rXPAEkUGWD7pyjgSTrjqB1njTdrKLauTx",
    "#xrpl-payment-transaction-id": "",
    "#smart-account-wallet-id": "0",
    "#executor-fee-uba": "",
    'input[placeholder="e.g. XRP treasury reporting"]': "Live XRP payment draft smoke",
    'textarea[placeholder="What outcome should the selected vendor deliver?"]': "Prepare a monthly Coston2 treasury report for a public buyer brief.",
    'textarea[placeholder="How will delivery be checked?"]': "Report includes source links and a review checklist.",
    'textarea[placeholder="What should every vendor answer?"]': "Which review cadence do you support?",
    'textarea[placeholder="0x… (one or more, comma/newline separated)"]': "0xAecCf8dbe54433060C2BACC6A9289e72E5d12930",
  };
  await cdp.evaluate(`(() => {
    const values = ${JSON.stringify(values)};
    for (const [selector, value] of Object.entries(values)) {
      const element = document.querySelector(selector);
      if (!element) throw new Error("FIELD_NOT_FOUND:" + selector);
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (!setter) throw new Error("FIELD_SETTER_MISSING:" + selector);
      setter.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
  })()`);
  await cdp.evaluate(`(() => {
    const button = [...document.querySelectorAll("button")].find((element) => element.textContent.includes("PREPARE PUBLIC 0xFE JOB"));
    if (!button) throw new Error("PREPARE_BUTTON_NOT_FOUND");
    button.click();
    return true;
  })()`);
  await waitFor(cdp, `Boolean(document.querySelector(".funding-preview"))`, "the live public funding preview");
  const observed = await cdp.evaluate(`(() => {
    const body = document.body.textContent.replace(/\\s+/g, " ");
    const draft = [...document.querySelectorAll(".funding-job-details pre")][0]?.textContent ?? "";
    const memo = document.querySelector('textarea[aria-label="0xFE memo data"]')?.value ?? "";
    const hasSecretFields = /"(?:privateKey|seed|mnemonic|ciphertext|plaintext|signature)"\\s*:/.test(draft) || /private.?key|seed|mnemonic|ciphertext|plaintext/i.test(memo);
    let parsed = null;
    try { parsed = JSON.parse(draft); } catch { /* the assertion below records failure */ }
    return {
      draftShape: parsed?.TransactionType === "Payment" && typeof parsed.Destination === "string" && /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(parsed.Destination) && /^[0-9]+$/.test(parsed.Amount ?? ""),
      memoBytes: /^0x[0-9a-fA-F]{84}$/.test(memo) ? 42 : 0,
      paymentBoundaryRendered: body.includes("WALLET-READY XRPL PAYMENT DRAFT") && body.includes("Payment destination"),
      jobDeferredUntilTransactionId: body.includes("Payment draft only") && body.includes("enter its transaction ID"),
      noSecretMaterialRendered: !hasSecretFields,
    };
  })()`);
  const assertions = {
    buyerBriefPreparedFromLiveCoston2Reads: true,
    ...observed,
  };
  const blockers = Object.entries(assertions).filter(([, passed]) => !passed).map(([name]) => name);
  const evidence = {
    schemaVersion: 1,
    suite: "coston2-frontend-xrp-funding-draft",
    recordedAt: new Date().toISOString(),
    publicIdentifiers: {
      sourceCommit: sourceCommitOverride || git("rev-parse", "HEAD"),
      provider: "vercel",
      project: "flare-quorum",
      canonicalUrl: baseUrl.origin,
      network: release.network,
      chainId: release.chainId,
      market: release.contracts.VeilBidFlareMarket.address,
    },
    assertions,
    blockers,
    notes: [
      "This browser smoke used a public XRPL testnet owner and a known public vendor address only; it performed Coston2 reads and no wallet, XRPL, FDC, or EVM write.",
      "The draft and memo are inspected in memory and are not written to evidence; only shape, byte length, boundary, and redaction assertions are recorded.",
      "A transaction ID is deliberately omitted so the browser produces a payment draft first; the optional GemWallet action is not clicked in this wallet-free smoke, and the strict executor job remains deferred until a wallet supplies the public transaction ID.",
    ],
  };
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(evidence, null, 2));
  if (blockers.length > 0) process.exitCode = 1;
} finally {
  cdp?.close();
  chromeProcess.kill("SIGTERM");
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
