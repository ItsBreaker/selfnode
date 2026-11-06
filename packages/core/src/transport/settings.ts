/**
 * Transport settings: defaults and strict parsing of persisted values.
 * Anything invalid is dropped back to the safe default (Private mode via the
 * default anonymity network). The passthrough opt-in is never persisted.
 */
import { anonNetworks, DEFAULT_ANON_NETWORK, type AnonNetworkId } from "../config/anon-rpc.js";
import { chains, type ChainKey } from "../config/chains.js";
import type { Mode, TransportSettings } from "./types.js";

export const MODES: readonly Mode[] = ["private", "verified", "mynode"];

export const defaultTransportSettings: TransportSettings = {
  mode: "private",
  chain: "sepolia",
  anonNetwork: DEFAULT_ANON_NETWORK,
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isChain = (v: unknown): v is ChainKey => typeof v === "string" && v in chains;

/** Only http(s) URLs; http is allowed (local nodes), everything else rejected. */
export function isRpcUrl(v: unknown): v is string {
  if (typeof v !== "string") return false;
  try {
    const u = new URL(v);
    return (u.protocol === "https:" || u.protocol === "http:") && !u.username && !u.password;
  } catch {
    return false;
  }
}

function urlMap(v: unknown): Partial<Record<ChainKey, string>> | undefined {
  if (!isObj(v)) return undefined;
  const out: Partial<Record<ChainKey, string>> = {};
  for (const [k, url] of Object.entries(v)) if (isChain(k) && isRpcUrl(url)) out[k] = url;
  return Object.keys(out).length ? out : undefined;
}

export function parseTransportSettings(raw: unknown): TransportSettings {
  if (!isObj(raw)) return { ...defaultTransportSettings };
  const s: TransportSettings = { ...defaultTransportSettings };
  if (MODES.includes(raw.mode as Mode)) s.mode = raw.mode as Mode;
  if (isChain(raw.chain)) s.chain = raw.chain;
  const net = raw.anonNetwork as AnonNetworkId;
  // A non-anonymising worker is never restored from storage.
  if (typeof net === "string" && net in anonNetworks && anonNetworks[net].kind === "network")
    s.anonNetwork = net;
  if (isObj(raw.anonConfig)) {
    const cfg: Partial<Record<AnonNetworkId, unknown>> = {};
    for (const [k, v] of Object.entries(raw.anonConfig))
      if (k in anonNetworks) cfg[k as AnonNetworkId] = v;
    if (Object.keys(cfg).length) s.anonConfig = cfg;
  }
  const rpcUrl = urlMap(raw.rpcUrl);
  if (rpcUrl) s.rpcUrl = rpcUrl;
  const myNodeUrl = urlMap(raw.myNodeUrl);
  if (myNodeUrl) s.myNodeUrl = myNodeUrl;
  if (isObj(raw.helios)) {
    const h: NonNullable<TransportSettings["helios"]> = {};
    for (const [k, v] of Object.entries(raw.helios)) {
      if (isChain(k) && isObj(v) && isRpcUrl(v.executionRpc) && isRpcUrl(v.consensusRpc)) {
        h[k] = { executionRpc: v.executionRpc, consensusRpc: v.consensusRpc };
      }
    }
    if (Object.keys(h).length) s.helios = h;
  }
  if (raw.anonFailover === false) s.anonFailover = false; // default (undefined) = on
  return s;
}

/** What gets persisted: never the insecure-worker opt-in. */
export function serializeTransportSettings(s: TransportSettings): string {
  const persisted: TransportSettings = { ...s };
  delete persisted.allowInsecureReferenceWorker;
  return JSON.stringify(persisted);
}
