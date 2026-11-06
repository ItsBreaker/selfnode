/**
 * App-wide Selfnode state: ONE TransportRouter, persisted transport settings,
 * live traffic counts and connection health. Every feature gets its viem
 * client from `usePublicClient`, which always comes from the router.
 */
import {
  anonNetworks,
  chains,
  createHarnessWorkerFactory,
  deriveConnection,
  parseTransportSettings,
  ROUTES,
  serializeTransportSettings,
  TransportRouter,
  viemChains,
  type ChainKey,
  type ConnectionInfo,
  type NetworkTestResult,
  type RetryState,
  type Route,
  type TrafficSnapshot,
  type TransportSettings,
  type WorkerFactory,
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
import { askWorkerCodeChange, localWorkerPins } from "./workerPins";

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
  /** Attempts that got no answer this session (not counted under any route). */
  failed: number;
  #base: Record<Route, number>;
  #listeners = new Set<() => void>();
  #timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private readonly router: TransportRouter) {
    this.#base = loadTotals();
    this.session = router.counter.snapshot();
    this.total = this.#sum();
    this.failed = router.counter.failed;
    router.counter.subscribe((s) => {
      this.session = s;
      this.failed = router.counter.failed;
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

/**
 * Testing aid: localStorage "selfnode:debug-fail-networks" = "nox" (comma-separated)
 * makes those networks' workers fail to start, to exercise failover. It can only
 * make a network fail; it never routes traffic anywhere else.
 */
function withForcedFailures(factory: WorkerFactory): WorkerFactory {
  return (init) => {
    const fail = (localStorage.getItem("selfnode:debug-fail-networks") ?? "").split(",");
    const id = (Object.keys(anonNetworks) as (keyof typeof anonNetworks)[]).find(
      (k) => anonNetworks[k].specifier.toLowerCase() === init.address.toLowerCase(),
    );
    if (id && fail.includes(id))
      throw new Error(
        `${anonNetworks[id].label} failed to boot (forced by selfnode:debug-fail-networks)`,
      );
    return factory(init);
  };
}

export function SelfnodeProvider({ children }: { children: ReactNode }) {
  // Self-hosted sandbox page, so the strict CSP needs no 'unsafe-inline' (see public/_headers).
  const [router] = useState(
    () =>
      new TransportRouter(loadSettings(), {
        workerFactory: withForcedFailures(
          createHarnessWorkerFactory({ iframeUrl: "/anon-rpc-iframe.html" }),
        ),
        // Pin each network's worker hash; ask before running changed code.
        pins: localWorkerPins,
        onWorkerCodeChange: askWorkerCodeChange,
      }),
  );
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
  const failed = useSyncExternalStore(store.subscribe, () => store.failed);
  return { session, total, failed, resetAll: store.resetAll };
}

export interface ConnectionView extends ConnectionInfo {
  /** Route detail for the indicator, e.g. "via Nox", "Helios · direct", "127.0.0.1:8545". */
  via: string;
  chainName: string;
}

/** Automatic anonymity-network switches this session, and the network now in use. */
export function useFailover() {
  const { router } = useSelfnode();
  const key = useSyncExternalStore(
    (l) => router.subscribeFailover(l),
    () => `${router.activeNetwork}|${router.failovers.length}`,
  );
  return useMemo(
    () => ({
      active: router.activeNetwork,
      events: router.failovers,
      retry: () => router.retryPreferred(),
      test: (onResult?: (r: NetworkTestResult) => void) => router.testNetworks(onResult),
    }),
    [key, router],
  );
}

/** A read being retried while the network makes its first connection, or null. */
export function useRetry(): RetryState | null {
  const { router } = useSelfnode();
  const key = useSyncExternalStore(
    (l) => router.subscribeRetry(l),
    () => JSON.stringify(router.retryState),
  );
  return useMemo(() => JSON.parse(key) as RetryState | null, [key]);
}

export function useConnection(): ConnectionView {
  const { router, settings } = useSelfnode();
  const { active } = useFailover();
  const retry = useRetry();
  const health = useSyncExternalStore(
    (l) => router.health.subscribe(l),
    () => router.health.snapshot(),
  );
  const poolVersion = useSyncExternalStore(
    (l) => router.pool.subscribe(l),
    () => JSON.stringify(router.pool.status(active).status),
  );
  const { session } = useTraffic();
  const worker = JSON.parse(poolVersion) as ReturnType<typeof router.pool.status>["status"];
  const info = deriveConnection({
    mode: settings.mode,
    worker,
    health,
    directCount: session["direct-approved"],
    retry,
  });
  const via =
    settings.mode === "private"
      ? `via ${anonNetworks[active].label}${active !== settings.anonNetwork ? ` (${anonNetworks[settings.anonNetwork].label} unavailable)` : ""}`
      : settings.mode === "verified"
        ? "Helios · direct"
        : (hostOf(settings.myNodeUrl?.[settings.chain]) ?? "no node set");
  return {
    ...info,
    via:
      settings.mode === "private" && retry
        ? `${via} · retrying (attempt ${retry.attempt} of ${retry.of})`
        : via,
    chainName: chains[settings.chain].name,
  };
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
