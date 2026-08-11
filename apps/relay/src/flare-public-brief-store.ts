import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  hashFlarePublicBuyerBrief,
  parseFlarePublicBuyerBrief,
  serializeFlarePublicBuyerBrief,
  type FlarePublicBuyerBrief,
} from "@flarequorum/flare-bindings";
import type { Hex } from "viem";

const metadataHashPattern = /^0x[0-9a-fA-F]{64}$/;

export interface FlarePublicBriefStore {
  get(metadataHash: Hex): Promise<FlarePublicBuyerBrief | null>;
  put(metadataHash: Hex, value: unknown): Promise<FlarePublicBuyerBrief>;
}

export function parseFlarePublicBriefHash(value: string): Hex {
  if (!metadataHashPattern.test(value)) throw new Error("INVALID_FLARE_PUBLIC_BRIEF_HASH");
  return value.toLowerCase() as Hex;
}

function verifiedBrief(metadataHash: Hex, value: unknown): FlarePublicBuyerBrief {
  const brief = parseFlarePublicBuyerBrief(value);
  if (hashFlarePublicBuyerBrief(brief).toLowerCase() !== metadataHash.toLowerCase()) {
    throw new Error("FLARE_PUBLIC_BRIEF_HASH_MISMATCH");
  }
  return brief;
}

export class MemoryFlarePublicBriefStore implements FlarePublicBriefStore {
  readonly entries = new Map<Hex, string>();

  async get(metadataHash: Hex): Promise<FlarePublicBuyerBrief | null> {
    const key = parseFlarePublicBriefHash(metadataHash);
    const stored = this.entries.get(key);
    return stored === undefined ? null : verifiedBrief(key, JSON.parse(stored));
  }

  async put(metadataHash: Hex, value: unknown): Promise<FlarePublicBuyerBrief> {
    const key = parseFlarePublicBriefHash(metadataHash);
    const brief = verifiedBrief(key, value);
    const serialized = serializeFlarePublicBuyerBrief(brief);
    const existing = this.entries.get(key);
    if (existing !== undefined && existing !== serialized) throw new Error("FLARE_PUBLIC_BRIEF_IMMUTABLE");
    this.entries.set(key, serialized);
    return brief;
  }
}

export class FileFlarePublicBriefStore implements FlarePublicBriefStore {
  readonly directory: string;

  constructor(directory: string) {
    if (!directory.trim()) throw new Error("INVALID_FLARE_PUBLIC_BRIEF_DIRECTORY");
    this.directory = directory;
  }

  #path(metadataHash: Hex): string {
    return join(this.directory, `${parseFlarePublicBriefHash(metadataHash).slice(2)}.json`);
  }

  async get(metadataHash: Hex): Promise<FlarePublicBuyerBrief | null> {
    const key = parseFlarePublicBriefHash(metadataHash);
    let raw: string;
    try {
      raw = await readFile(this.#path(key), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    try {
      return verifiedBrief(key, JSON.parse(raw));
    } catch {
      throw new Error("FLARE_PUBLIC_BRIEF_STORE_CORRUPT");
    }
  }

  async put(metadataHash: Hex, value: unknown): Promise<FlarePublicBuyerBrief> {
    const key = parseFlarePublicBriefHash(metadataHash);
    const brief = verifiedBrief(key, value);
    const serialized = `${serializeFlarePublicBuyerBrief(brief)}\n`;
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      await writeFile(this.#path(key), serialized, { encoding: "utf8", flag: "wx", mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = await this.get(key);
      if (existing === null || `${serializeFlarePublicBuyerBrief(existing)}\n` !== serialized) {
        throw new Error("FLARE_PUBLIC_BRIEF_IMMUTABLE");
      }
    }
    return brief;
  }
}
