import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const outputPath = resolve(root, "evidence/local/preflight.json");

function commandVersion(command, args = ["--version"]) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

const evidence = {
  schemaVersion: 1,
  gate: "PREFLIGHT",
  recordedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    pnpm: commandVersion("pnpm"),
    docker: commandVersion("docker"),
    dockerCompose: commandVersion("docker", ["compose", "version"]),
    sepoliaRpcConfigured: Boolean(process.env.SEPOLIA_RPC_URL),
    sepoliaPrivateKeyConfigured: Boolean(process.env.SEPOLIA_PRIVATE_KEY),
  },
  packages: {
    noxProtocolContracts: "0.2.4",
    noxConfidentialContracts: "0.2.2",
    noxHandle: "0.1.0-beta.13",
    noxHardhatPlugin: "0.1.0",
    hardhat: "3.11.1",
    solidity: "0.8.35",
  },
  assertions: {
    node24: process.versions.node.startsWith("24."),
    localNoxAvailable: commandVersion("docker") !== null,
    sepoliaConfigurationPresent:
      Boolean(process.env.SEPOLIA_RPC_URL) &&
      Boolean(process.env.SEPOLIA_PRIVATE_KEY),
  },
  blockers: [],
};

if (!evidence.assertions.node24) {
  evidence.blockers.push("NODE_24_REQUIRED");
}
if (!evidence.assertions.sepoliaConfigurationPresent) {
  evidence.blockers.push("SEPOLIA_CONFIGURATION_MISSING");
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, {
  mode: 0o600,
});

console.log(
  JSON.stringify({
    evidence: "evidence/local/preflight.json",
    assertions: evidence.assertions,
    blockers: evidence.blockers,
  }),
);
