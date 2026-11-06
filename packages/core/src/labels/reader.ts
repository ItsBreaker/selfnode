/**
 * Reads Selfnode's Arkiv mirror: address labels (including MyEtherWallet's
 * scam list), token metadata and function signatures.
 * - Always scoped by owner (the mirror wallet); anyone can write to Arkiv.
 * - Keyless (public endpoint); requests go through the given fetch, which the
 *   app wires to Anon-RPC.
 * - Lookups made in the same tick are batched into one query per kind.
 * - Results (including "nothing found") are cached for `ttlMs`.
 */
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { and, asc, eq, gt, or } from "@arkiv-network/sdk/query";
import { key as keyValue } from "@arkiv-network/sdk/schema";
import { hexToString, http, isHex, type Address } from "viem";
import type { SnapshotPointer } from "./archive.js";
import { planBrowse, toBrowseRow, type BrowseQuery, type BrowseRow } from "./browse.js";
import { LabelSchema, SigSchema, SnapshotSchema, TokenSchema } from "./schema.js";

export interface MirrorProvenance {
  source: string;
  license: string;
  sourceCommit: string;
  /** Set when the answer came from the Swarm archive (opt-in) rather than a live Arkiv query. */
  via?: "swarm";
}
export interface MirrorLabel extends MirrorProvenance {
  name: string;
  category: "contract" | "flagged" | "token";
  note?: string;
  /** For tokens. */
  symbol?: string;
  decimals?: number;
}
export interface MirrorSig extends MirrorProvenance {
  selector: string;
  texts: string[];
}

export interface LabelCache {
  get(key: string): Promise<{ value: unknown; at: number } | undefined>;
  put(key: string, value: unknown, at: number): Promise<void>;
}

const memoryCache = (): LabelCache => {
  const m = new Map<string, { value: unknown; at: number }>();
  return { get: async (k) => m.get(k), put: async (k, value, at) => void m.set(k, { value, at }) };
};

export const sourceUrl = (p: MirrorProvenance) =>
  `https://github.com/${p.source}/tree/${p.sourceCommit}`;

const CHUNK = 25;
/** `bytes` columns come back as hex; decode UTF-8 text. */
const text = (v: { value: unknown } | undefined): string => {
  const x = v?.value;
  if (typeof x === "string") return isHex(x) ? hexToString(x) : x;
  if (x instanceof Uint8Array) return new TextDecoder().decode(x);
  return "";
};
type V = { value: string | number };

/** One chain object per page, so the SDK's "no access key" notice is logged once, not per reader. */
let rabdiChain: ReturnType<typeof rabdi> | null = null;
const keylessRabdi = () => (rabdiChain ??= rabdi({ accessKey: "" }));

const BROWSE_SCHEMA = { tokens: TokenSchema, labels: LabelSchema, sigs: SigSchema } as const;

export class MirrorReader {
  readonly #client;
  readonly #owner: Address;
  readonly #cache: LabelCache;
  readonly #ttl: number;
  readonly #onAvailability: ((ok: boolean, error?: string) => void) | undefined;
  #pending = new Map<
    string,
    {
      kind: "addr" | "sig";
      chain?: number;
      id: string;
      resolve: (v: unknown) => void;
      reject: (e: unknown) => void;
    }[]
  >();
  #scheduled = false;

  constructor(opts: {
    owner: Address;
    fetchFn?: typeof fetch;
    cache?: LabelCache;
    ttlMs?: number;
    /** Told whether Arkiv answered the last batch of lookups (e.g. for a "labels unavailable" notice). */
    onAvailability?: (ok: boolean, error?: string) => void;
  }) {
    this.#onAvailability = opts.onAvailability;
    this.#owner = opts.owner;
    this.#cache = opts.cache ?? memoryCache();
    this.#ttl = opts.ttlMs ?? 24 * 3600_000;
    this.#client = createPublicClient({
      chain: keylessRabdi(),
      transport: http(undefined, {
        ...(opts.fetchFn ? { fetchFn: opts.fetchFn } : {}),
        timeout: 45_000,
        retryCount: 1,
      }),
    });
  }

  /** Label for an address on a chain, or null. Flagged beats contract beats token. */
  label(chainId: number, address: string): Promise<MirrorLabel | null> {
    return this.#lookup<MirrorLabel | null>(
      "addr",
      `addr:${chainId}:${address.toLowerCase()}`,
      chainId,
    );
  }

  /**
   * One page of the mirror for the Data page (Arkiv-side filters only), with
   * the total number of matches. `cursor` is the last row's entity key.
   */
  async browsePage(
    q: BrowseQuery,
    cursor: string | null,
    limit = 25,
  ): Promise<{ rows: BrowseRow[]; next: string | null; total: number }> {
    const plan = planBrowse(q);
    const schema = BROWSE_SCHEMA[q.kind];
    const where = cursor
      ? and(plan.where, gt("$key", keyValue(cursor as `0x${string}`)))
      : plan.where;
    const [res, total] = await Promise.all([
      this.#client
        .select()
        .from(schema)
        .where(where as never)
        .ownedBy(this.#owner)
        .orderBy(asc("$key"))
        .limit(limit)
        .fetch(),
      cursor
        ? Promise.resolve(null)
        : this.#client
            .count()
            .where(plan.where as never)
            .ownedBy(this.#owner)
            .fetch(),
    ]);
    const entities = res.entities as unknown as Record<string, unknown>[];
    const rows = entities.map((e) => toBrowseRow(q.kind, e));
    const last = entities[entities.length - 1];
    return {
      rows,
      next: entities.length === limit && last ? String(last.$key) : null,
      total: total === null ? -1 : Number(total),
    };
  }

  /** Every row matching the Arkiv-side filter (for searches Arkiv can't do), 100 per request. */
  async browseAll(q: BrowseQuery, onProgress?: (loaded: number) => void): Promise<BrowseRow[]> {
    const out: BrowseRow[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 50; i++) {
      const page = await this.browsePage({ ...q, text: "" }, cursor, 100);
      out.push(...page.rows);
      onProgress?.(out.length);
      if (!page.next) break;
      cursor = page.next;
    }
    return out;
  }

  /** The current Swarm snapshot pointers (one `selfnode-snapshot` entity per dataset). */
  async snapshots(): Promise<SnapshotPointer[]> {
    const res = await this.#client
      .select()
      .from(SnapshotSchema)
      .where(eq("type", "snapshot") as never)
      .ownedBy(this.#owner)
      .limit(20)
      .fetch();
    const latest = new Map<string, { p: SnapshotPointer; at: number }>();
    for (const e of res.entities as unknown as {
      dataset: V;
      rowKey: V;
      swarmRef?: V;
      sha256: V;
      rowCount: V;
      createdAt: V;
    }[]) {
      const dataset = String(e.dataset.value) as SnapshotPointer["dataset"];
      if (String(e.rowKey.value) !== `snapshot:${dataset}` || !e.swarmRef) continue;
      const at = Number(e.createdAt.value);
      if ((latest.get(dataset)?.at ?? -1) >= at) continue;
      latest.set(dataset, {
        at,
        p: {
          dataset,
          swarmRef: String(e.swarmRef.value),
          sha256: String(e.sha256.value),
          rowCount: Number(e.rowCount.value),
        },
      });
    }
    return [...latest.values()].map((x) => x.p);
  }

  /** Candidate texts for a 4-byte selector, or null. */
  signature(selector: string): Promise<MirrorSig | null> {
    return this.#lookup<MirrorSig | null>("sig", `sig:${selector.toLowerCase()}`);
  }

  async #lookup<T>(kind: "addr" | "sig", cacheKey: string, chain?: number): Promise<T> {
    const hit = await this.#cache.get(cacheKey);
    if (hit && Date.now() - hit.at < this.#ttl) return hit.value as T;
    try {
      return await this.#queue<T>(kind, cacheKey, chain);
    } catch (e) {
      // Arkiv unavailable (e.g. the public endpoint rate-limiting): an expired
      // cached answer beats none.
      if (hit) return hit.value as T;
      throw e;
    }
  }

  #queue<T>(kind: "addr" | "sig", cacheKey: string, chain?: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const list = this.#pending.get(cacheKey) ?? [];
      list.push({
        kind,
        ...(chain !== undefined ? { chain } : {}),
        id: cacheKey.split(":").pop() as string,
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      this.#pending.set(cacheKey, list);
      if (!this.#scheduled) {
        this.#scheduled = true;
        setTimeout(() => void this.#flush(), 20);
      }
    });
  }

  async #flush(): Promise<void> {
    this.#scheduled = false;
    const pending = this.#pending;
    this.#pending = new Map();
    const addrByChain = new Map<number, string[]>();
    const sigs: string[] = [];
    for (const [, waiters] of pending) {
      const w = waiters[0];
      if (!w) continue;
      if (w.kind === "sig") sigs.push(w.id);
      else
        addrByChain.set(w.chain as number, [...(addrByChain.get(w.chain as number) ?? []), w.id]);
    }
    const results = new Map<string, unknown>();
    try {
      // All chunks in parallel: through an anonymity network each round trip is ~1-2 s.
      const jobs: Promise<void>[] = [];
      for (const [chain, addrs] of addrByChain) {
        for (let i = 0; i < addrs.length; i += CHUNK) {
          const chunk = addrs.slice(i, i + CHUNK);
          jobs.push(
            this.#queryAddresses(chain, chunk).then((found) => {
              for (const a of chunk) results.set(`addr:${chain}:${a}`, found.get(a) ?? null);
            }),
          );
        }
      }
      for (let i = 0; i < sigs.length; i += CHUNK) {
        const chunk = sigs.slice(i, i + CHUNK);
        jobs.push(
          this.#querySigs(chunk).then((found) => {
            for (const sel of chunk) results.set(`sig:${sel}`, found.get(sel) ?? null);
          }),
        );
      }
      await Promise.all(jobs);
    } catch (e) {
      this.#onAvailability?.(
        false,
        e instanceof Error ? (e.message.split("\n")[0] ?? e.message) : String(e),
      );
      for (const [, waiters] of pending) for (const w of waiters) w.reject(e);
      return;
    }
    this.#onAvailability?.(true);
    const now = Date.now();
    for (const [key, waiters] of pending) {
      const v = results.get(key) ?? null;
      void this.#cache.put(key, v, now);
      for (const w of waiters) w.resolve(v);
    }
  }

  async #queryAddresses(chain: number, addrs: string[]): Promise<Map<string, MirrorLabel>> {
    const where = and(eq("chain", String(chain)), or(addrs.map((a) => eq("address", a))));
    const [labels, tokens] = await Promise.all([
      this.#client
        .select()
        .from(LabelSchema)
        .where(where as never)
        .ownedBy(this.#owner)
        .limit(100)
        .fetch(),
      this.#client
        .select()
        .from(TokenSchema)
        .where(where as never)
        .ownedBy(this.#owner)
        .limit(100)
        .fetch(),
    ]);
    const out = new Map<string, MirrorLabel>();
    const prov = (e: { source: V; license: V; sourceCommit: V }) => ({
      source: String(e.source.value),
      license: String(e.license.value),
      sourceCommit: String(e.sourceCommit.value),
    });
    for (const t of tokens.entities as unknown as {
      address: V;
      name: V;
      symbol: V;
      decimals: V;
      source: V;
      license: V;
      sourceCommit: V;
    }[]) {
      out.set(String(t.address.value), {
        name: `${t.name.value} (${t.symbol.value})`,
        category: "token",
        symbol: String(t.symbol.value),
        decimals: Number(t.decimals.value),
        ...prov(t),
      });
    }
    for (const l of labels.entities as unknown as {
      address: V;
      name: V;
      category: V;
      note?: V;
      source: V;
      license: V;
      sourceCommit: V;
    }[]) {
      const prev = out.get(String(l.address.value));
      const category = String(l.category.value) as MirrorLabel["category"];
      if (prev && prev.category === "token" && category !== "flagged") continue; // keep token metadata unless flagged
      const label: MirrorLabel = { name: String(l.name.value), category, ...prov(l) };
      const note = text(l.note);
      if (note) label.note = note;
      out.set(String(l.address.value), label);
    }
    return out;
  }

  async #querySigs(selectors: string[]): Promise<Map<string, MirrorSig>> {
    const res = await this.#client
      .select()
      .from(SigSchema)
      .where(or(selectors.map((s) => eq("selector", s))) as never)
      .ownedBy(this.#owner)
      .limit(100)
      .fetch();
    const out = new Map<string, MirrorSig>();
    for (const s of res.entities as unknown as {
      selector: V;
      text: V;
      source: V;
      license: V;
      sourceCommit: V;
    }[]) {
      out.set(String(s.selector.value), {
        selector: String(s.selector.value),
        texts: text(s.text).split(";").filter(Boolean),
        source: String(s.source.value),
        license: String(s.license.value),
        sourceCommit: String(s.sourceCommit.value),
      });
    }
    return out;
  }
}
