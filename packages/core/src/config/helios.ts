/**
 * Helios (Verified mode) upstreams. Helios takes URLs only, so it cannot use
 * Anon-RPC's fetch: Verified mode talks to these DIRECTLY (or to the user's
 * own node), and the UI and privacy report say so.
 *
 * Probed 2026-11-06 (docs/DECISIONS.md):
 * - Mainnet consensus: https://ethereum-beacon-api.publicnode.com works.
 *   lodestar-mainnet.chainsafe.io synced but its head stopped advancing.
 * - Sepolia: no public HTTPS consensus endpoint worked. Nimbus's
 *   http://unstable.sepolia.beacon-api.nimbus.team works but is plain HTTP
 *   (blocked as mixed content on an HTTPS page), so Sepolia Verified mode
 *   needs a user-supplied endpoint (e.g. their own node).
 */
import type { ChainKey } from "./chains.js";

export const heliosUpstreams: Partial<
  Record<ChainKey, { executionRpc: string; consensusRpc: string }>
> = {
  mainnet: {
    executionRpc: "https://ethereum-rpc.publicnode.com",
    consensusRpc: "https://ethereum-beacon-api.publicnode.com",
  },
};
