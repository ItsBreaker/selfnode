/**
 * Arkiv testnet ("Rabdi", chain ID 7794095).
 *
 * Sources:
 * - Chain definition shipped in @arkiv-network/sdk@1.0.1 (`rabdi()` in
 *   @arkiv-network/sdk/chains): RPC host rpc.rabdi.db-chain.testnet.arkiv.network,
 *   explorer https://rabdi.explorer.arkiv.network
 * - Faucet and access keys: https://hub.arkiv.network/faucet , https://hub.arkiv.network/access-keys
 *   (README of https://github.com/Arkiv-Network/arkiv-sdk-js)
 *
 * The web app reads WITHOUT an access key (public endpoint; verified to work
 * on 2026-11-06). The access key is only for the mirror script and lives in
 * the local .env; it must never be bundled.
 */
export const arkivConfig = {
  chainId: 7794095,
  explorer: "https://rabdi.explorer.arkiv.network",
  /** Owner of all mirrored entities. Reads are ALWAYS scoped by this owner. */
  mirrorOwner: "0xA05A5c06d69dECa38FdB779957d4E7B3aC2B8c39",
} as const;
