import { describe, expect, it } from "vitest";
import {
  decodeAbiParameters,
  decodeFunctionData,
  keccak256,
  encodeAbiParameters,
  type Address,
} from "viem";
import { uniswapSepolia } from "../config/uniswap.js";
import { assessSwap, buildSwapCall, permitFor } from "./build.js";
import { impactBps, minReceived, spotOut, type Quote } from "./quote.js";
import { NATIVE, poolId, poolKeyFor, UNIVERSAL_ROUTER_ABI } from "./v4.js";

const must = <T>(v: T | undefined | null, what = "value"): T => {
  if (v === undefined || v === null) throw new Error(`missing ${what}`);
  return v;
};

const USDC = uniswapSepolia.tokens.usdc as Address;
// Fixture quote (illustrative numbers, not live data).
const quote = (tokenIn: Address, tokenOut: Address, p: Partial<Quote> = {}): Quote => {
  const key = poolKeyFor(tokenIn, tokenOut, { fee: 500, tickSpacing: 10 });
  return {
    key,
    zeroForOne: key.currency0 === tokenIn,
    tokenIn,
    tokenOut,
    amountIn: 100_000_000_000_000n,
    amountOut: 2_600_000n,
    gasEstimate: 100_000n,
    priceImpactBps: 5,
    liquidity: 1n,
    ...p,
  };
};

describe("v4 encoding", () => {
  it("sorts pool keys and computes the PoolId", () => {
    const k = poolKeyFor(USDC, NATIVE, { fee: 500, tickSpacing: 10 });
    expect(k.currency0).toBe(NATIVE);
    expect(poolId(k)).toBe(
      keccak256(
        encodeAbiParameters(
          [
            { type: "address" },
            { type: "address" },
            { type: "uint24" },
            { type: "int24" },
            { type: "address" },
          ],
          [k.currency0, k.currency1, 500, 10, k.hooks],
        ),
      ),
    );
  });

  it("builds ETH→USDC as a single V4_SWAP with msg.value and slippage applied", () => {
    const call = buildSwapCall(quote(NATIVE, USDC), { slippageBps: 50, deadline: 1_800_000_000 });
    expect(call.to).toBe(uniswapSepolia.universalRouter);
    expect(call.value).toBe(100_000_000_000_000n);
    expect(call.minOut).toBe(2_587_000n);
    const { args } = decodeFunctionData({ abi: UNIVERSAL_ROUTER_ABI, data: call.data });
    expect(args[0]).toBe("0x10");
    expect(args[2]).toBe(1_800_000_000n);
    const [actions, params] = decodeAbiParameters(
      [{ type: "bytes" }, { type: "bytes[]" }],
      must(args[1][0], "swap input"),
    );
    expect(actions).toBe("0x060c0f"); // SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL
    const [take] = [
      decodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }],
        must(params[2], "take params"),
      ),
    ];
    expect(take).toEqual([USDC, 2_587_000n]);
  });

  it("prefixes PERMIT2_PERMIT for token input and sends no ETH", () => {
    const q = quote(USDC, NATIVE, { amountIn: 1_000_000n, amountOut: 380_000_000_000_000n });
    const permit = permitFor(USDC, 1_000_000n, 0, 1_800_000_000);
    const call = buildSwapCall(q, {
      slippageBps: 100,
      deadline: 1_800_000_000,
      permit: { permit, signature: `0x${"11".repeat(65)}` },
    });
    const { args } = decodeFunctionData({ abi: UNIVERSAL_ROUTER_ABI, data: call.data });
    expect(args[0]).toBe("0x0a10");
    expect(call.value).toBe(0n);
    expect(permit.spender).toBe(uniswapSepolia.universalRouter);
  });

  it("computes spot output and price impact", () => {
    const sqrtP = 2n ** 96n; // price 1
    expect(spotOut(1000n, sqrtP, true)).toBe(1000n);
    expect(impactBps(990n, 1000n)).toBe(100);
    expect(minReceived(10_000n, 50)).toBe(9_950n);
  });
});

describe("assessSwap", () => {
  const base = {
    slippageBps: 50,
    deadlineMinutes: 20,
    balanceIn: 10n ** 18n,
    nativeBalance: 10n ** 18n,
    maxGasCost: 10n ** 12n,
    simulation: { ok: true } as const,
  };
  it("passes a normal swap", () => {
    expect(assessSwap({ ...base, quote: quote(NATIVE, USDC) })).toMatchObject({
      canSwap: true,
      warnings: [],
    });
  });
  it("blocks insufficient balance and failed simulation", () => {
    expect(assessSwap({ ...base, quote: quote(NATIVE, USDC), balanceIn: 1n }).canSwap).toBe(false);
    expect(
      assessSwap({
        ...base,
        quote: quote(NATIVE, USDC),
        simulation: { ok: false, reason: "V4TooLittleReceived" },
      }).canSwap,
    ).toBe(false);
  });
  it("warns at 1% impact and needs acknowledgement at 5%", () => {
    expect(
      assessSwap({ ...base, quote: quote(NATIVE, USDC, { priceImpactBps: 150 }) }).warnings[0]
        ?.level,
    ).toBe("warning");
    const big = assessSwap({ ...base, quote: quote(NATIVE, USDC, { priceImpactBps: 800 }) });
    expect(big).toMatchObject({ canSwap: true, needsAcknowledgement: true });
  });
  it("warns about high slippage tolerance", () => {
    expect(
      assessSwap({ ...base, slippageBps: 500, quote: quote(NATIVE, USDC) }).warnings.map(
        (x) => x.level,
      ),
    ).toEqual(["warning"]);
  });
});
