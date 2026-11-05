/**
 * Verified mode: Helios with a DIRECT upstream (it accepts URLs only, so it
 * cannot use Anon-RPC). Loaded lazily so its 3.3 MB WASM is only fetched when
 * Verified mode is used.
 *
 * Trust point: the finalized checkpoint is read from the consensus endpoint
 * at startup (weak subjectivity). A lying endpoint could feed a wrong
 * checkpoint. This is disclosed on the privacy page.
 */
import type { ChainKey } from "../config/chains.js";
import type { TrafficCounter } from "./traffic.js";
import type { Eip1193Like } from "./types.js";

export interface HeliosInit {
  chain: ChainKey;
  executionRpc: string;
  consensusRpc: string;
}
export type HeliosFactory = (init: HeliosInit) => Promise<Eip1193Like>;

export function heliosProviderFactory(
  counter: TrafficCounter,
  fetchImpl: typeof fetch,
): HeliosFactory {
  return async ({ chain, executionRpc, consensusRpc }) => {
    counter.add("helios-direct");
    const res = await fetchImpl(
      `${consensusRpc.replace(/\/$/, "")}/eth/v1/beacon/headers/finalized`,
    );
    if (!res.ok)
      throw new Error(`Consensus endpoint returned ${res.status} for the finalized header`);
    const checkpoint = ((await res.json()) as { data: { root: string } }).data.root;
    const { createHeliosProvider } = await import("@a16z/helios");
    const provider = await createHeliosProvider(
      // dbType "config": Phase 0 found the localStorage cache is not namespaced per network.
      { executionRpc, consensusRpc, checkpoint, network: chain, dbType: "config" },
      "ethereum",
    );
    await provider.waitSynced();
    return provider as Eip1193Like;
  };
}
