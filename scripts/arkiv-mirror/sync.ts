/**
 * Idempotent upsert into Arkiv, keyed by our deterministic `rowKey`:
 * - not on Arkiv yet          → create (90-day expiry)
 * - on Arkiv, content changed → patch (and refresh expiry)
 * - unchanged, < 45 days left → extend to 90 days
 * - unchanged, enough left    → skip (costs nothing)
 * Rows that vanished from the source are left to expire, never extended.
 * Reads are always scoped by owner (our mirror wallet).
 */
import { ExpirationTime } from "@arkiv-network/sdk";
import { asc, gt } from "@arkiv-network/sdk/query";
import { key as keyValue, type Schema } from "@arkiv-network/sdk/schema";
import { createHash } from "node:crypto";
import { formatEther, type Hex } from "viem";
import { account, reader, redact, writer } from "./client.js";

export const LIFETIME_DAYS = 90;
export const EXTEND_BELOW_DAYS = 45;
const BLOCK_SECONDS = 2; // Rabdi block time (per the SDK's ExpirationTime docs)
const BATCH = 40; // ~11M gas at 90 days; the per-tx cap is 2^24

export type Values = Record<string, string | number | bigint | undefined>;
export interface Planned {
  rowKey: string;
  values: Values; // includes provenance fields
  contentHash: string;
}

export const hashContent = (v: Values) =>
  createHash("sha256")
    .update(
      JSON.stringify(
        Object.keys(v)
          .sort()
          .map((k) => [k, typeof v[k] === "bigint" ? String(v[k]) : v[k]]),
      ),
    )
    .digest("hex");

interface Existing {
  entityKey: Hex;
  contentHash: string;
  expiresAt: bigint;
}

async function existing(schema: Schema): Promise<Map<string, Existing>> {
  const out = new Map<string, Existing>();
  let last: Hex | null = null;
  for (;;) {
    let q = reader
      .select({ $key: true, $expiresAt: true, rowKey: true, contentHash: true } as never)
      .from(schema, { onMismatch: "throw" } as never)
      .ownedBy(account.address)
      .orderBy(asc("$key"))
      .limit(100);
    if (last) q = q.where(gt("$key", keyValue(last)) as never);
    const page = (await q.fetch()) as unknown as {
      entities: {
        $key: Hex;
        $expiresAt: bigint;
        rowKey: { value: string };
        contentHash: { value: string };
      }[];
    };
    for (const e of page.entities) {
      out.set(e.rowKey.value, {
        entityKey: e.$key,
        contentHash: e.contentHash.value,
        expiresAt: BigInt(e.$expiresAt),
      });
    }
    if (page.entities.length < 100) return out;
    last = page.entities[page.entities.length - 1]?.$key ?? null;
  }
}

export interface SyncReport {
  dataset: string;
  created: number;
  updated: number;
  extended: number;
  skipped: number;
  leftToExpire: number;
  spentWei: bigint;
  txs: string[];
}

export async function sync(
  dataset: string,
  schema: Schema,
  rows: Planned[],
  opts: { dryRun: boolean; minBalanceWei: bigint; maxSpendWei: bigint },
): Promise<SyncReport> {
  const have = await existing(schema);
  const head = await reader.getBlockNumber();
  const extendBelow = BigInt((EXTEND_BELOW_DAYS * 86_400) / BLOCK_SECONDS);
  const expiration = ExpirationTime.fromDays(LIFETIME_DAYS);

  const creates: Planned[] = [];
  const patches: (Planned & { entityKey: Hex })[] = [];
  const extensions: Hex[] = [];
  let skipped = 0;
  for (const r of rows) {
    const e = have.get(r.rowKey);
    if (!e) creates.push(r);
    else if (e.contentHash !== r.contentHash) patches.push({ ...r, entityKey: e.entityKey });
    else if (e.expiresAt - head < extendBelow) extensions.push(e.entityKey);
    else skipped++;
  }
  const wanted = new Set(rows.map((r) => r.rowKey));
  const leftToExpire = [...have.keys()].filter((k) => !wanted.has(k)).length;
  const report: SyncReport = {
    dataset,
    created: 0,
    updated: 0,
    extended: 0,
    skipped,
    leftToExpire,
    spentWei: 0n,
    txs: [],
  };
  console.log(
    `  ${dataset}: ${rows.length} rows → create ${creates.length}, update ${patches.length}, extend ${extensions.length}, skip ${skipped}, left to expire ${leftToExpire}`,
  );
  if (opts.dryRun)
    return {
      ...report,
      created: creates.length,
      updated: patches.length,
      extended: extensions.length,
    };

  type Op =
    | { kind: "create"; r: Planned }
    | { kind: "patch"; r: Planned & { entityKey: Hex } }
    | { kind: "extend"; k: Hex };
  const ops: Op[] = [
    ...creates.map((r) => ({ kind: "create" as const, r })),
    ...patches.map((r) => ({ kind: "patch" as const, r })),
    ...extensions.map((k) => ({ kind: "extend" as const, k })),
  ];
  for (let i = 0; i < ops.length; i += BATCH) {
    const batch = ops.slice(i, i + BATCH);
    const balance = await reader.getBalance({ address: account.address });
    if (balance < opts.minBalanceWei)
      throw new Error(`Stopping: balance ${formatEther(balance)} tGLM is below the reserve`);
    if (report.spentWei > opts.maxSpendWei)
      throw new Error(`Stopping: spent ${formatEther(report.spentWei)} tGLM, over --max-spend`);
    const data = {
      creates: batch.flatMap((o) =>
        o.kind === "create" ? [{ schema, values: o.r.values, expiration }] : [],
      ),
      patches: batch.flatMap((o) =>
        o.kind === "patch" ? [{ schema, entityKey: o.r.entityKey, set: o.r.values }] : [],
      ),
      extensions: batch.flatMap((o) =>
        o.kind === "extend"
          ? [{ entityKey: o.k, expiration }]
          : o.kind === "patch"
            ? [{ entityKey: o.r.entityKey, expiration }]
            : [],
      ),
    };
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await writer.executeBatch(data as never);
        report.txs.push(res.txHash);
        break;
      } catch (e) {
        const msg = redact(
          e instanceof Error ? (e.message.split("\n")[0] ?? e.message) : String(e),
        );
        if (attempt >= 4)
          throw new Error(`batch ${i / BATCH + 1} failed after ${attempt} attempts: ${msg}`, {
            cause: e,
          });
        console.warn(`  retrying batch ${i / BATCH + 1} (${msg})`);
        await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      }
    }
    const after = await reader.getBalance({ address: account.address });
    report.spentWei += balance - after;
    for (const o of batch) {
      if (o.kind === "create") report.created++;
      else if (o.kind === "patch") report.updated++;
      else report.extended++;
    }
    process.stdout.write(
      `\r  ${dataset}: ${Math.min(i + BATCH, ops.length)}/${ops.length} written, ${formatEther(report.spentWei)} tGLM`,
    );
  }
  if (ops.length) process.stdout.write("\n");
  return report;
}
