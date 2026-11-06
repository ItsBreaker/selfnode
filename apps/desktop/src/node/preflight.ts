/**
 * Pre-flight checks before running a node. The disk requirement uses the
 * clients' own published figures (see node-manifest.json): it refuses to start
 * if expected size + a growth buffer won't fit with a safety margin.
 */
import { execFile } from "node:child_process";
import { mkdirSync, statfsSync } from "node:fs";
import { totalmem } from "node:os";
import { promisify } from "node:util";
import { currentPlatform, unsupportedReason, type DiskFigures, type Manifest } from "./manifest";

const run = promisify(execFile);
const GB = 1e9;

export interface DiskSpace {
  freeGB: number;
  totalGB: number;
}

export function diskSpace(dir: string): DiskSpace {
  mkdirSync(dir, { recursive: true });
  const s = statfsSync(dir);
  return { freeGB: (s.bavail * s.bsize) / GB, totalGB: (s.blocks * s.bsize) / GB };
}

/** Expected footprint for a network: execution + consensus + growth buffer. */
export function requiredGB(d: DiskFigures): number {
  return d.executionGB + d.consensusGB + d.growthGBPerWeek * d.growthWeeks;
}

/** The free space to keep untouched on the volume: the larger of a fixed and a relative margin. */
export function safetyMarginGB(m: Manifest["disk"], totalGB: number): number {
  return Math.max(m.safetyMarginGB, m.safetyMarginFraction * totalGB);
}

/** Best-effort SSD detection. null = unknown. */
async function isSsd(dir: string): Promise<boolean | null> {
  try {
    if (process.platform === "darwin") {
      const { stdout: df } = await run("df", ["-P", dir]);
      const mount = df.trim().split("\n").pop()?.split(/\s+/).slice(5).join(" ");
      if (!mount) return null;
      const { stdout } = await run("diskutil", ["info", mount]);
      const m = stdout.match(/Solid State:\s+(Yes|No)/i);
      return m ? m[1]?.toLowerCase() === "yes" : null;
    }
    if (process.platform === "win32") {
      const drive = dir.slice(0, 1).toUpperCase();
      if (!/^[A-Z]$/.test(drive)) return null;
      const { stdout } = await run("powershell.exe", [
        "-NoProfile",
        "-Command",
        `(Get-Partition -DriveLetter ${drive} | Get-Disk | Get-PhysicalDisk).MediaType`,
      ]);
      if (/SSD/i.test(stdout)) return true;
      if (/HDD/i.test(stdout)) return false;
    }
  } catch {
    /* unknown */
  }
  return null;
}

export interface Check {
  id: string;
  label: string;
  ok: boolean;
  /** "fail" blocks starting; "warn" doesn't. */
  severity: "fail" | "warn" | "info";
  detail: string;
}

export interface Preflight {
  platform: string;
  supported: boolean;
  canStart: boolean;
  dataDir: string;
  disk: DiskSpace;
  requirement: { network: "sepolia"; requiredGB: number; marginGB: number; figures: DiskFigures };
  mainnet: { requiredGB: number; wouldFit: boolean };
  checks: Check[];
}

export async function preflight(manifest: Manifest, dataDir: string): Promise<Preflight> {
  const platform = `${process.platform}-${process.arch}`;
  const unsupported = unsupportedReason();
  const disk = diskSpace(dataDir);
  const figures = manifest.disk.sepolia;
  const need = requiredGB(figures);
  const margin = safetyMarginGB(manifest.disk, disk.totalGB);
  const ramGB = totalmem() / GB;
  const ssd = await isSsd(dataDir);
  const mainnetNeed = requiredGB(manifest.disk.mainnet);
  const checks: Check[] = [
    {
      id: "platform",
      label: "Official client builds for this computer",
      ok: !unsupported,
      severity: "fail",
      detail:
        unsupported ??
        `${platform}: Nethermind ${manifest.clients.nethermind.version} + Nimbus ${manifest.clients.nimbus.version}`,
    },
    {
      id: "disk",
      label: "Free disk space",
      ok: disk.freeGB >= need + margin,
      severity: "fail",
      detail: `${disk.freeGB.toFixed(0)} GB free. Sepolia needs about ${need} GB (Nethermind ${figures.executionGB} + Nimbus ${figures.consensusGB} + ${figures.growthWeeks} weeks of growth) and Selfnode keeps at least ${margin.toFixed(0)} GB free.`,
    },
    {
      id: "ram",
      label: "Memory",
      ok: ramGB >= manifest.disk.minRamGB - 0.5,
      severity: "warn",
      detail: `${ramGB.toFixed(0)} GB installed. Nethermind recommends ${manifest.disk.minRamGB} GB for Sepolia.`,
    },
    {
      id: "ssd",
      label: "Solid-state drive",
      ok: ssd !== false,
      severity: ssd === null ? "info" : "warn",
      detail:
        ssd === null
          ? "Couldn't detect the drive type. Nodes need an SSD."
          : ssd
            ? "SSD detected."
            : "This looks like a spinning disk. Nodes need an SSD to keep up.",
    },
  ];
  return {
    platform,
    supported: !unsupported && currentPlatform() !== null,
    canStart: checks.every((c) => c.ok || c.severity !== "fail"),
    dataDir,
    disk,
    requirement: { network: "sepolia", requiredGB: need, marginGB: margin, figures },
    mainnet: { requiredGB: mainnetNeed, wouldFit: disk.freeGB >= mainnetNeed + margin },
    checks,
  };
}

/** The watchdog's rule: pause when free space drops below 50 GB or 10% of the volume. */
export function diskTooLow(d: DiskSpace, m: Manifest["disk"]): boolean {
  return d.freeGB < m.safetyMarginGB || d.freeGB < m.safetyMarginFraction * d.totalGB;
}
