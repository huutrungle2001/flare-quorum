import { randomBytes } from "node:crypto";
import { chmodSync, readFileSync, renameSync, writeFileSync } from "node:fs";

const secretSpecifications = {
  PROXY_PRIVATE_KEY: (bytes) => bytes.toString("hex"),
  FCC_DIRECT_API_KEY: (bytes) => bytes.toString("base64url"),
};

function assignmentPattern(name) {
  return new RegExp(`^([ \\t]*${name}[ \\t]*=)[^\\r\\n]*$`, "mu");
}

export function ensureLocalFccSecrets(path, randomBytesImplementation = randomBytes) {
  let source;
  try {
    source = readFileSync(path, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    source = "";
  }
  const statuses = {};
  for (const [name, encode] of Object.entries(secretSpecifications)) {
    const pattern = assignmentPattern(name);
    const match = source.match(pattern);
    if (match && match[0].slice(match[1].length).trim().length > 0) {
      statuses[name] = "existing";
      continue;
    }
    const value = encode(randomBytesImplementation(32));
    if (match) {
      source = source.replace(pattern, `${match[1]}${value}`);
    } else {
      if (source.length > 0 && !source.endsWith("\n")) source += "\n";
      source += `${name}=${value}\n`;
    }
    statuses[name] = "created";
  }
  const temporaryPath = `${path}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, source, { encoding: "utf8", mode: 0o600 });
  chmodSync(temporaryPath, 0o600);
  renameSync(temporaryPath, path);
  chmodSync(path, 0o600);
  return statuses;
}
