/**
 * Local persistence (IndexedDB). Holds the ENCRYPTED vault (never plaintext
 * keys) and a log of transactions sent from this device.
 */
import type { ChainKey, VaultBlob } from "@selfnode/core";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Address, Hex } from "viem";

export interface ActivityItem {
  hash: Hex;
  chain: ChainKey;
  from: Address;
  to: Address;
  /** Human summary, e.g. "0.01 ETH". */
  amount: string;
  status: "pending" | "confirmed" | "failed";
  createdAt: number;
  blockNumber?: string;
}

interface SelfnodeDB extends DBSchema {
  vault: { key: "primary"; value: VaultBlob };
  activity: { key: Hex; value: ActivityItem; indexes: { byCreated: number } };
  /** Arkiv mirror lookups (labels, signatures), including "not found", with fetch time. */
  labels: { key: string; value: { value: unknown; at: number } };
}

let dbp: Promise<IDBPDatabase<SelfnodeDB>> | null = null;
function db() {
  dbp ??= openDB<SelfnodeDB>("selfnode", 2, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        d.createObjectStore("vault");
        d.createObjectStore("activity", { keyPath: "hash" }).createIndex("byCreated", "createdAt");
      }
      if (oldVersion < 2) d.createObjectStore("labels");
    },
  });
  return dbp;
}

export const vaultStore = {
  get: async () => (await db()).get("vault", "primary"),
  put: async (blob: VaultBlob) => void (await db()).put("vault", blob, "primary"),
  clear: async () => void (await db()).delete("vault", "primary"),
};

export const activityStore = {
  list: async (): Promise<ActivityItem[]> =>
    (await (await db()).getAllFromIndex("activity", "byCreated")).reverse(),
  put: async (item: ActivityItem) => void (await db()).put("activity", item),
  clear: async () => void (await db()).clear("activity"),
};

/** IndexedDB-backed cache for the Arkiv mirror reader, so labels work offline. */
export const labelCache = {
  get: async (key: string) => (await db()).get("labels", key),
  put: async (key: string, value: unknown, at: number) =>
    void (await db()).put("labels", { value, at }, key),
};
