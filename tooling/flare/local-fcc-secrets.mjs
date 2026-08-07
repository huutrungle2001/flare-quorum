import { randomBytes } from "node:crypto";
import { chmodSync, readFileSync, renameSync, writeFileSync } from "node:fs";

const secretSpecifications = {
  PROXY_PRIVATE_KEY: (bytes) => bytes.toString("hex"),
  FCC_DIRECT_API_KEY: (bytes) => bytes.toString("base64url"),
};

function assignmentPattern(name) {
  return new RegExp(`^([ \\t]*${name}[ \\t]*=)[^\\r\\n]*$`, "mu");
}

function readLocalEnvironment(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return "";
  }
}

function writeLocalEnvironment(path, source) {
  const temporaryPath = `${path}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, source, { encoding: "utf8", mode: 0o600 });
  chmodSync(temporaryPath, 0o600);
  renameSync(temporaryPath, path);
  chmodSync(path, 0o600);
}

export function setLocalEnvironmentValues(path, assignments) {
  let source = readLocalEnvironment(path);
  for (const [name, value] of Object.entries(assignments)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name) || typeof value !== "string" || value.length === 0 || /[\r\n]/.test(value)) {
      throw new Error("LOCAL_ENVIRONMENT_ASSIGNMENT_INVALID");
    }
    const pattern = assignmentPattern(name);
    const match = source.match(pattern);
    if (match) {
      source = source.replace(pattern, `${match[1]}${value}`);
    } else {
      if (source.length > 0 && !source.endsWith("\n")) source += "\n";
      source += `${name}=${value}\n`;
    }
  }
  writeLocalEnvironment(path, source);
}

export function ensureLocalFccSecrets(path, randomBytesImplementation = randomBytes) {
  let source = readLocalEnvironment(path);
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
  writeLocalEnvironment(path, source);
  return statuses;
}
