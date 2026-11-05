/**
 * Traffic accounting. Every JSON-RPC call Selfnode makes is counted by the
 * route it took, so the app can show (and the README can quote) what share
 * went through Anon-RPC. A JSON-RPC batch counts once per call inside it.
 */
export type Route =
  /** Through an Anon-RPC worker (anonymised). */
  | "anon-rpc"
  /** One-time specifier read at worker startup (NOT anonymised, disclosed). */
  | "bootstrap"
  /** Helios's direct upstream in Verified mode (NOT anonymised, disclosed). */
  | "helios-direct"
  /** The user's own node in My node mode. */
  | "my-node"
  /** A direct request the user explicitly approved for one action. */
  | "direct-approved";

export const ROUTES: readonly Route[] = [
  "anon-rpc",
  "bootstrap",
  "helios-direct",
  "my-node",
  "direct-approved",
];

export type TrafficSnapshot = Readonly<Record<Route, number>>;

export class TrafficCounter {
  #counts: Record<Route, number> = Object.fromEntries(ROUTES.map((r) => [r, 0])) as Record<
    Route,
    number
  >;
  #listeners = new Set<(s: TrafficSnapshot) => void>();

  add(route: Route, calls = 1): void {
    if (calls <= 0) return;
    this.#counts[route] += calls;
    const snap = this.snapshot();
    for (const l of this.#listeners) l(snap);
  }

  snapshot(): TrafficSnapshot {
    return { ...this.#counts };
  }

  /** Share of all calls that went through Anon-RPC (0..1), or null if none yet. */
  anonShare(): number | null {
    const total = ROUTES.reduce((n, r) => n + this.#counts[r], 0);
    return total === 0 ? null : this.#counts["anon-rpc"] / total;
  }

  subscribe(listener: (s: TrafficSnapshot) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  reset(): void {
    for (const r of ROUTES) this.#counts[r] = 0;
    const snap = this.snapshot();
    for (const l of this.#listeners) l(snap);
  }
}

/** Number of JSON-RPC calls in a request body (batch = array length). */
export function countRpcCalls(body: unknown): number {
  if (typeof body !== "string") return 1;
  try {
    const parsed: unknown = JSON.parse(body);
    return Array.isArray(parsed) ? parsed.length : 1;
  } catch {
    return 1;
  }
}

/** Wrap a fetch so every call through it is counted under `route`. */
export function countingFetch(
  inner: typeof fetch,
  counter: TrafficCounter,
  route: Route,
): typeof fetch {
  return (input, init) => {
    counter.add(route, countRpcCalls(init?.body));
    return inner(input, init);
  };
}
