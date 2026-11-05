/**
 * Wallet state: none → locked → unlocked. The decrypted key lives only in a
 * WalletSession, which is zeroed on lock (manual, on inactivity, or on removal).
 */
import {
  openVault,
  parsePrivateKey,
  privateKeyFromMnemonic,
  sealVault,
  WalletSession,
  type Secret,
  type VaultBlob,
} from "@selfnode/core";
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
import type { Address } from "viem";
import { activityStore, vaultStore } from "../storage/db";

export type WalletStatus = "loading" | "none" | "locked" | "unlocked";
const AUTOLOCK_KEY = "selfnode:autolock-minutes";
export const AUTOLOCK_OPTIONS = [1, 5, 10, 30] as const;

interface WalletCtx {
  status: WalletStatus;
  address: Address | null;
  kind: VaultBlob["kind"] | null;
  session: WalletSession | null;
  create: (secret: Secret, password: string, onProgress?: (f: number) => void) => Promise<void>;
  unlock: (password: string, onProgress?: (f: number) => void) => Promise<void>;
  lock: () => void;
  remove: () => Promise<void>;
  autoLockMinutes: number;
  setAutoLockMinutes: (m: number) => void;
}

const Ctx = createContext<WalletCtx | null>(null);

async function sessionFor(secret: Secret, address: Address): Promise<WalletSession> {
  const key =
    secret.kind === "mnemonic"
      ? await privateKeyFromMnemonic(secret.value)
      : parsePrivateKey(secret.value);
  return new WalletSession(key, address);
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>("loading");
  const [blob, setBlob] = useState<VaultBlob | null>(null);
  const sessionRef = useRef<WalletSession | null>(null);
  const [session, setSession] = useState<WalletSession | null>(null);
  const [autoLockMinutes, setAutoLockState] = useState(() => {
    const v = Number(localStorage.getItem(AUTOLOCK_KEY));
    return (AUTOLOCK_OPTIONS as readonly number[]).includes(v) ? v : 10;
  });

  useEffect(() => {
    void vaultStore.get().then((b) => {
      setBlob(b ?? null);
      setStatus(b ? "locked" : "none");
    });
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
    async (secret: Secret, password: string, onProgress?: (f: number) => void) => {
      const b = await sealVault(secret, password, onProgress ? { onProgress } : {});
      await vaultStore.put(b);
      setBlob(b);
      adopt(await sessionFor(secret, b.address));
    },
    [adopt],
  );

  const unlock = useCallback(
    async (password: string, onProgress?: (f: number) => void) => {
      if (!blob) throw new Error("No wallet on this device");
      const secret = await openVault(blob, password, onProgress);
      adopt(await sessionFor(secret, blob.address));
    },
    [blob, adopt],
  );

  const remove = useCallback(async () => {
    lock();
    await vaultStore.clear();
    await activityStore.clear();
    setBlob(null);
    setStatus("none");
  }, [lock]);

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

  const value = useMemo<WalletCtx>(
    () => ({
      status,
      address: blob?.address ?? null,
      kind: blob?.kind ?? null,
      session,
      create,
      unlock,
      lock,
      remove,
      autoLockMinutes,
      setAutoLockMinutes,
    }),
    [status, blob, session, create, unlock, lock, remove, autoLockMinutes, setAutoLockMinutes],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWallet outside WalletProvider");
  return c;
}
