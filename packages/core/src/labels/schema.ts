/**
 * Arkiv entity schemas, shared by the mirror script (writes) and the app
 * (reads). Documented in /arkiv/schema.md. Every entity carries provenance:
 * `source` (repo), `license`, `sourceCommit` (exact commit imported from) and
 * `contentHash` (so re-runs can skip unchanged rows).
 *
 * Reads are ALWAYS scoped by owner (our mirror wallet), because the Arkiv
 * store is public and anyone can write entities that look like ours.
 */
import { bytes, defineSchema, i32, str, u64 } from "@arkiv-network/sdk/schema";

const provenance = {
  /** Deterministic upsert key, e.g. "label:1:0xabc…". (`key` is reserved by Arkiv.) */
  rowKey: str().indexed(),
  source: str().indexed(),
  license: str(),
  sourceCommit: str(),
  contentHash: str(),
};

export const LabelSchema = defineSchema("selfnode-label", {
  type: str().indexed(), // "label"
  chain: str().indexed(), // chain ID as a string, e.g. "1"
  address: str().indexed(), // lowercase
  name: str(),
  /** "contract" | "flagged" | "token" */
  category: str().indexed(),
  /** Free-text detail from the source (e.g. the darklist comment), UTF-8. `str` caps at 128 bytes. */
  note: bytes().optional(),
  ...provenance,
});

export const SigSchema = defineSchema("selfnode-sig", {
  type: str().indexed(), // "sig"
  selector: str().indexed(), // "0xa9059cbb"
  /** Candidate text signatures, ";"-separated (4-byte collisions exist), UTF-8. */
  text: bytes(),
  /** 1 = most used in our mainnet sample; standards rank first. */
  rank: i32().indexed(),
  ...provenance,
});

export const TokenSchema = defineSchema("selfnode-token", {
  type: str().indexed(), // "token"
  chain: str().indexed(),
  address: str().indexed(), // lowercase
  symbol: str().indexed(),
  name: str(),
  decimals: i32(),
  ...provenance,
});

/** One per source: the licence notice travels with the data, on Arkiv itself. */
export const DatasetSchema = defineSchema("selfnode-dataset", {
  type: str().indexed(), // "dataset"
  dataset: str().indexed(), // "labels" | "tokens" | "sigs"
  copyright: str(),
  licenseText: bytes(), // UTF-8; too long for a 128-byte str
  url: str(),
  rowCount: u64(),
  ...provenance,
});

export const SnapshotSchema = defineSchema("selfnode-snapshot", {
  type: str().indexed(), // "snapshot"
  dataset: str().indexed(),
  version: str(),
  rowCount: u64(),
  sha256: str(),
  swarmRef: str().optional(),
  createdAt: u64(),
  ...provenance,
});

export const labelKey = (chainId: number, address: string) =>
  `label:${chainId}:${address.toLowerCase()}`;
export const sigKey = (selector: string) => `sig:${selector.toLowerCase()}`;
export const tokenKey = (chainId: number, address: string) =>
  `token:${chainId}:${address.toLowerCase()}`;
