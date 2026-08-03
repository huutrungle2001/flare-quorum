import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

const auctionHouseRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(auctionHouseRoot, "../..");
const deploymentPath = resolve(
  auctionHouseRoot,
  "deployments/sepolia.release.json",
);
const outputPath = resolve(
  repositoryRoot,
  "evidence/sepolia/source-publication.release.json",
);
const sourcifyBaseUrl = "https://sourcify.dev/server";
const checkOnly = process.argv.includes("--check");

const sourceDefinitions = [
  {
    name: "VeilBidTestUSDC",
    artifact:
      "artifacts/contracts/test-assets/VeilBidTestAssets.sol/VeilBidTestUSDC.json",
  },
  {
    name: "VeilBidConfidentialUSDC",
    artifact:
      "artifacts/contracts/test-assets/VeilBidTestAssets.sol/VeilBidConfidentialUSDC.json",
  },
  {
    name: "VeilBidMarket",
    artifact:
      "artifacts/contracts/market/VeilBidMarket.sol/VeilBidMarket.json",
  },
  {
    name: "VeilBidAwardReceipt",
    artifact:
      "artifacts/contracts/receipt/VeilBidAwardReceipt.sol/VeilBidAwardReceipt.json",
    buildFrom:
      "artifacts/contracts/market/VeilBidMarket.sol/VeilBidMarket.json",
  },
  {
    name: "VeilBidSafePreparationModule",
    artifact:
      "artifacts/contracts/safe/VeilBidSafePreparationModule.sol/VeilBidSafePreparationModule.json",
  },
  {
    name: "VeilBidSafeModuleFactory",
    artifact:
      "artifacts/contracts/safe/VeilBidSafeModuleFactory.sol/VeilBidSafeModuleFactory.json",
  },
  {
    name: "VeilBidSafeUnwrapPreparation",
    artifact:
      "artifacts/contracts/safe/VeilBidSafeUnwrapPreparation.sol/VeilBidSafeUnwrapPreparation.json",
  },
];

const evidence = {
  schemaVersion: 1,
  suite: "release-source-publication",
  recordedAt: new Date().toISOString(),
  environment: {
    network: "ethereum-sepolia",
    chainId: 11_155_111,
    provider: "sourcify-v2",
  },
  publicIdentifiers: {
    contracts: {},
  },
  assertions: {
    releaseManifestLoaded: false,
    allSourcesPublished: false,
    allTopLevelCreationMatchesExact: false,
    embeddedReceiptSourceMapped: false,
    allRuntimeMatchesExact: false,
  },
  blockers: [],
  notes: [
    "Exact Hardhat standard JSON compiler inputs were submitted to Sourcify API v2.",
    "The award receipt is created inside the market constructor, so its source mapping requires exact runtime plus the exact parent market creation transaction rather than a separate top-level creation match.",
    "RPC credentials, private keys, signatures, confidential handles, and proofs are not used or recorded by this workflow.",
  ],
};

let stage = "CONFIGURATION";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function saveEvidence() {
  if (checkOnly) return;
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, {
    mode: 0o600,
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function fetchJson(url, options) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, options);
      const body = await response.json();
      if (response.status === 429 && attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, 4_000));
        continue;
      }
      return { body, response };
    } catch {
      if (attempt === 4) throw new Error("SOURCIFY_UNAVAILABLE");
      await new Promise((resolve) => setTimeout(resolve, 4_000));
    }
  }
  throw new Error("SOURCIFY_UNAVAILABLE");
}

async function lookup(chainId, address) {
  const { body, response } = await fetchJson(
    `${sourcifyBaseUrl}/v2/contract/${chainId}/${address}?fields=all`,
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("SOURCIFY_LOOKUP_FAILED");
  return body;
}

async function waitForVerification(verificationId) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const { body, response } = await fetchJson(
      `${sourcifyBaseUrl}/v2/verify/${verificationId}`,
    );
    if (!response.ok) {
      throw new Error("SOURCIFY_JOB_LOOKUP_FAILED");
    }
    if (body.isJobCompleted) {
      if (body.error || !body.contract) {
        throw new Error("SOURCIFY_VERIFICATION_FAILED");
      }
      return body.contract;
    }
    await new Promise((resolve) => setTimeout(resolve, 4_000));
  }
  throw new Error("SOURCIFY_VERIFICATION_TIMEOUT");
}

async function publish({
  address,
  buildInfo,
  contractIdentifier,
  creationTransactionHash,
}) {
  const { body, response } = await fetchJson(
    `${sourcifyBaseUrl}/v2/verify/11155111/${address}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stdJsonInput: buildInfo.input,
        compilerVersion: buildInfo.solcLongVersion,
        contractIdentifier,
        creationTransactionHash,
      }),
    },
  );
  if (response.status === 409) {
    const existing = await lookup(11_155_111, address);
    if (!existing) throw new Error("SOURCIFY_CONFLICT_LOOKUP_FAILED");
    return { contract: existing, verificationId: null };
  }
  if (response.status !== 202 || !body.verificationId) {
    throw new Error("SOURCIFY_SUBMISSION_FAILED");
  }
  return {
    contract: await waitForVerification(body.verificationId),
    verificationId: body.verificationId,
  };
}

async function main() {
  const deployment = readJson(deploymentPath);
  assert.equal(deployment.kind, "release");
  assert.equal(deployment.deploymentState, "configured");
  assert.equal(deployment.chainId, 11_155_111);
  evidence.assertions.releaseManifestLoaded = true;

  for (const definition of sourceDefinitions) {
    stage = `SOURCE_${definition.name}`;
    const artifact = readJson(
      resolve(auctionHouseRoot, definition.artifact),
    );
    const buildArtifact = definition.buildFrom
      ? readJson(resolve(auctionHouseRoot, definition.buildFrom))
      : artifact;
    const buildInfoPath = resolve(
      auctionHouseRoot,
      `artifacts/build-info/${buildArtifact.buildInfoId}.json`,
    );
    const buildInfoSource = readFileSync(buildInfoPath, "utf8");
    const buildInfo = JSON.parse(buildInfoSource);
    const contractIdentifier =
      `project/${artifact.sourceName}:${artifact.contractName}`;
    const deployed = deployment.contracts[definition.name];
    assert.ok(deployed?.address);
    assert.ok(deployed?.deploymentTransaction);

    let contract = await lookup(
      deployment.chainId,
      deployed.address,
    );
    let verificationId = null;
    const exactEnough =
      contract?.runtimeMatch === "exact_match" &&
      (definition.name === "VeilBidAwardReceipt" ||
        contract?.creationMatch === "exact_match");
    if (!exactEnough && !checkOnly) {
      const result = await publish({
        address: deployed.address,
        buildInfo,
        contractIdentifier,
        creationTransactionHash:
          deployed.deploymentTransaction.toLowerCase(),
      });
      contract = result.contract;
      verificationId = result.verificationId;
    }
    evidence.publicIdentifiers.contracts[definition.name] = {
      address: deployed.address,
      contractIdentifier,
      compilerVersion: buildInfo.solcLongVersion,
      buildInputSha256: sha256(buildInfoSource),
      verificationId,
      creationMatch: contract?.creationMatch ?? null,
      runtimeMatch: contract?.runtimeMatch ?? null,
      repositoryUrl:
        `https://repo.sourcify.dev/${deployment.chainId}/${deployed.address}`,
    };
    saveEvidence();
    if (!checkOnly) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }

  const published = Object.values(
    evidence.publicIdentifiers.contracts,
  );
  evidence.assertions.allSourcesPublished =
    published.length === sourceDefinitions.length &&
    published.every((contract) => contract.runtimeMatch !== null);
  evidence.assertions.allTopLevelCreationMatchesExact =
    sourceDefinitions
      .filter(
        (definition) =>
          definition.name !== "VeilBidAwardReceipt",
      )
      .every(
        (definition) =>
          evidence.publicIdentifiers.contracts[definition.name]
            .creationMatch === "exact_match",
      );
  evidence.assertions.embeddedReceiptSourceMapped =
    evidence.publicIdentifiers.contracts.VeilBidAwardReceipt
      .runtimeMatch === "exact_match" &&
    deployment.contracts.VeilBidAwardReceipt
      .deploymentTransaction ===
      deployment.contracts.VeilBidMarket.deploymentTransaction &&
    deployment.contracts.VeilBidAwardReceipt.deploymentBlock ===
      deployment.contracts.VeilBidMarket.deploymentBlock;
  evidence.assertions.allRuntimeMatchesExact = published.every(
    (contract) => contract.runtimeMatch === "exact_match",
  );
  assert.equal(evidence.assertions.allSourcesPublished, true);
  assert.equal(
    evidence.assertions.allTopLevelCreationMatchesExact,
    true,
  );
  assert.equal(
    evidence.assertions.embeddedReceiptSourceMapped,
    true,
  );
  assert.equal(evidence.assertions.allRuntimeMatchesExact, true);
  saveEvidence();
  console.log(
    JSON.stringify({
      mode: checkOnly ? "check" : "publish",
      evidence: checkOnly
        ? null
        : "evidence/sepolia/source-publication.release.json",
      assertions: evidence.assertions,
      contracts: evidence.publicIdentifiers.contracts,
    }),
  );
}

main().catch((error) => {
  const safeCode =
    error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : `RELEASE_SOURCE_${stage}_FAILED`;
  evidence.blockers.push(safeCode);
  evidence.notes.push(`Source publication stopped during ${stage}.`);
  saveEvidence();
  console.error(JSON.stringify({ stage, blocker: safeCode }));
  process.exitCode = 1;
});
