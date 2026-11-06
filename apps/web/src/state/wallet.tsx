/**
 * Wallet state: several wallets (accounts), one active. Each account belongs to
 * an encrypted vault (a recovery phrase or a private key); a phrase vault can
 * back several accounts (derivation index 0, 1, …). The active account is
 * none → locked → unlocked; its decrypted key lives only in a WalletSession,
 * which is zeroed on lock (manual, on inactivity, on switching wallets, or on
 * removal). Unlocking always needs that vault's password.
 */
import type { Secret, VaultBlob, WalletSession } from "@selfnode/core";

/** scrypt, BIP-39 and friends load only when a wallet is created or unlocked. */
const walletLib = () => import("@selfnode/core/wallet/index");
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getAddress, type Address } from "viem";
import { activityStore, PRIMARY_VAULT, vaultStore } from "../storage/db";
import {
  emptyMeta,
  loadStoredMeta,
  migrateWalletMeta,
  nextName,
  saveMeta,
  type WalletAccount,
  type WalletMeta,
} from "./walletMeta";

export type { WalletAccount } from "./walletMeta";
export type WalletStatus = "loading" | "none" | "locked" | "unlocked";
const AUTOLOCK_KEY = "selfnode:autolock-minutes";
export const AUTOLOCK_OPTIONS = [1, 5, 10, 30] as const;

interface WalletCtx {
  status: WalletStatus;
  /** The active account. */
  active: WalletAccount | null;
  accounts: WalletAccount[];
  address: Address | null;
  kind: VaultBlob["kind"] | null;
  session: WalletSession | null;
  /** A new vault (phrase or key) as a new wallet, made active and unlocked. */
  create: (
    secret: Secret,
    password: string,
    onProgress?: (f: number) => void,
    name?: string,
  ) => Promise<void>;
  unlock: (password: string, onProgress?: (f: number) => void) => Promise<void>;
  lock: () => void;
  /** Lock, and make another wallet active (it then needs its own password). */
  switchTo: (id: string) => void;
  rename: (id: string, name: string) => void;
  /** The next account from the active wallet's recovery phrase. Needs the password. */
  addAccount: (password: string, onProgress?: (f: number) => void) => Promise<void>;
  /**
   * Decrypt the stored secret again to show it to the user. Always needs the
   * password, even when unlocked. The caller must drop it as soon as it's hidden.
   */
  reveal: (password: string, onProgress?: (f: number) => void) => Promise<Secret>;
  /** Remove the active wallet (and its vault, if no other account uses it). */
  remove: () => Promise<void>;
  /** Accounts sharing the active wallet's vault (including it). */
  siblings: WalletAccount[];
  autoLockMinutes: number;
  setAutoLockMinutes: (m: number) => void;
}

const Ctx = createContext<WalletCtx | null>(null);

async function sessionFor(secret: Secret, account: WalletAccount): Promise<WalletSession> {
  const { privateKeyFromMnemonic, parsePrivateKey, addressOf, WalletSession } = await walletLib();
  const key =
    secret.kind === "mnemonic"
      ? await privateKeyFromMnemonic(secret.value, account.index)
      : parsePrivateKey(secret.value);
  // The key must match the account we said we were unlocking.
  if (addressOf(key).toLowerCase() !== account.address.toLowerCase()) {
    key.fill(0);
    throw new Error("This wallet's key doesn't match its address");
  }
  return new WalletSession(key, account.address);
}

const newId = () => crypto.randomUUID();

export function WalletProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>("loading");
  const [meta, setMetaState] = useState<WalletMeta>(emptyMeta);
  const [blob, setBlob] = useState<VaultBlob | null>(null);
  const sessionRef = useRef<WalletSession | null>(null);
  const [session, setSession] = useState<WalletSession | null>(null);
  const [autoLockMinutes, setAutoLockState] = useState(() => {
    const v = Number(localStorage.getItem(AUTOLOCK_KEY));
    return (AUTOLOCK_OPTIONS as readonly number[]).includes(v) ? v : 10;
  });

  const active = meta.accounts.find((a) => a.id === meta.active) ?? null;
  const setMeta = useCallback((m: WalletMeta) => {
    saveMeta(m);
    setMetaState(m);
  }, []);

  // Load (and migrate) once: the original single vault becomes "Wallet 1".
  useEffect(() => {
    void (async () => {
      const ids = await vaultStore.ids();
      const primary = ids.includes(PRIMARY_VAULT) ? await vaultStore.get(PRIMARY_VAULT) : undefined;
      const m = migrateWalletMeta(
        loadStoredMeta(),
        primary ? { address: getAddress(primary.address) } : null,
        ids,
      );
      saveMeta(m);
      setMetaState(m);
      const act = m.accounts.find((a) => a.id === m.active);
      const b = act ? await vaultStore.get(act.vaultId) : undefined;
      setBlob(b ?? null);
      setStatus(b ? "locked" : "none");
    })();
  }, []);

  const adopt = useCallback((s: WalletSession) => {
    sessionRef.current?.lock();
    sessionRef.current = s;
    setSession(s);
    setStatus("unlocked");
  }, []);

  const lock = useCallback(() => {
    sessionRef.current?.lock();
    sessionRef.current = null;
    setSession(null);
    setStatus((st) => (st === "unlocked" ? "locked" : st));
  }, []);

  const create = useCallback(
    async (secret: Secret, password: string, onProgress?: (f: number) => void, name?: string) => {
      const { sealVault } = await walletLib();
      const b = await sealVault(secret, password, onProgress ? { onProgress } : {});
      const vaultId =
        meta.accounts.length === 0 && !(await vaultStore.get(PRIMARY_VAULT))
          ? PRIMARY_VAULT
          : newId();
      await vaultStore.put(b, vaultId);
      const account: WalletAccount = {
        id: vaultId === PRIMARY_VAULT ? "primary-0" : `${vaultId}-0`,
        name: name?.trim() || nextName(meta.accounts),
        vaultId,
        index: 0,
        address: getAddress(b.address),
      };
      setMeta({ v: 1, accounts: [...meta.accounts, account], active: account.id });
      setBlob(b);
      adopt(await sessionFor(secret, account));
    },
    [meta, setMeta, adopt],
  );

  const unlock = useCallback(
    async (password: string, onProgress?: (f: number) => void) => {
      if (!blob || !active) throw new Error("No wallet on this device");
      const { openVault } = await walletLib();
      const secret = await openVault(blob, password, onProgress);
      adopt(await sessionFor(secret, active));
    },
    [blob, active, adopt],
  );

  const switchTo = useCallback(
    (id: string) => {
      const target = meta.accounts.find((a) => a.id === id);
      if (!target || target.id === meta.active) return;
      lock();
      setMeta({ ...meta, active: id });
      setStatus("loading");
      void vaultStore.get(target.vaultId).then((b) => {
        setBlob(b ?? null);
        setStatus(b ? "locked" : "none");
      });
    },
    [meta, setMeta, lock],
  );

  const rename = useCallback(
    (id: string, name: string) => {
      const n = name.trim().slice(0, 40);
      if (!n) return;
      setMeta({
        ...meta,
        accounts: meta.accounts.map((a) => (a.id === id ? { ...a, name: n } : a)),
      });
    },
    [meta, setMeta],
  );

  const addAccount = useCallback(
    async (password: string, onProgress?: (f: number) => void) => {
      if (!blob || !active || !sessionRef.current) throw new Error("Unlock the wallet first");
      if (blob.kind !== "mnemonic")
        throw new Error(
          "Extra accounts need a recovery phrase; this wallet is a single private key",
        );
      const { openVault, privateKeyFromMnemonic, addressOf } = await walletLib();
      const secret = await openVault(blob, password, onProgress);
      const used = meta.accounts.filter((a) => a.vaultId === active.vaultId).map((a) => a.index);
      const index = Math.max(...used) + 1;
      const key = await privateKeyFromMnemonic(secret.value, index);
      const address = addressOf(key);
      key.fill(0);
      const account: WalletAccount = {
        id: `${active.vaultId}-${index}`,
        name: `${active.name} · account ${index + 1}`,
        vaultId: active.vaultId,
        index,
        address,
      };
      setMeta({ v: 1, accounts: [...meta.accounts, account], active: account.id });
      adopt(await sessionFor(secret, account));
    },
    [blob, active, meta, setMeta, adopt],
  );

  const reveal = useCallback(
    async (password: string, onProgress?: (f: number) => void) => {
      if (!blob || !sessionRef.current) throw new Error("Unlock the wallet first");
      const { openVault } = await walletLib();
      return openVault(blob, password, onProgress);
    },
    [blob],
  );

  const remove = useCallback(async () => {
    if (!active) return;
    lock();
    const rest = meta.accounts.filter((a) => a.id !== active.id);
    // The vault goes only with its last account.
    if (!rest.some((a) => a.vaultId === active.vaultId)) await vaultStore.remove(active.vaultId);
    if (!rest.length) await activityStore.clear();
    const next = rest[0] ?? null;
    setMeta({ v: 1, accounts: rest, active: next?.id ?? null });
    const b = next ? await vaultStore.get(next.vaultId) : undefined;
    setBlob(b ?? null);
    setStatus(b ? "locked" : "none");
  }, [active, meta, setMeta, lock]);

  const setAutoLockMinutes = useCallback((m: number) => {
    localStorage.setItem(AUTOLOCK_KEY, String(m));
    setAutoLockState(m);
  }, []);

  // Auto-lock after inactivity. Any pointer, key or focus activity resets the timer.
  useEffect(() => {
    if (status !== "unlocked") return;
    let timer = setTimeout(lock, autoLockMinutes * 60_000);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(lock, autoLockMinutes * 60_000);
    };
    const events = ["pointerdown", "keydown", "focus", "wheel", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, reset, { passive: true });
    return () => {
      clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, reset);
    };
  }, [status, autoLockMinutes, lock]);

  // Never keep a key around when the page goes away.
  useEffect(() => {
    window.addEventListener("pagehide", lock);
    return () => window.removeEventListener("pagehide", lock);
  }, [lock]);

  const siblings = useMemo(
    () => (active ? meta.accounts.filter((a) => a.vaultId === active.vaultId) : []),
    [meta, active],
  );
  const value = useMemo<WalletCtx>(
    () => ({
      status,
      active,
      accounts: meta.accounts,
      address: active?.address ?? null,
      kind: blob?.kind ?? null,
      session,
      create,
      unlock,
      lock,
      switchTo,
      rename,
      addAccount,
      reveal,
      remove,
      siblings,
      autoLockMinutes,
      setAutoLockMinutes,
    }),
    [
      status,
      active,
      meta,
      blob,
      session,
      create,
      unlock,
      lock,
      switchTo,
      rename,
      addAccount,
      reveal,
      remove,
      siblings,
      autoLockMinutes,
      setAutoLockMinutes,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWallet outside WalletProvider");
  return c;
}
