import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const repositoryRoot = resolve(new URL("../../..", import.meta.url).pathname);
const artifactPath = resolve(repositoryRoot, "packages/flare-contracts/out/VeilBidFlareMarket.sol/VeilBidFlareMarket.json");
const outputPath = resolve(repositoryRoot, "packages/flare-bindings/generated/abis/VeilBidFlareMarket.json");

const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
if (!Array.isArray(artifact.abi) || artifact.abi.length === 0) {
  throw new Error("FLARE_MARKET_ABI_MISSING");
}
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(artifact.abi, null, 2)}\n`, "utf8");
console.log(`generated ${outputPath}`);
