/**
 * Supported chains and keyless public RPC endpoints.
 *
 * Endpoint lists are user-overridable in Settings; these are defaults only.
 * Each was probed on 2026-11-06 for eth_blockNumber, eth_chainId and
 * eth_getProof (Helios needs eth_getProof). Results: docs/DECISIONS.md.
 *
 * Sources:
 * - Sepolia chain ID 11155111: https://github.com/ethereum-lists/chains/blob/master/_data/chains/eip155-11155111.json
 * - PublicNode endpoints: https://ethereum-sepolia-rpc.publicnode.com and https://ethereum-rpc.publicnode.com (listed at https://www.publicnode.com/)
 * - Tenderly public gateways: https://docs.tenderly.co/node/rpc-reference (gateway.tenderly.co)
 * - dRPC: https://drpc.org/chainlist/ethereum (free tier serves mainnet but not Sepolia as of 2026-11-06)
 * - 1RPC: https://docs.1rpc.io/ (no eth_getProof on the free plan)
 */
export type ChainKey = "mainnet" | "sepolia";

export interface ChainConfig {
  key: ChainKey;
  id: number;
  name: string;
  /** Signing is only ever permitted on testnets. Enforced in core/wallet. */
  testnet: boolean;
  /** Keyless public RPC URLs, in preference order. */
  publicRpcs: readonly string[];
  /** Subset of publicRpcs that answered eth_getProof (usable by Helios). */
  proofRpcs: readonly string[];
}

export const chains: Record<ChainKey, ChainConfig> = {
  mainnet: {
    key: "mainnet",
    id: 1,
    name: "Ethereum",
    testnet: false,
    publicRpcs: [
      "https://ethereum-rpc.publicnode.com",
      "https://eth.drpc.org",
      "https://mainnet.gateway.tenderly.co",
      "https://1rpc.io/eth",
    ],
    proofRpcs: [
      "https://ethereum-rpc.publicnode.com",
      "https://eth.drpc.org",
      "https://mainnet.gateway.tenderly.co",
    ],
  },
  sepolia: {
    key: "sepolia",
    id: 11155111,
    name: "Sepolia",
    testnet: true,
    publicRpcs: [
      "https://ethereum-sepolia-rpc.publicnode.com",
      "https://sepolia.gateway.tenderly.co",
      "https://1rpc.io/sepolia",
    ],
    proofRpcs: [
      "https://ethereum-sepolia-rpc.publicnode.com",
      "https://sepolia.gateway.tenderly.co",
    ],
  },
};
