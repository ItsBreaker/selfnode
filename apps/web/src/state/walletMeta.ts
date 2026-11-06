/**
 * Which wallets (accounts) exist, their names and which is active. Not secret:
 * addresses and names only; the keys stay in the encrypted vaults (IndexedDB).
 * One vault (a recovery phrase or a private key) can back several accounts:
 * account `index` n of a phrase is derived at m/44'/60'/0'/0/n.
 */
import type { Address } from "viem";

export interface WalletAccount {
  id: string;
  name: string;
  /** IndexedDB key of the encrypted vault. */
  vaultId: string;
  /** Derivation index within a recovery phrase (always 0 for a private key). */
  index: number;
  address: Address;
}

export interface WalletMeta {
  v: 1;
  accounts: WalletAccount[];
  active: string | null;
}

export const META_KEY = "selfnode:wallets";
export const emptyMeta = (): WalletMeta => ({ v: 1, accounts: [], active: null });

const isAccount = (a: unknown): a is WalletAccount => {
  const x = a as Partial<WalletAccount> | null;
  return (
    !!x &&
    typeof x.id === "string" &&
    typeof x.name === "string" &&
    typeof x.vaultId === "string" &&
    Number.isInteger(x.index) &&
    (x.index as number) >= 0 &&
    typeof x.address === "string" &&
    /^0x[0-9a-fA-F]{40}$/.test(x.address)
  );
};

/**
 * Parse stored metadata, or build it from the pre-multi-wallet single vault
 * ("primary"), so an existing wallet becomes "Wallet 1" with no data lost.
 * `vaults` are the vault ids that actually exist (accounts without one are dropped).
 */
export function migrateWalletMeta(
  stored: unknown,
  primary: { address: Address } | null,
  vaults: readonly string[],
): WalletMeta {
  const raw = stored as Partial<WalletMeta> | null;
  if (raw && raw.v === 1 && Array.isArray(raw.accounts)) {
    const seen = new Set<string>();
    const accounts = raw.accounts.filter(
      (a): a is WalletAccount =>
        isAccount(a) && vaults.includes(a.vaultId) && !seen.has(a.id) && !!seen.add(a.id),
    );
    // A vault with no account (e.g. metadata lost) still gets one, so nothing is hidden.
    for (const v of vaults)
      if (!accounts.some((a) => a.vaultId === v) && v === "primary" && primary)
        accounts.unshift({
          id: "primary-0",
          name: "Wallet 1",
          vaultId: v,
          index: 0,
          address: primary.address,
        });
    const active = accounts.some((a) => a.id === raw.active)
      ? (raw.active as string)
      : (accounts[0]?.id ?? null);
    return { v: 1, accounts, active };
  }
  if (primary && vaults.includes("primary")) {
    return {
      v: 1,
      accounts: [
        {
          id: "primary-0",
          name: "Wallet 1",
          vaultId: "primary",
          index: 0,
          address: primary.address,
        },
      ],
      active: "primary-0",
    };
  }
  return emptyMeta();
}

/** "Wallet 2", "Wallet 3", … the first free name. */
export function nextName(accounts: WalletAccount[], base = "Wallet"): string {
  for (let i = accounts.length + 1; ; i++)
    if (!accounts.some((a) => a.name === `${base} ${i}`)) return `${base} ${i}`;
}

export const loadStoredMeta = (): unknown => {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? "null");
  } catch {
    return null;
  }
};
export const saveMeta = (m: WalletMeta) => localStorage.setItem(META_KEY, JSON.stringify(m));
