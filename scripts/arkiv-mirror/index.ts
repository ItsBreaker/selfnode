/**
 * Re-runnable Arkiv mirror: tokens, then labels + scam list, then function
 * signatures (approved sources only; all MIT). Idempotent: a re-run with no
 * source changes only extends entities that are close to expiring.
 *
 * usage: pnpm --filter @selfnode/scripts arkiv:mirror [--dry-run] [--only tokens,labels,sigs]
 *          [--max-sigs 5000] [--sample-blocks 300] [--reserve 2] [--max-spend 5]
 *
 * Swarm snapshots (see /arkiv/swarm.md):
 *   --snapshot     export each dataset from Arkiv, upload it to Swarm, write its
 *                  selfnode-snapshot entity
 *   --from-swarm   rebuild/patch the Arkiv entities from the Swarm snapshots,
 *                  verified against the snapshot entities' SHA-256
 *   [--swarm-gateways https://bzz.limo,https://api.gateway.ethswarm.org]
 */
import {
  DatasetSchema,
  LabelSchema,
  SigSchema,
  TokenSchema,
  labelKey,
  sigKey,
  tokenKey,
} from "@selfnode/core/labels/schema";
import { u64 } from "@arkiv-network/sdk/schema";
import { mkdirSync, writeFileSync } from "node:fs";
import { formatEther, parseEther, stringToBytes } from "viem";
import { account, reader, redact } from "./client.js";
import {
  SOURCES,
  headCommit,
  readLabels,
  readLicense,
  readSignatures,
  readTokens,
  type Dataset,
} from "./sources.js";
import { hashContent, sync, type Planned, type SyncReport, type Values } from "./sync.js";
import { runFromSwarm, runSnapshot } from "./snapshot-run.js";
import type { DatasetId } from "./snapshot.js";
import { sampleUsage } from "./usage.js";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string, d: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? (args[i + 1] as string) : d;
};
const only = new Set(opt("only", "tokens,labels,sigs").split(","));
const dryRun = flag("dry-run");
const maxSigs = Number(opt("max-sigs", "5000"));
const sampleBlocks = Number(opt("sample-blocks", "300"));
const minBalanceWei = parseEther(opt("reserve", "2"));
const maxSpendWei = parseEther(opt("max-spend", "5"));

function plan(ds: Dataset<unknown>, rowKey: string, values: Values): Planned {
  const contentHash = hashContent(values);
  return {
    rowKey,
    contentHash,
    values: {
      ...values,
      rowKey,
      source: ds.source,
      license: ds.license,
      sourceCommit: ds.commit,
      contentHash,
    },
  };
}
const printDrops = (ds: Dataset<unknown>) =>
  ds.drops.forEach((d) => console.log(`    dropped ${d.count} × ${d.reason}`));

try {
  const start = await reader.getBalance({ address: account.address });
  console.log(
    `Arkiv mirror ${dryRun ? "(dry run) " : ""}as ${account.address}, balance ${formatEther(start)} tGLM, reserve ${formatEther(minBalanceWei)}`,
  );
  if (flag("snapshot") || flag("from-swarm")) {
    const datasets = [...only].filter((d): d is DatasetId =>
      ["tokens", "labels", "sigs"].includes(d),
    );
    const gw = opt("swarm-gateways", "");
    const runOpts = {
      dryRun,
      minBalanceWei,
      maxSpendWei,
      ...(gw ? { gateways: gw.split(",") } : {}),
    };
    if (flag("snapshot")) await runSnapshot(datasets, runOpts);
    else await runFromSwarm(datasets, runOpts);
    const end = await reader.getBalance({ address: account.address });
    console.log(`\nSpent ${formatEther(start - end)} tGLM; balance ${formatEther(end)} tGLM.`);
    process.exit(0);
  }
  const commits = {
    mew: opt("mew-commit", await headCommit(SOURCES.mew.repo)),
    tokens: opt("tokens-commit", await headCommit(SOURCES.tokens.repo)),
    fourbytes: opt("4bytes-commit", await headCommit(SOURCES.fourbytes.repo)),
  };
  console.log("Pinned commits:", commits);
  const reports: SyncReport[] = [];
  const notices: Planned[] = [];
  /** One notice entity per (dataset, source): the MIT notice travels with the data. */
  const notice = async (dataset: string, ds: Dataset<unknown>) => {
    const lic = await readLicense(ds.source, ds.commit);
    notices.push(
      plan(ds, `dataset:${dataset}:${ds.source.toLowerCase()}`, {
        type: "dataset",
        dataset,
        copyright: lic.copyright,
        licenseText: stringToBytes(lic.text),
        url: `https://github.com/${ds.source}/tree/${ds.commit}`,
        rowCount: u64(BigInt(ds.rows.length)),
      }),
    );
  };
  const meta: Record<string, unknown> = { commits };

  if (only.has("tokens")) {
    console.log("\n[1/3] Tokens");
    for (const ds of await readTokens(commits)) {
      console.log(`  ${ds.source}@${ds.commit.slice(0, 7)}: ${ds.rows.length} valid rows`);
      printDrops(ds);
      const rows = ds.rows.map((t) =>
        plan(ds, tokenKey(t.chainId, t.address), {
          type: "token",
          chain: String(t.chainId),
          address: t.address,
          symbol: t.symbol,
          name: t.name,
          decimals: t.decimals,
        }),
      );
      reports.push(
        await sync(`tokens (${ds.source})`, TokenSchema as never, rows, {
          dryRun,
          minBalanceWei,
          maxSpendWei,
        }),
      );
      await notice("tokens", ds);
      meta[`tokens:${ds.source}`] = { rows: ds.rows.length, drops: ds.drops };
    }
  }
  if (only.has("labels")) {
    console.log("\n[2/3] Labels and scam list");
    const ds = await readLabels(commits.mew);
    console.log(
      `  ${ds.source}@${ds.commit.slice(0, 7)}: ${ds.rows.length} valid rows (${ds.rows.filter((r) => r.category === "flagged").length} flagged)`,
    );
    printDrops(ds);
    const rows = ds.rows.map((l) => {
      const v: Values = {
        type: "label",
        chain: String(l.chainId),
        address: l.address,
        name: l.name,
        category: l.category,
      };
      if (l.note) v.note = stringToBytes(l.note);
      return plan(ds, labelKey(l.chainId, l.address), v);
    });
    reports.push(
      await sync("labels", LabelSchema as never, rows, { dryRun, minBalanceWei, maxSpendWei }),
    );
    await notice("labels", ds);
    meta.labels = { rows: ds.rows.length, drops: ds.drops };
  }
  if (only.has("sigs")) {
    console.log(`\n[3/3] Function signatures (cap ${maxSigs})`);
    const usage = await sampleUsage(sampleBlocks);
    console.log(
      `  usage sample: blocks ${usage.fromBlock}–${usage.toBlock}, ${usage.txs} txs, ${usage.callsWithSelector} calls, ${Object.keys(usage.counts).length} distinct selectors`,
    );
    const ds = await readSignatures(
      commits.fourbytes,
      new Map(Object.entries(usage.counts)),
      maxSigs,
    );
    console.log(`  ${ds.source}@${ds.commit.slice(0, 7)}: ${ds.rows.length} selectors kept`);
    printDrops(ds);
    const coverage = ds.rows.reduce((n, r) => n + r.uses, 0) / Math.max(1, usage.callsWithSelector);
    console.log(`  these cover ${(coverage * 100).toFixed(1)}% of sampled calls`);
    const rows = ds.rows.map((s) =>
      plan(ds, sigKey(s.selector), {
        type: "sig",
        selector: s.selector,
        text: stringToBytes(s.texts.join(";")),
        rank: s.rank,
      }),
    );
    reports.push(
      await sync("signatures", SigSchema as never, rows, { dryRun, minBalanceWei, maxSpendWei }),
    );
    await notice("sigs", ds);
    meta.sigs = {
      rows: ds.rows.length,
      drops: ds.drops,
      sample: { ...usage, counts: undefined },
      coverage,
    };
  }

  if (notices.length) {
    console.log("\nDataset notices (licence text on Arkiv)");
    // sync() scopes existing entities by source, so sync each source's notices
    // separately (MyEtherWallet has two: tokens and labels). Mixing sources made
    // every run re-create the other sources' notices.
    const bySource = new Map<string, Planned[]>();
    for (const n of notices) {
      const src = String(n.values.source);
      bySource.set(src, [...(bySource.get(src) ?? []), n]);
    }
    for (const [src, rows] of bySource)
      reports.push(
        await sync(`dataset notices (${src})`, DatasetSchema as never, rows, {
          dryRun,
          minBalanceWei,
          maxSpendWei,
        }),
      );
  }

  const end = await reader.getBalance({ address: account.address });
  console.log("\nSummary");
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
  console.log(`Spent ${formatEther(start - end)} tGLM; balance ${formatEther(end)} tGLM.`);
  mkdirSync(new URL("./.cache/", import.meta.url), { recursive: true });
  writeFileSync(
    new URL(`./.cache/report-${Date.now()}.json`, import.meta.url),
    JSON.stringify(
      {
        dryRun,
        owner: account.address,
        ...meta,
        reports: reports.map((r) => ({ ...r, spentWei: r.spentWei.toString() })),
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error("FAILED:", redact(e instanceof Error ? `${e.name}: ${e.message}` : String(e)));
  process.exit(1);
}
