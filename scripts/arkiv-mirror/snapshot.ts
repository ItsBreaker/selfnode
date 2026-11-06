/**
 * Dataset snapshots: an owner-scoped export of what is actually on Arkiv, as
 * one deterministic JSON file per dataset (tokens, labels, sigs), each with its
 * licence notice(s). Stored unencrypted on Swarm; Arkiv holds a
 * `selfnode-snapshot` entity per dataset pointing at it (`swarmRef`) with the
 * file's SHA-256.
 *
 * The file is canonical (rows sorted by rowKey, attribute names sorted, no
 * timestamps inside), so unchanged data always has the same SHA-256 and the
 * same Swarm reference. Every row's contentHash is recomputed on export and on
 * import, so a corrupted row can't be written back.
 */
import { u64 } from "@arkiv-network/sdk/schema";
import { asc, eq, gt, and } from "@arkiv-network/sdk/query";
import { key as keyValue, type Schema } from "@arkiv-network/sdk/schema";
import {
  DatasetSchema,
  LabelSchema,
  SigSchema,
  SnapshotSchema,
  TokenSchema,
} from "@selfnode/core/labels/schema";
import { hexToBytes, isHex, type Hex } from "viem";
import { account, reader } from "./client.js";
import { hashContent, type Planned, type Values } from "./sync.js";

export const FORMAT = "selfnode-arkiv-snapshot/1";
export const SNAPSHOT_SOURCE = "selfnode/arkiv-snapshots";
export const DATASETS = {
  tokens: { schema: TokenSchema, schemaName: "selfnode-token" },
  labels: { schema: LabelSchema, schemaName: "selfnode-label" },
  sigs: { schema: SigSchema, schemaName: "selfnode-sig" },
} as const;
export type DatasetId = keyof typeof DATASETS;

/** The slice of the SDK's query builder we use (its generics don't survive a schema cast). */
interface Query {
  where(c: unknown): Query;
  ownedBy(a: string): Query;
  orderBy(o: unknown): Query;
  limit(n: number): Query;
  fetch(): Promise<unknown>;
}
const query = (schema: unknown) => reader.select().from(schema as never) as unknown as Query;

const PROVENANCE = new Set(["rowKey", "source", "license", "sourceCommit", "contentHash"]);

/** An attribute as Arkiv returns it; u64 values are carried as decimal strings. */
type Attr = { type: "str" | "i32" | "u64" | "bytes"; value: string | number };
export interface SnapshotRow {
  rowKey: string;
  contentHash: string;
  attributes: Record<string, Attr>;
}
export interface SnapshotFile {
  format: typeof FORMAT;
  dataset: DatasetId;
  owner: string;
  rowsSchema: string;
  noticesSchema: "selfnode-dataset";
  sources: { source: string; license: string; sourceCommit: string; rows: number }[];
  rowCount: number;
  rows: SnapshotRow[];
  notices: SnapshotRow[];
}

/** Attribute → the exact value the importer originally wrote (so hashes match). */
function toValue(a: Attr): Values[string] {
  switch (a.type) {
    case "str":
      return String(a.value);
    case "i32":
      return Number(a.value);
    case "u64":
      return u64(BigInt(a.value)) as Values[string];
    case "bytes": {
      const v = String(a.value);
      if (!isHex(v)) throw new Error(`bytes attribute is not hex: ${v.slice(0, 20)}`);
      return hexToBytes(v as Hex);
    }
    default:
      throw new Error(`Unknown attribute type ${(a as { type: string }).type}`);
  }
}

/** The importer's contentHash covers every attribute except provenance. */
function recomputeHash(row: SnapshotRow): string {
  const v: Values = {};
  for (const [k, a] of Object.entries(row.attributes)) if (!PROVENANCE.has(k)) v[k] = toValue(a);
  return hashContent(v);
}

/** Row → the Planned upsert the importer uses (values include provenance). */
export function toPlanned(row: SnapshotRow): Planned {
  const values: Values = {};
  for (const [k, a] of Object.entries(row.attributes)) values[k] = toValue(a);
  return { rowKey: row.rowKey, contentHash: row.contentHash, values };
}

async function exportSchema(schema: Schema, where?: unknown): Promise<SnapshotRow[]> {
  const rows: SnapshotRow[] = [];
  let last: Hex | null = null;
  for (;;) {
    const cond = last
      ? where
        ? and(where as never, gt("$key", keyValue(last)))
        : gt("$key", keyValue(last))
      : where;
    let q = query(schema).ownedBy(account.address).orderBy(asc("$key")).limit(100);
    if (cond) q = q.where(cond);
    const page = (await q.fetch()) as unknown as { entities: Record<string, unknown>[] };
    for (const e of page.entities) {
      const attributes: Record<string, Attr> = {};
      for (const k of Object.keys(e).sort()) {
        if (k.startsWith("$")) continue;
        const a = e[k] as { type: Attr["type"]; value: unknown } | undefined;
        if (!a || a.value === undefined) continue; // optional attribute not set (e.g. a label without a note)
        attributes[k] = {
          type: a.type,
          value: typeof a.value === "bigint" ? a.value.toString() : (a.value as string | number),
        };
      }
      const rowKey = String(attributes.rowKey?.value ?? "");
      const contentHash = String(attributes.contentHash?.value ?? "");
      rows.push({ rowKey, contentHash, attributes });
    }
    if (page.entities.length < 100) break;
    last = (page.entities[page.entities.length - 1]?.$key as Hex | undefined) ?? null;
  }
  return rows.sort((a, b) => (a.rowKey < b.rowKey ? -1 : a.rowKey > b.rowKey ? 1 : 0));
}

/** Check every row's contentHash and provenance; throws on the first bad row. */
export function verifyRows(rows: SnapshotRow[], what: string): void {
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.rowKey) throw new Error(`${what}: a row has no rowKey`);
    if (seen.has(r.rowKey)) throw new Error(`${what}: duplicate rowKey ${r.rowKey}`);
    seen.add(r.rowKey);
    for (const p of PROVENANCE)
      if (!r.attributes[p]) throw new Error(`${what}: ${r.rowKey} is missing ${p}`);
    if (recomputeHash(r) !== r.contentHash)
      throw new Error(`${what}: ${r.rowKey} doesn't match its contentHash`);
  }
}

export async function exportDataset(dataset: DatasetId): Promise<SnapshotFile> {
  const { schema, schemaName } = DATASETS[dataset];
  const rows = await exportSchema(schema as never);
  const notices = await exportSchema(DatasetSchema as never, eq("dataset", dataset));
  verifyRows(rows, dataset);
  verifyRows(notices, `${dataset} notices`);
  const bySource = new Map<string, SnapshotFile["sources"][number]>();
  for (const r of rows) {
    const source = String(r.attributes.source?.value);
    const s = bySource.get(source) ?? {
      source,
      license: String(r.attributes.license?.value),
      sourceCommit: String(r.attributes.sourceCommit?.value),
      rows: 0,
    };
    s.rows++;
    bySource.set(source, s);
  }
  return {
    format: FORMAT,
    dataset,
    owner: account.address,
    rowsSchema: schemaName,
    noticesSchema: "selfnode-dataset",
    sources: [...bySource.values()].sort((a, b) => (a.source < b.source ? -1 : 1)),
    rowCount: rows.length,
    rows,
    notices,
  };
}

/** Canonical bytes: stable key order everywhere, no whitespace. */
export function serialize(s: SnapshotFile): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(s));
}

export function parseSnapshot(bytes: Uint8Array, dataset: DatasetId, owner: string): SnapshotFile {
  const s = JSON.parse(new TextDecoder().decode(bytes)) as SnapshotFile;
  if (s.format !== FORMAT) throw new Error(`Unknown snapshot format ${String(s.format)}`);
  if (s.dataset !== dataset) throw new Error(`Snapshot is for ${s.dataset}, not ${dataset}`);
  if (s.owner.toLowerCase() !== owner.toLowerCase())
    throw new Error(`Snapshot owner ${s.owner} isn't the mirror owner ${owner}`);
  if (s.rows.length !== s.rowCount) throw new Error("rowCount doesn't match the rows");
  verifyRows(s.rows, dataset);
  verifyRows(s.notices, `${dataset} notices`);
  return s;
}

export interface SnapshotEntity {
  dataset: DatasetId;
  swarmRef: string;
  sha256: string;
  rowCount: number;
  version: string;
  sourceCommit: string;
  createdAt: number;
  entityKey: Hex;
}

/** The current selfnode-snapshot entity for a dataset (owner-scoped), or null. */
export async function readSnapshotEntity(dataset: DatasetId): Promise<SnapshotEntity | null> {
  const r = (await query(SnapshotSchema)
    .where(and(eq("type", "snapshot"), eq("dataset", dataset)))
    .ownedBy(account.address)
    .limit(10)
    .fetch()) as unknown as { entities: Record<string, unknown>[] };
  const v = (e: Record<string, unknown>, k: string) =>
    (e[k] as { value: unknown } | undefined)?.value;
  const latest = r.entities
    .filter((e) => v(e, "rowKey") === `snapshot:${dataset}`)
    .sort((a, b) => Number(v(b, "createdAt")) - Number(v(a, "createdAt")))[0];
  if (!latest) return null;
  return {
    dataset,
    swarmRef: String(v(latest, "swarmRef")),
    sha256: String(v(latest, "sha256")),
    rowCount: Number(v(latest, "rowCount")),
    version: String(v(latest, "version")),
    sourceCommit: String(v(latest, "sourceCommit")),
    createdAt: Number(v(latest, "createdAt")),
    entityKey: latest.$key as Hex,
  };
}

/** The selfnode-snapshot entity to upsert (one per dataset, patched when the data changes). */
export function planSnapshotEntity(
  s: SnapshotFile,
  sha256: string,
  swarmRef: string,
  createdAt: number,
): Planned {
  const values: Values = {
    type: "snapshot",
    dataset: s.dataset,
    version: FORMAT,
    rowCount: u64(BigInt(s.rowCount)) as Values[string],
    sha256,
    swarmRef,
    createdAt: u64(BigInt(createdAt)) as Values[string],
  };
  const contentHash = hashContent(values);
  const commits = [...new Set(s.sources.map((x) => x.sourceCommit))].join(",");
  return {
    rowKey: `snapshot:${s.dataset}`,
    contentHash,
    values: {
      ...values,
      rowKey: `snapshot:${s.dataset}`,
      source: SNAPSHOT_SOURCE,
      license: [...new Set(s.sources.map((x) => x.license))].join(","),
      sourceCommit: commits,
      contentHash,
    },
  };
}
