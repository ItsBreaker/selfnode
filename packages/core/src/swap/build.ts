/**
 * Building a swap: Universal Router calldata, Permit2 state, and a pure
 * pre-sign assessment (tested). Native ETH in needs no approval; a token in
 * needs an ERC-20 approval to Permit2 (an on-chain tx) and a Permit2 signature
 * for the router (signed by the testnet-only signer, sent as PERMIT2_PERMIT).
 */
import { erc20Abi, type Address, type Hex, type PublicClient } from "viem";
import { uniswapSepolia } from "../config/uniswap.js";
import type { Quote } from "./quote.js";
import { minReceived } from "./quote.js";
import {
  COMMANDS,
  encodeExecute,
  encodePermit2PermitInput,
  encodeV4SwapInput,
  NATIVE,
  type ParamsLayout,
  type PermitSingle,
} from "./v4.js";

export const PERMIT2_ABI = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ],
  },
] as const;

export interface ApprovalState {
  /** ERC-20 allowance from the user to Permit2 is too low: an approve tx is needed first. */
  needsErc20Approval: boolean;
  /** Permit2 allowance to the router is too low or expired: a signature is needed. */
  needsPermitSignature: boolean;
  permit2Nonce: number;
}

export async function approvalState(
  client: PublicClient,
  owner: Address,
  token: Address,
  amount: bigint,
  now: number,
): Promise<ApprovalState> {
  if (token === NATIVE)
    return { needsErc20Approval: false, needsPermitSignature: false, permit2Nonce: 0 };
  const [erc20Allowance, [p2Amount, p2Expiration, nonce]] = await Promise.all([
    client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner, uniswapSepolia.permit2],
    }),
    client.readContract({
      address: uniswapSepolia.permit2,
      abi: PERMIT2_ABI,
      functionName: "allowance",
      args: [owner, token, uniswapSepolia.universalRouter],
    }),
  ]);
  return {
    needsErc20Approval: erc20Allowance < amount,
    needsPermitSignature: p2Amount < amount || p2Expiration <= now,
    permit2Nonce: Number(nonce),
  };
}

/** A Permit2 PermitSingle for exactly `amount`, expiring with the swap deadline. */
export function permitFor(
  token: Address,
  amount: bigint,
  nonce: number,
  deadline: number,
): PermitSingle {
  return {
    details: { token, amount, expiration: deadline, nonce },
    spender: uniswapSepolia.universalRouter,
    sigDeadline: BigInt(deadline),
  };
}

export interface SwapCall {
  to: Address;
  data: Hex;
  value: bigint;
  minOut: bigint;
}

export function buildSwapCall(
  quote: Quote,
  opts: {
    slippageBps: number;
    deadline: number;
    permit?: { permit: PermitSingle; signature: Hex };
    layout?: ParamsLayout;
  },
): SwapCall {
  const minOut = minReceived(quote.amountOut, opts.slippageBps);
  const commands: number[] = [];
  const inputs: Hex[] = [];
  if (opts.permit) {
    commands.push(COMMANDS.PERMIT2_PERMIT);
    inputs.push(encodePermit2PermitInput(opts.permit.permit, opts.permit.signature));
  }
  commands.push(COMMANDS.V4_SWAP);
  inputs.push(
    encodeV4SwapInput(
      {
        key: quote.key,
        zeroForOne: quote.zeroForOne,
        amountIn: quote.amountIn,
        amountOutMinimum: minOut,
      },
      opts.layout ?? uniswapSepolia.v4ParamsLayout,
    ),
  );
  return {
    to: uniswapSepolia.universalRouter,
    data: encodeExecute(commands, inputs, BigInt(opts.deadline)),
    value: quote.tokenIn === NATIVE ? quote.amountIn : 0n,
    minOut,
  };
}

export interface SwapWarning {
  level: "danger" | "warning" | "info";
  message: string;
  blocking: boolean;
}

/** Pure pre-sign checks for a swap. */
export function assessSwap(input: {
  quote: Quote;
  slippageBps: number;
  deadlineMinutes: number;
  balanceIn: bigint;
  nativeBalance: bigint;
  maxGasCost: bigint;
  simulation: { ok: true } | { ok: false; reason: string };
}): { warnings: SwapWarning[]; canSwap: boolean; needsAcknowledgement: boolean } {
  const w: SwapWarning[] = [];
  const add = (level: SwapWarning["level"], message: string, blocking = false) =>
    w.push({ level, message, blocking });
  const { quote } = input;
  const native = quote.tokenIn === NATIVE;
  if (input.balanceIn < quote.amountIn)
    add("danger", "You don't have enough of the token you're selling.", true);
  if (input.nativeBalance < input.maxGasCost + (native ? quote.amountIn : 0n))
    add("danger", "Not enough ETH for this swap and its network fee.", true);
  if (!input.simulation.ok) add("danger", `Simulation failed: ${input.simulation.reason}`, true);
  if (quote.priceImpactBps >= 500)
    add(
      "danger",
      `Price impact is ${(quote.priceImpactBps / 100).toFixed(2)}%. You'd get much less than the market price.`,
    );
  else if (quote.priceImpactBps >= 100)
    add(
      "warning",
      `Price impact is ${(quote.priceImpactBps / 100).toFixed(2)}%, including the pool fee.`,
    );
  if (input.slippageBps > 300)
    add(
      "warning",
      `Slippage tolerance is ${input.slippageBps / 100}%. A higher tolerance makes front-running more profitable.`,
    );
  if (input.deadlineMinutes > 60)
    add("info", `The swap stays valid for ${input.deadlineMinutes} minutes.`);
  return {
    warnings: w,
    canSwap: !w.some((x) => x.blocking),
    needsAcknowledgement: w.some((x) => x.level === "danger" && !x.blocking),
  };
}
