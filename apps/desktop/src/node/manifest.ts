/** Typed access to node-manifest.json (reviewed by the maintainer; see the file). */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type PlatformKey = "darwin-arm64" | "win32-x64";
export type ClientId = "nethermind" | "nimbus";

export interface PlatformBuild {
  url: string;
  sha256: string;
  archive: "zip" | "tar.gz";
  /** Path of the executable inside the extracted archive. */
  binary: string;
  /** Nimbus only: SHA-512 of the extracted binary, from its release notes. */
  binarySha512?: string;
}

export interface ClientEntry {
  role: "execution" | "consensus";
  version: string;
  license: string;
  release: string;
  checksumSource: string;
  platforms: Partial<Record<PlatformKey, PlatformBuild>>;
}

export interface DiskFigures {
  executionGB: number;
  consensusGB: number;
  growthGBPerWeek: number;
  growthWeeks: number;
}

export interface Manifest {
  /** When the URLs/checksums were last checked against the official releases. */
  checkedAt: string;
  /** Set to true once the maintainer has reviewed this file. */
  maintainerReviewed: boolean;
  network: "sepolia";
  clients: Record<ClientId, ClientEntry>;
  checkpointSync: { sepolia: string[] };
  disk: {
    sepolia: DiskFigures;
    mainnet: DiskFigures;
    safetyMarginGB: number;
    safetyMarginFraction: number;
    minRamGB: number;
  };
}

export function loadManifest(appRoot: string): Manifest {
  return JSON.parse(readFileSync(join(appRoot, "node-manifest.json"), "utf8")) as Manifest;
}

/** The current machine's platform key, or null if no official builds exist for it. */
export function currentPlatform(): PlatformKey | null {
  if (process.platform === "darwin" && process.arch === "arm64") return "darwin-arm64";
  if (process.platform === "win32" && process.arch === "x64") return "win32-x64";
  return null;
}

/** Why this machine can't run the node manager, in plain English. */
export function unsupportedReason(): string | null {
  if (currentPlatform()) return null;
  if (process.platform === "darwin") {
    return "The node manager isn't supported on this Mac. Nimbus (and Lighthouse) publish official builds only for Apple Silicon, not Intel Macs. You can still point Selfnode at a node you run elsewhere in Settings.";
  }
  return `The node manager supports macOS (Apple Silicon) and Windows x64 only. This is ${process.platform}-${process.arch}.`;
}
