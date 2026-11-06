/**
 * `--snapshot`: export each dataset from Arkiv, upload it to Swarm (bzz.limo),
 * read it back from both gateways, then upsert its selfnode-snapshot entity.
 *
 * `--from-swarm`: read each dataset's selfnode-snapshot entity from Arkiv,
 * download the file from Swarm (bzz.limo, then api.gateway.ethswarm.org),
 * check its SHA-256 against the entity and every row's contentHash, then
 * rebuild or patch the Arkiv entities from it with the normal idempotent sync.
 */
import { DatasetSchema, SnapshotSchema } from "@selfnode/core/labels/schema";
import { mkdirSync, writeFileSync } from "node:fs";
import { formatEther } from "viem";
import { account } from "./client.js";
import {
  DATASETS,
  exportDataset,
  parseSnapshot,
  planSnapshotEntity,
  readSnapshotEntity,
  serialize,
  toPlanned,
  type DatasetId,
  type SnapshotRow,
} from "./snapshot.js";
import { READ_GATEWAYS, sha256Hex, swarmDownload, swarmUpload } from "./swarm.js";
import { sync, type Planned, type SyncReport } from "./sync.js";

export interface RunOpts {
  dryRun: boolean;
  minBalanceWei: bigint;
  maxSpendWei: bigint;
  gateways?: readonly string[];
}

const kb = (n: number) => `${(n / 1024).toFixed(1)} KiB`;

function table(reports: SyncReport[]) {
  console.table(
    reports.map((r) => ({
      dataset: r.dataset,
      created: r.created,
      updated: r.updated,
      extended: r.extended,
      skipped: r.skipped,
      "left to expire": r.leftToExpire,
      tGLM: formatEther(r.spentWei),
    })),
  );
}

export async function runSnapshot(datasets: DatasetId[], opts: RunOpts): Promise<SyncReport[]> {
  const planned: Planned[] = [];
  const dir = new URL("./.cache/snapshots/", import.meta.url);
  mkdirSync(dir, { recursive: true });
  for (const ds of datasets) {
    console.log(`\n[snapshot] ${ds}`);
    const s = await exportDataset(ds);
    const bytes = serialize(s);
    const sha = sha256Hex(bytes);
    console.log(
      `  exported ${s.rowCount} rows + ${s.notices.length} licence notice(s) from Arkiv (${s.sources.map((x) => `${x.source}@${x.sourceCommit.slice(0, 7)}: ${x.rows}`).join(", ")}); every contentHash re-checked`,
    );
    console.log(`  ${kb(bytes.length)}, sha256 ${sha}`);
    writeFileSync(new URL(`${ds}-${sha.slice(0, 12)}.json`, dir), bytes);
    const existing = await readSnapshotEntity(ds);
    if (existing)
      console.log(`  current entity: swarmRef ${existing.swarmRef}, sha256 ${existing.sha256}`);
    if (opts.dryRun) {
      console.log("  dry run: not uploading");
      continue;
    }
    const { reference, tag } = await swarmUpload(`selfnode-${ds}.json`, bytes);
    console.log(`  uploaded to bzz.limo: ${reference} (swarm-tag ${tag ?? "none"})`);
    for (const g of READ_GATEWAYS) {
      try {
        const r = await swarmDownload(reference, sha, [g]);
        console.log(`  read back from ${r.gateway}: ${kb(r.bytes.length)}, sha256 matches`);
      } catch (e) {
        console.log(
          `  read back from ${g}: FAILED (${e instanceof Error ? e.message : String(e)})`,
        );
      }
    }
    // Same data → same createdAt, so an unchanged snapshot isn't patched.
    const createdAt =
      existing && existing.sha256 === sha && existing.swarmRef === reference
        ? existing.createdAt
        : Math.floor(Date.now() / 1000);
    planned.push(planSnapshotEntity(s, sha, reference, createdAt));
  }
  if (!planned.length) return [];
  console.log("\n[snapshot] Arkiv entities");
  const report = await sync("snapshots", SnapshotSchema as never, planned, opts);
  table([report]);
  for (const ds of datasets) {
    const e = await readSnapshotEntity(ds);
    if (e) console.log(`  ${ds}: entity ${e.entityKey} → swarmRef ${e.swarmRef}`);
  }
  return [report];
}

const bySource = (rows: SnapshotRow[]) => {
  const m = new Map<string, Planned[]>();
  for (const r of rows) {
    const s = String(r.attributes.source?.value);
    m.set(s, [...(m.get(s) ?? []), toPlanned(r)]);
  }
  return m;
};

export async function runFromSwarm(datasets: DatasetId[], opts: RunOpts): Promise<SyncReport[]> {
  const reports: SyncReport[] = [];
  const allNotices: SnapshotRow[] = [];
  for (const ds of datasets) {
    console.log(`\n[from-swarm] ${ds}`);
    const e = await readSnapshotEntity(ds);
    if (!e) throw new Error(`No selfnode-snapshot entity for ${ds} owned by ${account.address}`);
    console.log(
      `  Arkiv entity ${e.entityKey}: swarmRef ${e.swarmRef}, sha256 ${e.sha256.slice(0, 16)}…, ${e.rowCount} rows, ${e.version}, created ${new Date(e.createdAt * 1000).toISOString()}`,
    );
    const got = await swarmDownload(e.swarmRef, e.sha256, opts.gateways ?? READ_GATEWAYS);
    for (const f of got.failures) console.log(`  skipped ${f}`);
    console.log(
      `  downloaded from ${got.gateway}: ${kb(got.bytes.length)}, sha256 matches the entity`,
    );
    const s = parseSnapshot(got.bytes, ds, account.address);
    if (s.rowCount !== e.rowCount)
      throw new Error(`Entity says ${e.rowCount} rows, snapshot has ${s.rowCount}`);
    console.log(
      `  verified: format ${s.format}, owner ${s.owner}, ${s.rowCount} rows + ${s.notices.length} notice(s), every contentHash recomputed`,
    );
    const schema = DATASETS[ds].schema;
    for (const [source, rows] of bySource(s.rows))
      reports.push(await sync(`${ds} (${source}) from Swarm`, schema as never, rows, opts));
    allNotices.push(...s.notices);
  }
  // Licence notices share one schema across datasets (MyEtherWallet has one for
  // tokens and one for labels), so sync them together, scoped by source.
  for (const [source, rows] of bySource(allNotices))
    reports.push(await sync(`notices (${source}) from Swarm`, DatasetSchema as never, rows, opts));
  console.log("\n[from-swarm] Summary");
  table(reports);
  return reports;
}
