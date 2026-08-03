import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const repositoryRoot = resolve(new URL("../../..", import.meta.url).pathname);
const artifacts = [
  ["VeilBidFlareMarket", "VeilBidFlareMarket.sol"],
  ["VeilBidFlareAwardReceipt", "VeilBidFlareAwardReceipt.sol"],
];

for (const [contractName, sourceName] of artifacts) {
  const artifactPath = resolve(repositoryRoot, `packages/flare-contracts/out/${sourceName}/${contractName}.json`);
  const outputPath = resolve(repositoryRoot, `packages/flare-bindings/generated/abis/${contractName}.json`);
  const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  if (!Array.isArray(artifact.abi) || artifact.abi.length === 0) {
    throw new Error(`FLARE_ABI_MISSING:${contractName}`);
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact.abi, null, 2)}\n`, "utf8");
  console.log(`generated ${outputPath}`);
}
