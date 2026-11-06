/**
 * Mirror the production web app to Swarm (pnpm --filter @selfnode/scripts swarm:site).
 *
 * Takes apps/web/dist (run `pnpm --filter @selfnode/web build` first), puts the
 * production CSPs from public/_headers into <meta> tags (a Swarm gateway can't
 * send our headers; frame-ancestors can't be set from a meta tag and is
 * dropped), uploads it as a website collection through bzz.limo with plain
 * fetch, checks it's served from https://<cid>.bzz.limo/, then records it as a
 * selfnode-snapshot entity (dataset "web") on Arkiv. Respects --dry-run and the
 * tGLM reserve.
 */
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { u64 } from "@arkiv-network/sdk/schema";
import { SnapshotSchema } from "@selfnode/core/labels/schema";
import { formatEther, parseEther } from "viem";
import { account, reader, redact } from "./client.js";
import { cspFor, withMetaCsp } from "./site-csp.js";
import { sha256Hex, swarmCid, swarmUploadSite } from "./swarm.js";
import { hashContent, sync, type Values } from "./sync.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const root = new URL("../../", import.meta.url).pathname;
const dist = join(root, "apps/web/dist");

const countFiles = (d: string): number =>
  readdirSync(d).reduce(
    (n, f) => n + (statSync(join(d, f)).isDirectory() ? countFiles(join(d, f)) : 1),
    0,
  );

if (process.argv[1]?.endsWith("site.ts")) {
  try {
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root }).toString().trim();
    const dirty = execFileSync(
      "git",
      ["status", "--porcelain", "--", "apps/web", "packages/core"],
      { cwd: root },
    )
      .toString()
      .trim();
    if (dirty)
      throw new Error(
        "apps/web or packages/core has uncommitted changes; commit first so the mirror matches a commit",
      );
    const headers = readFileSync(join(root, "apps/web/public/_headers"), "utf8");
    const site = mkdtempSync(join(tmpdir(), "selfnode-site-"));
    cpSync(dist, site, { recursive: true });
    rmSync(join(site, "_headers"), { force: true }); // Cloudflare-only; meaningless on Swarm
    for (const [file, block] of [
      ["index.html", "/*"],
      ["anon-rpc-iframe.html", "/anon-rpc-iframe.html"],
    ] as const)
      writeFileSync(
        join(site, file),
        withMetaCsp(readFileSync(join(site, file), "utf8"), cspFor(headers, block)),
      );
    const files = countFiles(site);
    const tarPath = join(site, "..", `${site.split("/").pop()}.tar`);
    execFileSync("/usr/bin/tar", ["--format", "ustar", "-cf", tarPath, "-C", site, "."], {
      env: { ...process.env, COPYFILE_DISABLE: "1" },
    });
    const tar = new Uint8Array(readFileSync(tarPath));
    const sha = sha256Hex(tar);
    console.log(
      `Web build @${commit.slice(0, 7)}: ${files} files, ${(tar.length / 1e6).toFixed(1)} MB tar, sha256 ${sha}`,
    );
    if (dryRun) {
      console.log("dry run: not uploading");
      process.exit(0);
    }
    const { reference, tag } = await swarmUploadSite(tar);
    const cid = swarmCid(reference);
    const url = `https://${cid}.bzz.limo/`;
    console.log(`Uploaded via bzz.limo: ${reference} (swarm-tag ${tag ?? "none"})\n  ${url}`);
    const served = await (await fetch(url, { signal: AbortSignal.timeout(90_000) })).text();
    const local = readFileSync(join(site, "index.html"), "utf8");
    if (served !== local) throw new Error(`${url} doesn't serve this build's index.html`);
    console.log("  index.html served byte-for-byte, meta CSP in place");
    const values: Values = {
      type: "snapshot",
      dataset: "web",
      version: commit.slice(0, 12),
      rowCount: u64(BigInt(files)) as Values[string],
      sha256: sha,
      swarmRef: reference,
      createdAt: u64(BigInt(Math.floor(Date.now() / 1000))) as Values[string],
    };
    const contentHash = hashContent(values);
    const report = await sync(
      "web mirror",
      SnapshotSchema as never,
      [
        {
          rowKey: "snapshot:web",
          contentHash,
          values: {
            ...values,
            rowKey: "snapshot:web",
            source: "ItsBreaker/selfnode",
            license: "MIT",
            sourceCommit: commit,
            contentHash,
          },
        },
      ],
      { dryRun: false, minBalanceWei: parseEther("2"), maxSpendWei: parseEther("0.1") },
    );
    console.log(
      `Arkiv: created ${report.created}, updated ${report.updated} (${formatEther(report.spentWei)} tGLM)`,
    );
    const { entities } = (await reader
      .select()
      .from(SnapshotSchema as never)
      .ownedBy(account.address)
      .limit(20)
      .fetch()) as unknown as { entities: Record<string, { value?: unknown } | string>[] };
    const e = entities.find((x) => (x.rowKey as { value?: unknown })?.value === "snapshot:web");
    console.log(`  entity ${String(e?.$key)} → swarmRef ${reference}`);
  } catch (e) {
    console.error("FAILED:", redact(e instanceof Error ? e.message : String(e)));
    process.exit(1);
  }
}
