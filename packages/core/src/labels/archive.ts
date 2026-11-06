/**
 * The Swarm archive: Selfnode's dataset snapshots (tokens, labels, function
 * names), loaded in one go from a Swarm gateway instead of queried row by row
 * from Arkiv. Opt-in only: the gateway sees the reader's IP address, and
 * Anon-RPC can't carry plain HTTP downloads.
 *
 * Trust: a file is used only if its SHA-256 matches the one recorded on Arkiv
 * (the owner-scoped `selfnode-snapshot` entity, read through Anon-RPC) or, if
 * Arkiv is unreachable, the one pinned in this build. Format, dataset and owner
 * are checked too. See /arkiv/swarm.md.
 */
import { hexToString, isHex } from "viem";
import { arkivConfig } from "../config/arkiv.js";
import type { MirrorLabel, MirrorSig } from "./reader.js";

export const ARCHIVE_GATEWAY = "https://bzz.limo";
export const ARCHIVE_FORMAT = "selfnode-arkiv-snapshot/1";
export type ArchiveDataset = "tokens" | "labels" | "sigs";
export const ARCHIVE_DATASETS: readonly ArchiveDataset[] = ["tokens", "labels", "sigs"];

export interface SnapshotPointer {
  dataset: ArchiveDataset;
  swarmRef: string;
  sha256: string;
  rowCount: number;
}

/** The snapshots as of this build (2026-11-06), used only if Arkiv can't be reached. */
export const PINNED_SNAPSHOTS: readonly SnapshotPointer[] = [
  {
    dataset: "tokens",
    swarmRef: "a287f7361bf3091782ddfc1bea22575ca4d8e4cfe631665f524ab037018ff00d",
    sha256: "57fbbbef550351587f0fe2fadc8810ed22f81def5d04e0cb8e88e52dc791813c",
    rowCount: 2105,
  },
  {
    dataset: "labels",
    swarmRef: "6f24208ce8ae294cb6179ea5c2565c5a06ad2621b140d32cb1476483305a6e89",
    sha256: "0e4f3caf50d22214bf59a8b14b9b5f370bb9812c57af853be430f293ad38bdd0",
    rowCount: 796,
  },
  {
    dataset: "sigs",
    swarmRef: "b23b5b239161ba4f21ffaae70e8c52eb39f6db7d3055ee5d9ef175b738a6425e",
    sha256: "9d793d1780e0c7aad996864450e0a1dda5ba7d7f7bdb8ffe3f6beb0123495382",
    rowCount: 444,
  },
];

type Attr = { type: string; value: string | number };
interface SnapshotFile {
  format: string;
  dataset: string;
  owner: string;
  rowCount: number;
  rows: { rowKey: string; attributes: Record<string, Attr> }[];
}

const hex = async (b: Uint8Array) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", b as Uint8Array<ArrayBuffer>))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");

const str = (a: Attr | undefined) => (a === undefined ? "" : String(a.value));
const text = (a: Attr | undefined) => {
  const v = str(a);
  return a?.type === "bytes" && isHex(v) ? hexToString(v) : v;
};
const prov = (a: Record<string, Attr>) => ({
  source: str(a.source),
  license: str(a.license),
  sourceCommit: str(a.sourceCommit),
});

export class ArchiveError extends Error {
  override readonly name = "ArchiveError";
}

/** Parse one verified snapshot file, checking it's ours and for the dataset we asked for. */
export function parseSnapshot(bytes: Uint8Array, p: SnapshotPointer): SnapshotFile {
  const s = JSON.parse(new TextDecoder().decode(bytes)) as SnapshotFile;
  if (s.format !== ARCHIVE_FORMAT) throw new ArchiveError(`Unknown snapshot format ${s.format}`);
  if (s.dataset !== p.dataset) throw new ArchiveError(`Snapshot is for ${s.dataset}`);
  if (s.owner.toLowerCase() !== arkivConfig.mirrorOwner.toLowerCase())
    throw new ArchiveError("Snapshot isn't from Selfnode's mirror");
  if (s.rows.length !== s.rowCount || s.rowCount !== p.rowCount)
    throw new ArchiveError("Snapshot row count doesn't match its Arkiv record");
  return s;
}

/** In-memory lookups over the loaded snapshots, with the Arkiv reader's precedence rules. */
export class ArchiveIndex {
  readonly #labels = new Map<string, MirrorLabel>();
  readonly #sigs = new Map<string, MirrorSig>();
  readonly counts: Record<ArchiveDataset, number> = { tokens: 0, labels: 0, sigs: 0 };

  constructor(files: SnapshotFile[]) {
    const byDataset = (d: string) => files.find((f) => f.dataset === d)?.rows ?? [];
    // Tokens first, then labels: flagged beats contract beats token (as in MirrorReader).
    for (const { attributes: a } of byDataset("tokens")) {
      this.#labels.set(`${str(a.chain)}:${str(a.address).toLowerCase()}`, {
        name: `${str(a.name)} (${str(a.symbol)})`,
        category: "token",
        symbol: str(a.symbol),
        decimals: Number(a.decimals?.value),
        ...prov(a),
      });
      this.counts.tokens++;
    }
    for (const { attributes: a } of byDataset("labels")) {
      const k = `${str(a.chain)}:${str(a.address).toLowerCase()}`;
      const category = str(a.category) as MirrorLabel["category"];
      const prev = this.#labels.get(k);
      this.counts.labels++;
      if (prev && prev.category === "token" && category !== "flagged") continue;
      const label: MirrorLabel = { name: str(a.name), category, ...prov(a) };
      const note = text(a.note);
      if (note) label.note = note;
      this.#labels.set(k, label);
    }
    for (const { attributes: a } of byDataset("sigs")) {
      const selector = str(a.selector).toLowerCase();
      this.#sigs.set(selector, {
        selector,
        texts: text(a.text).split(";").filter(Boolean),
        ...prov(a),
      });
      this.counts.sigs++;
    }
  }

  label(chainId: number, address: string): MirrorLabel | null {
    return this.#labels.get(`${chainId}:${address.toLowerCase()}`) ?? null;
  }
  signature(selector: string): MirrorSig | null {
    return this.#sigs.get(selector.toLowerCase()) ?? null;
  }
}

export interface LoadedArchive {
  index: ArchiveIndex;
  /** Where the expected hashes came from. */
  pointers: "arkiv" | "pinned";
  /** Why Arkiv's snapshot entities couldn't be used, when `pointers` is "pinned". */
  pointerError?: string;
  bytes: number;
  snapshots: SnapshotPointer[];
}

/**
 * Download and verify every snapshot. `pointersFromArkiv` reads the snapshot
 * entities (through Anon-RPC); if it fails, the pinned pointers are used.
 * `fetchFn` is a plain, direct fetch: the caller must have the user's consent.
 */
export async function loadArchive(opts: {
  fetchFn: typeof fetch;
  pointersFromArkiv: () => Promise<SnapshotPointer[]>;
  gateway?: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<LoadedArchive> {
  let pointers: SnapshotPointer[];
  let from: LoadedArchive["pointers"] = "arkiv";
  let pointerError: string | undefined;
  try {
    pointers = await opts.pointersFromArkiv();
    const missing = ARCHIVE_DATASETS.filter((d) => !pointers.find((p) => p.dataset === d));
    if (missing.length) throw new Error(`no snapshot entity for ${missing.join(", ")}`);
  } catch (e) {
    pointers = [...PINNED_SNAPSHOTS];
    from = "pinned";
    pointerError = (e instanceof Error ? e.message : String(e)).split("\n")[0];
  }
  const gateway = opts.gateway ?? ARCHIVE_GATEWAY;
  const files: SnapshotFile[] = [];
  let bytes = 0;
  for (const [i, p] of pointers.entries()) {
    if (!/^[0-9a-f]{64}$/.test(p.swarmRef))
      throw new ArchiveError(`Bad Swarm reference for ${p.dataset}`);
    opts.onProgress?.(i, pointers.length);
    const res = await opts.fetchFn(`${gateway}/bzz/${p.swarmRef}/`);
    if (!res.ok) throw new ArchiveError(`The gateway returned HTTP ${res.status} for ${p.dataset}`);
    const b = new Uint8Array(await res.arrayBuffer());
    if ((await hex(b)) !== p.sha256)
      throw new ArchiveError(
        `The ${p.dataset} snapshot doesn't match the SHA-256 recorded ${from === "arkiv" ? "on Arkiv" : "in this build"}; not using it`,
      );
    files.push(parseSnapshot(b, p));
    bytes += b.length;
  }
  opts.onProgress?.(pointers.length, pointers.length);
  return {
    index: new ArchiveIndex(files),
    pointers: from,
    ...(pointerError ? { pointerError } : {}),
    bytes,
    snapshots: pointers,
  };
}
