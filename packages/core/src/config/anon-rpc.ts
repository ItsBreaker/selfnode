/**
 * Anon-RPC worker specifiers.
 *
 * Source (all addresses, kinds and chains verified 2026-11-06):
 * https://github.com/ethereum/anon-rpc/blob/main/adopters.json5
 *
 * `specifierChain` is the chain the IWorkerSpecifier contract lives on, i.e.
 * the chain the one-time, NON-anonymised bootstrap read goes to. It is not a
 * limit on which chain the anonymised fetch can reach.
 */
import type { ChainKey } from "./chains.js";

export type AnonNetworkId = "tor-js" | "nym" | "nox" | "passthrough";

export interface AnonNetwork {
  id: AnonNetworkId;
  label: string;
  specifier: `0x${string}`;
  specifierChain: ChainKey;
  /** "reference" = does NOT anonymise. */
  kind: "network" | "reference";
  /** Default worker config (network-defined, opaque to the harness). User-overridable. */
  defaultConfig?: unknown;
}

export const anonNetworks: Record<AnonNetworkId, AnonNetwork> = {
  "tor-js": {
    id: "tor-js",
    label: "Tor",
    specifier: "0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e",
    specifierChain: "mainnet",
    kind: "network",
    // The adopters list's example gateway: "Demonstration gateway only: limited
    // capacity, and it may disappear at any time". Overridable in Settings.
    defaultConfig: {
      gateways: ["152.236.3.22:12298:uEiCH0VdbhryzJcMtCfB0vLA4sOvHdQ4hq5w7CopcwU59bQ"],
    },
  },
  nym: {
    id: "nym",
    label: "Nym",
    specifier: "0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0",
    specifierChain: "mainnet",
    kind: "network",
  },
  nox: {
    id: "nox",
    label: "Nox",
    specifier: "0x35133267A8F7EC35046a83DCA0f4Ca8A6e1b7A9A",
    specifierChain: "sepolia",
    kind: "network",
  },
  passthrough: {
    // TESTING ONLY. Does not anonymise. Never a default; never selectable
    // in the UI without a loud warning.
    id: "passthrough",
    label: "Passthrough (NOT anonymous)",
    specifier: "0x4fd77be300f31c5fe6ab266d35d27750a3478d27",
    specifierChain: "mainnet",
    kind: "reference",
  },
};

export const DEFAULT_ANON_NETWORK: AnonNetworkId = "tor-js";
