/**
 * Local persistence (IndexedDB). Holds the ENCRYPTED vault (never plaintext
 * keys) and a log of transactions sent from this device.
 */
import type { ChainKey, VaultBlob } from "@selfnode/core";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { desktop } from "../desktop";
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
  /** Encrypted vaults by id ("primary" for the first one, so existing data is untouched). */
  vault: { key: string; value: VaultBlob };
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

/**
 * The vault is already password-encrypted (scrypt + AES-GCM). In the desktop
 * app it's additionally wrapped with the OS keychain (Electron safeStorage),
 * so a copied browser profile alone isn't enough to attack it offline.
 */
interface WrappedVault {
  wrapped: string;
}
const isWrapped = (v: unknown): v is WrappedVault =>
  typeof v === "object" && v !== null && "wrapped" in v;

/** The original single vault's key; new vaults get their own ids. */
export const PRIMARY_VAULT = "primary";

export const vaultStore = {
  get: async (id: string = PRIMARY_VAULT): Promise<VaultBlob | undefined> => {
    const v = (await (await db()).get("vault", id)) as VaultBlob | WrappedVault | undefined;
    if (!v) return undefined;
    if (!isWrapped(v)) return v;
    if (!desktop)
      throw new Error(
        "This wallet was created in the desktop app and is protected by its OS keychain",
      );
    return JSON.parse(await desktop.vault.unwrap(v.wrapped)) as VaultBlob;
  },
  put: async (blob: VaultBlob, id: string = PRIMARY_VAULT) => {
    const value =
      desktop && (await desktop.vault.available())
        ? { wrapped: await desktop.vault.wrap(JSON.stringify(blob)) }
        : blob;
    await (await db()).put("vault", value as VaultBlob, id);
  },
  remove: async (id: string) => void (await db()).delete("vault", id),
  ids: async (): Promise<string[]> => (await (await db()).getAllKeys("vault")).map(String),
  clear: async () => void (await db()).clear("vault"),
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
