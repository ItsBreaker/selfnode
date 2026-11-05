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
}

let dbp: Promise<IDBPDatabase<SelfnodeDB>> | null = null;
function db() {
  dbp ??= openDB<SelfnodeDB>("selfnode", 1, {
    upgrade(d) {
      d.createObjectStore("vault");
      d.createObjectStore("activity", { keyPath: "hash" }).createIndex("byCreated", "createdAt");
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
