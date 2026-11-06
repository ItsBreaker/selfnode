/**
 * Browsing the Arkiv mirror (the app's public Data page). Everything Arkiv can
 * filter on runs on Arkiv: tokens by symbol or address (prefix), labels by
 * address and category, function names by selector (prefix). Free-text search
 * on label names and function texts can't: those attributes aren't indexed
 * (`startsWith` on them silently matches nothing), so the planner asks Arkiv
 * for the whole (small) set once and filters on the device.
 *
 * Reads are always scoped to the mirror's owner.
 */
import { and, eq, startsWith, type Expression } from "@arkiv-network/sdk/query";
import { arkivConfig } from "../config/arkiv.js";

export type BrowseKind = "tokens" | "labels" | "sigs";
export type LabelCategory = "all" | "contract" | "flagged";

export interface BrowseQuery {
  kind: BrowseKind;
  text: string;
  /** Labels only. */
  category?: LabelCategory;
}

export interface BrowseRow {
  kind: BrowseKind;
  rowKey: string;
  entityKey: string;
  /** Tokens: "USDC"; labels: the name; sigs: the selector. */
  title: string;
  /** Tokens: the full name; sigs: the candidate texts. */
  subtitle?: string;
  chain?: string;
  address?: string;
  category?: string;
  note?: string;
  decimals?: number;
  rank?: number;
  texts?: string[];
  source: string;
  license: string;
  sourceCommit: string;
}

export interface BrowsePlan {
  /** Sent to Arkiv (with ownedBy the mirror). */
  where: Expression;
  /** Applied on the device when Arkiv can't filter on that attribute. */
  local: ((r: BrowseRow) => boolean) | null;
  /** What runs where, in plain words. */
  describe: string;
  /** A standalone snippet that runs the Arkiv part of this exact query. */
  code: string;
}

const SCHEMA_TYPE: Record<BrowseKind, string> = { tokens: "token", labels: "label", sigs: "sig" };
const FIELDS: Record<BrowseKind, string[]> = {
  tokens: ["symbol", "name", "chain", "address", "decimals"],
  labels: ["name", "category", "chain", "address", "note"],
  sigs: ["selector", "text", "rank"],
};
const ADDR = /^0x[0-9a-fA-F]{40}$/;
const HEXPREFIX = /^0x[0-9a-fA-F]{1,39}$/;

type Cond = { expr: Expression; code: string };
const c = {
  eq: (k: string, v: string): Cond => ({
    expr: eq(k, v),
    code: `eq(${JSON.stringify(k)}, ${JSON.stringify(v)})`,
  }),
  starts: (k: string, v: string): Cond => ({
    expr: startsWith(k, v),
    code: `startsWith(${JSON.stringify(k)}, ${JSON.stringify(v)})`,
  }),
};

export function planBrowse(q: BrowseQuery): BrowsePlan {
  const text = q.text.trim();
  const conds: Cond[] = [c.eq("type", SCHEMA_TYPE[q.kind])];
  let local: BrowsePlan["local"] = null;
  let describe = "";
  const lower = text.toLowerCase();

  const add = (cond: Cond, why: string) => {
    conds.push(cond);
    describe = why;
  };
  if (q.kind === "tokens") {
    if (ADDR.test(text)) add(c.eq("address", lower), "Exact address, on Arkiv.");
    else if (HEXPREFIX.test(text)) add(c.starts("address", lower), "Address prefix, on Arkiv.");
    else if (text)
      add(
        c.starts("symbol", text.toUpperCase()),
        "Symbol prefix (symbols are upper case), on Arkiv.",
      );
    else describe = "All tokens, on Arkiv.";
  } else if (q.kind === "labels") {
    const cat = q.category && q.category !== "all" ? q.category : null;
    if (cat) conds.push(c.eq("category", cat));
    if (ADDR.test(text)) add(c.eq("address", lower), "Exact address, on Arkiv.");
    else if (HEXPREFIX.test(text)) add(c.starts("address", lower), "Address prefix, on Arkiv.");
    else if (text) {
      local = (r) =>
        r.title.toLowerCase().includes(lower) || (r.note ?? "").toLowerCase().includes(lower);
      describe =
        "Names aren't an indexed attribute, so Arkiv returns the labels (filtered by category) and the name search runs on this device.";
    } else describe = `All labels${cat ? ` (${cat})` : ""}, on Arkiv.`;
  } else {
    if (/^0x[0-9a-fA-F]{8}$/.test(text)) add(c.eq("selector", lower), "Exact selector, on Arkiv.");
    else if (/^0x[0-9a-fA-F]{1,7}$/.test(text))
      add(c.starts("selector", lower), "Selector prefix, on Arkiv.");
    else if (text) {
      local = (r) => (r.texts ?? []).some((t) => t.toLowerCase().includes(lower));
      describe =
        "Function texts are stored as bytes, which Arkiv can't search, so Arkiv returns all of them and the text search runs on this device.";
    } else describe = "All function names, on Arkiv.";
  }

  const where = conds.length === 1 ? (conds[0] as Cond).expr : and(...conds.map((x) => x.expr));
  const whereCode =
    conds.length === 1 ? (conds[0] as Cond).code : `and(${conds.map((x) => x.code).join(", ")})`;
  const imports = ["and", "eq", "startsWith"].filter((f) => whereCode.includes(`${f}(`));
  const code = `import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { ${[...imports, "asc"].join(", ")} } from "@arkiv-network/sdk/query";
import { http } from "viem";

const arkiv = createPublicClient({ chain: rabdi({ accessKey: "" }), transport: http() });
const { entities } = await arkiv
  .select({ ${[...FIELDS[q.kind], "source", "license", "sourceCommit"].map((f) => `${f}: true`).join(", ")} })
  .where(${whereCode})
  .ownedBy("${arkivConfig.mirrorOwner}") // always: Arkiv is public
  .orderBy(asc("$key"))
  .limit(25)
  .fetch();${local ? "\n// …then filter by text locally (that attribute isn't indexed on Arkiv)." : ""}`;
  return { where, local, describe, code };
}

type V = { value?: unknown } | undefined;
const s = (v: V) => (v?.value === undefined ? "" : String(v.value));
const bytesText = (v: V) => {
  const x = s(v);
  if (!/^0x([0-9a-fA-F]{2})*$/.test(x)) return x;
  const b = new Uint8Array((x.length - 2) / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(x.slice(2 + i * 2, 4 + i * 2), 16);
  return new TextDecoder().decode(b);
};

/** An Arkiv entity (as returned with a schema: attributes as `{ value }`) → a display row. */
export function toBrowseRow(kind: BrowseKind, e: Record<string, unknown>): BrowseRow {
  const a = e as Record<string, V>;
  const base = {
    kind,
    rowKey: s(a.rowKey),
    entityKey: String(e.$key ?? ""),
    source: s(a.source),
    license: s(a.license),
    sourceCommit: s(a.sourceCommit),
  };
  if (kind === "tokens")
    return {
      ...base,
      title: s(a.symbol),
      subtitle: s(a.name),
      chain: s(a.chain),
      address: s(a.address),
      decimals: Number(s(a.decimals)),
    };
  if (kind === "labels") {
    const note = bytesText(a.note);
    return {
      ...base,
      title: s(a.name),
      chain: s(a.chain),
      address: s(a.address),
      category: s(a.category),
      ...(note ? { note } : {}),
    };
  }
  const texts = bytesText(a.text).split(";").filter(Boolean);
  return {
    ...base,
    title: s(a.selector),
    subtitle: texts.join(" · "),
    texts,
    rank: Number(s(a.rank)),
  };
}
