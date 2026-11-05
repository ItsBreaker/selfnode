/**
 * On-chain quoting: eth_call to the v4 Quoter for each standard fee tier,
 * through whatever transport the client uses (Anon-RPC by default). No Uniswap
 * API. Spot price from StateView gives the price impact.
 */
import type { Address, PublicClient } from "viem";
import { uniswapSepolia } from "../config/uniswap.js";
import { poolId, poolKeyFor, STANDARD_TIERS, type PoolKey } from "./v4.js";

const POOL_KEY = {
  type: "tuple",
  components: [
    { name: "currency0", type: "address" },
    { name: "currency1", type: "address" },
    { name: "fee", type: "uint24" },
    { name: "tickSpacing", type: "int24" },
    { name: "hooks", type: "address" },
  ],
} as const;

export const V4_QUOTER_ABI = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "poolKey", ...POOL_KEY },
          { name: "zeroForOne", type: "bool" },
          { name: "exactAmount", type: "uint128" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

export const STATE_VIEW_ABI = [
  {
    type: "function",
    name: "getSlot0",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "protocolFee", type: "uint24" },
      { name: "lpFee", type: "uint24" },
    ],
  },
  {
    type: "function",
    name: "getLiquidity",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [{ name: "liquidity", type: "uint128" }],
  },
] as const;

export interface Quote {
  key: PoolKey;
  zeroForOne: boolean;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  amountOut: bigint;
  gasEstimate: bigint;
  /** Price impact including the pool fee, in basis points (100 = 1%). */
  priceImpactBps: number;
  liquidity: bigint;
}

const Q192 = 2n ** 192n;

/** Output at the pool's spot price, ignoring fees and depth. */
export function spotOut(amountIn: bigint, sqrtPriceX96: bigint, zeroForOne: boolean): bigint {
  const p = sqrtPriceX96 * sqrtPriceX96;
  return zeroForOne ? (amountIn * p) / Q192 : (amountIn * Q192) / p;
}

export function impactBps(amountOut: bigint, spot: bigint): number {
  if (spot <= 0n) return 10_000;
  const bps = Number(((spot - amountOut) * 10_000n) / spot);
  return Math.max(0, bps);
}

/** Quote every standard tier; returns successful quotes, best output first. */
export async function quoteExactIn(
  client: PublicClient,
  req: { tokenIn: Address; tokenOut: Address; amountIn: bigint },
  addrs: { quoter: Address; stateView: Address } = uniswapSepolia.v4,
): Promise<Quote[]> {
  const results = await Promise.all(
    STANDARD_TIERS.map(async (tier) => {
      const key = poolKeyFor(req.tokenIn, req.tokenOut, tier);
      const zeroForOne = key.currency0.toLowerCase() === req.tokenIn.toLowerCase();
      const id = poolId(key);
      try {
        const [{ result }, slot0, liquidity] = await Promise.all([
          client.simulateContract({
            address: addrs.quoter,
            abi: V4_QUOTER_ABI,
            functionName: "quoteExactInputSingle",
            args: [{ poolKey: key, zeroForOne, exactAmount: req.amountIn, hookData: "0x" }],
          }),
          client.readContract({
            address: addrs.stateView,
            abi: STATE_VIEW_ABI,
            functionName: "getSlot0",
            args: [id],
          }),
          client.readContract({
            address: addrs.stateView,
            abi: STATE_VIEW_ABI,
            functionName: "getLiquidity",
            args: [id],
          }),
        ]);
        const [amountOut, gasEstimate] = result;
        if (amountOut <= 0n) return null;
        return {
          key,
          zeroForOne,
          tokenIn: req.tokenIn,
          tokenOut: req.tokenOut,
          amountIn: req.amountIn,
          amountOut,
          gasEstimate,
          priceImpactBps: impactBps(amountOut, spotOut(req.amountIn, slot0[0], zeroForOne)),
          liquidity,
        } satisfies Quote;
      } catch {
        return null; // pool doesn't exist or can't fill this size
      }
    }),
  );
  return results
    .filter((q): q is Quote => q !== null)
    .sort((a, b) => (b.amountOut > a.amountOut ? 1 : b.amountOut < a.amountOut ? -1 : 0));
}

/** Minimum received for a slippage tolerance in basis points. */
export const minReceived = (amountOut: bigint, slippageBps: number) =>
  (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
