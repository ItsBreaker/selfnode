/**
 * Download and verify client binaries. Only the official release URLs pinned
 * in node-manifest.json are fetched, and nothing is executed unless:
 *   1. the downloaded archive's SHA-256 matches the manifest, and
 *   2. (Nimbus) the extracted binary's SHA-512 matches Nimbus's published value.
 * A verified install is re-hashed (every file) before every start.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import type { ClientId, Manifest, PlatformBuild, PlatformKey } from "./manifest";

const run = promisify(execFile);

/**
 * The OS's own bsdtar, by absolute path: it reads both .zip and .tar.gz, and an
 * absolute path means a different `tar` earlier on PATH (e.g. Git for Windows'
 * GNU tar, which can't read .zip) is never used.
 */
export function systemTar(): string {
  if (process.platform === "win32")
    return join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
  return "/usr/bin/tar";
}

export class VerificationError extends Error {
  override readonly name = "VerificationError";
}

async function hashFile(path: string, algo: "sha256" | "sha512"): Promise<string> {
  const h = createHash(algo);
  await pipeline(createReadStream(path), h);
  return h.digest("hex");
}

/** Hash of every file in an install (paths + contents), so any changed library is caught. */
async function treeHash(dir: string): Promise<string> {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name !== ".selfnode-verified.json") files.push(p);
    }
  };
  walk(dir);
  files.sort();
  const h = createHash("sha256");
  for (const f of files) h.update(`${relative(dir, f)}\0${await hashFile(f, "sha256")}\n`);
  return h.digest("hex");
}

export interface Installed {
  client: ClientId;
  version: string;
  dir: string;
  binary: string;
}

const marker = (dir: string) => join(dir, ".selfnode-verified.json");

export function installDir(binRoot: string, client: ClientId, version: string): string {
  return join(binRoot, `${client}-${version}`);
}

/** Re-verify an existing install. Returns null if missing or tampered. */
async function verifyInstalled(dir: string, build: PlatformBuild): Promise<string | null> {
  const bin = join(dir, build.binary);
  if (!existsSync(marker(dir)) || !existsSync(bin)) return null;
  const m = JSON.parse(readFileSync(marker(dir), "utf8")) as { sha256: string; treeSha256: string };
  if (m.sha256 !== build.sha256) return null;
  if (build.binarySha512 && (await hashFile(bin, "sha512")) !== build.binarySha512) return null;
  if ((await treeHash(dir)) !== m.treeSha256) return null; // any file changed since verification
  return bin;
}

export async function ensureInstalled(
  manifest: Manifest,
  client: ClientId,
  platform: PlatformKey,
  binRoot: string,
  onProgress: (msg: string) => void,
): Promise<Installed> {
  const entry = manifest.clients[client];
  const build = entry.platforms[platform];
  if (!build) throw new VerificationError(`No official ${client} build for ${platform}`);
  const dir = installDir(binRoot, client, entry.version);
  const existing = await verifyInstalled(dir, build);
  if (existing) return { client, version: entry.version, dir, binary: existing };

  // Fresh install into a temp dir, promoted only after every check passes.
  mkdirSync(binRoot, { recursive: true });
  const tmp = `${dir}.partial`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const archive = join(tmp, `download.${build.archive}`);
  if (!build.url.startsWith("https://github.com/"))
    throw new VerificationError(`Refusing non-official URL ${build.url}`);
  onProgress(`Downloading ${client} ${entry.version} from its official release…`);
  const res = await fetch(build.url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) for ${build.url}`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(archive));

  onProgress(`Verifying ${client} archive (SHA-256)…`);
  const got = await hashFile(archive, "sha256");
  if (got !== build.sha256) {
    rmSync(tmp, { recursive: true, force: true });
    throw new VerificationError(
      `${client} archive failed verification: expected ${build.sha256}, got ${got}. Nothing was run.`,
    );
  }
  onProgress(`Extracting ${client}…`);
  await run(systemTar(), ["-xf", archive, "-C", tmp]);
  rmSync(archive);
  const bin = join(tmp, build.binary);
  if (!existsSync(bin))
    throw new VerificationError(
      `${client}: expected binary ${build.binary} not found in the archive`,
    );
  if (build.binarySha512) {
    onProgress(`Verifying ${client} binary (SHA-512 from its release notes)…`);
    const b512 = await hashFile(bin, "sha512");
    if (b512 !== build.binarySha512) {
      rmSync(tmp, { recursive: true, force: true });
      throw new VerificationError(`${client} binary failed SHA-512 verification. Nothing was run.`);
    }
  }
  if (process.platform !== "win32") chmodSync(bin, 0o755);
  writeFileSync(
    marker(tmp),
    JSON.stringify({
      sha256: build.sha256,
      treeSha256: await treeHash(tmp),
      verifiedAt: new Date().toISOString(),
    }),
  );
  rmSync(dir, { recursive: true, force: true });
  renameSync(tmp, dir);
  onProgress(`${client} ${entry.version} verified.`);
  return { client, version: entry.version, dir, binary: join(dir, build.binary) };
}
