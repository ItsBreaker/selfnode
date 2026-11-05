/**
 * App-wide Selfnode state: ONE TransportRouter, persisted transport settings,
 * live traffic counts and connection health. Every feature gets its viem
 * client from `usePublicClient`, which always comes from the router.
 */
import {
  anonNetworks,
  chains,
  deriveConnection,
  parseTransportSettings,
  ROUTES,
  serializeTransportSettings,
  TransportRouter,
  viemChains,
  type ChainKey,
  type ConnectionInfo,
  type Route,
  type TrafficSnapshot,
  type TransportSettings,
} from "@selfnode/core";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPublicClient, type PublicClient } from "viem";

const SETTINGS_KEY = "selfnode:transport";
const TOTALS_KEY = "selfnode:traffic-total";

interface Ctx {
  router: TransportRouter;
  settings: TransportSettings;
  setSettings: (next: TransportSettings) => void;
}
const SelfnodeContext = createContext<Ctx | null>(null);

function loadSettings(): TransportSettings {
  try {
    return parseTransportSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null"));
  } catch {
    return parseTransportSettings(null);
  }
}

function loadTotals(): Record<Route, number> {
  const zero = Object.fromEntries(ROUTES.map((r) => [r, 0])) as Record<Route, number>;
  try {
    const raw = JSON.parse(localStorage.getItem(TOTALS_KEY) ?? "{}") as Record<string, unknown>;
    for (const r of ROUTES)
      if (typeof raw[r] === "number" && Number.isFinite(raw[r])) zero[r] = raw[r];
  } catch {
    /* corrupt totals: start from zero */
  }
  return zero;
}

/** Session counts plus persisted all-time totals (counts only, nothing else). */
class TrafficStore {
  session: TrafficSnapshot;
  total: TrafficSnapshot;
  #base: Record<Route, number>;
  #listeners = new Set<() => void>();
  #timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private readonly router: TransportRouter) {
    this.#base = loadTotals();
    this.session = router.counter.snapshot();
    this.total = this.#sum();
    router.counter.subscribe((s) => {
      this.session = s;
      this.total = this.#sum();
      this.#emit();
      clearTimeout(this.#timer);
      this.#timer = setTimeout(
        () => localStorage.setItem(TOTALS_KEY, JSON.stringify(this.total)),
        1000,
      );
    });
  }
  #sum(): TrafficSnapshot {
    return Object.fromEntries(
      ROUTES.map((r) => [r, this.#base[r] + this.session[r]]),
    ) as TrafficSnapshot;
  }
  resetAll = () => {
    this.#base = Object.fromEntries(ROUTES.map((r) => [r, 0])) as Record<Route, number>;
    localStorage.removeItem(TOTALS_KEY);
    this.router.counter.reset();
  };
  subscribe = (l: () => void) => {
    this.#listeners.add(l);
    return () => this.#listeners.delete(l);
  };
  #emit() {
    for (const l of this.#listeners) l();
  }
}

const stores = new WeakMap<TransportRouter, TrafficStore>();
const trafficStore = (r: TransportRouter) => {
  let s = stores.get(r);
  if (!s) stores.set(r, (s = new TrafficStore(r)));
  return s;
};

export function SelfnodeProvider({ children }: { children: ReactNode }) {
  const [router] = useState(() => new TransportRouter(loadSettings()));
  const [settings, setSettingsState] = useState<TransportSettings>(router.settings);
  const setSettings = useCallback(
    (next: TransportSettings) => {
      router.update(next);
      localStorage.setItem(SETTINGS_KEY, serializeTransportSettings(next));
      setSettingsState(next);
    },
    [router],
  );
  const value = useMemo(() => ({ router, settings, setSettings }), [router, settings, setSettings]);
  return <SelfnodeContext.Provider value={value}>{children}</SelfnodeContext.Provider>;
}

export function useSelfnode(): Ctx {
  const ctx = useContext(SelfnodeContext);
  if (!ctx) throw new Error("useSelfnode outside SelfnodeProvider");
  return ctx;
}

/** A viem client for the active mode (always from the router). */
export function usePublicClient(chain?: ChainKey): PublicClient {
  const { router, settings } = useSelfnode();
  const key = chain ?? settings.chain;
  return useMemo(
    () =>
      createPublicClient({
        chain: viemChains[key],
        transport: router.transport(key),
      }) as PublicClient,
    // Re-create when the route changes; `settings` identity changes on every update.
    [router, settings, key],
  );
}

/** Stable query-key fragment for the active route, so queries refetch on change. */
export function useRouteKey(): string {
  const { settings } = useSelfnode();
  return `${settings.mode}:${settings.chain}:${settings.anonNetwork}`;
}

export function useTraffic() {
  const { router } = useSelfnode();
  const store = trafficStore(router);
  const session = useSyncExternalStore(store.subscribe, () => store.session);
  const total = useSyncExternalStore(store.subscribe, () => store.total);
  return { session, total, resetAll: store.resetAll };
}

export interface ConnectionView extends ConnectionInfo {
  /** Route detail for the indicator, e.g. "via Nox", "Helios · direct", "127.0.0.1:8545". */
  via: string;
  chainName: string;
}

export function useConnection(): ConnectionView {
  const { router, settings } = useSelfnode();
  const health = useSyncExternalStore(
    (l) => router.health.subscribe(l),
    () => router.health.snapshot(),
  );
  const poolVersion = useSyncExternalStore(
    (l) => router.pool.subscribe(l),
    () => JSON.stringify(router.pool.status(settings.anonNetwork).status),
  );
  const { session } = useTraffic();
  const worker = JSON.parse(poolVersion) as ReturnType<typeof router.pool.status>["status"];
  const info = deriveConnection({
    mode: settings.mode,
    worker,
    health,
    directCount: session["direct-approved"],
  });
  const via =
    settings.mode === "private"
      ? `via ${anonNetworks[settings.anonNetwork].label}`
      : settings.mode === "verified"
        ? "Helios · direct"
        : (hostOf(settings.myNodeUrl?.[settings.chain]) ?? "no node set");
  return { ...info, via, chainName: chains[settings.chain].name };
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** Kick off the active route on app start (the anonymity network is slow to connect). */
export function useWarmRoute() {
  const { router, settings } = useSelfnode();
  const client = usePublicClient();
  useEffect(() => {
    let cancelled = false;
    client
      .getChainId()
      .then((id) => {
        const want = chains[settings.chain];
        if (!cancelled && id !== want.id) {
          router.health.setFatal(`Endpoint is on chain ${id}, expected ${want.name} (${want.id})`);
        }
      })
      .catch(() => undefined); // request failures are surfaced via health
    return () => {
      cancelled = true;
    };
  }, [client, router, settings.chain]);
}
