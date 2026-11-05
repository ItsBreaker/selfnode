/**
 * Built-in tokens shown in the wallet. (Phase 3 adds the Arkiv-mirrored token list.)
 * Sources:
 * - USDC (Circle): https://developers.circle.com/stablecoins/usdc-contract-addresses (checked 2026-11-06)
 * - WETH: Uniswap docs, "Wrapped Native Token" table,
 *   https://docs.uniswap.org/contracts/v3/reference/deployments/ethereum-deployments
 */
import type { Address } from "viem";
import type { ChainKey } from "./chains.js";

export interface TokenInfo {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
}

export const builtinTokens: Record<ChainKey, TokenInfo[]> = {
  sepolia: [
    {
      address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
    },
    {
      address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
      symbol: "WETH",
      name: "Wrapped Ether",
      decimals: 18,
    },
  ],
  mainnet: [
    {
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
    },
    {
      address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      symbol: "WETH",
      name: "Wrapped Ether",
      decimals: 18,
    },
  ],
};
