/**
 * Uniswap v4 swap encoding for the Universal Router, built with viem only
 * (no Uniswap SDK). Constants verified against Uniswap's source:
 * - Commands: github.com/Uniswap/universal-router contracts/libraries/Commands.sol
 *   V4_SWAP = 0x10, PERMIT2_PERMIT = 0x0a
 * - Actions: github.com/Uniswap/v4-periphery src/libraries/Actions.sol
 *   SWAP_EXACT_IN_SINGLE = 0x06, SETTLE_ALL = 0x0c, TAKE_ALL = 0x0f
 * - ExactInputSingleParams: src/interfaces/IV4Router.sol. The struct gained a
 *   `minHopPriceX36` field in Nov 2025 (#497); older deployments don't have it,
 *   so the layout is selectable and verified against the deployment by simulation.
 */
import {
  concat,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  numberToHex,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";

export const COMMANDS = { V4_SWAP: 0x10, PERMIT2_PERMIT: 0x0a } as const;
export const ACTIONS = { SWAP_EXACT_IN_SINGLE: 0x06, SETTLE_ALL: 0x0c, TAKE_ALL: 0x0f } as const;

export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

export const NATIVE = zeroAddress;

const POOL_KEY_TUPLE = {
  type: "tuple",
  components: [
    { name: "currency0", type: "address" },
    { name: "currency1", type: "address" },
    { name: "fee", type: "uint24" },
    { name: "tickSpacing", type: "int24" },
    { name: "hooks", type: "address" },
  ],
} as const;

/** v4 PoolId = keccak256(abi.encode(PoolKey)). */
export function poolId(key: PoolKey): Hex {
  return keccak256(encodeAbiParameters([POOL_KEY_TUPLE], [key]));
}

/** Standard fee tiers and their tick spacings, no hooks. */
export const STANDARD_TIERS = [
  { fee: 100, tickSpacing: 1 },
  { fee: 500, tickSpacing: 10 },
  { fee: 3000, tickSpacing: 60 },
  { fee: 10000, tickSpacing: 200 },
] as const;

/** Sort two currencies into a v4 PoolKey (currency0 < currency1). */
export function poolKeyFor(
  a: Address,
  b: Address,
  tier: { fee: number; tickSpacing: number },
): PoolKey {
  const [c0, c1] = BigInt(a) < BigInt(b) ? [a, b] : [b, a];
  return {
    currency0: c0,
    currency1: c1,
    fee: tier.fee,
    tickSpacing: tier.tickSpacing,
    hooks: zeroAddress,
  };
}

export type ParamsLayout = "v4-launch" | "per-hop-slippage";

export interface ExactInSingle {
  key: PoolKey;
  zeroForOne: boolean;
  amountIn: bigint;
  amountOutMinimum: bigint;
  hookData?: Hex;
}

function encodeExactInSingle(p: ExactInSingle, layout: ParamsLayout): Hex {
  const base = [
    { name: "poolKey", ...POOL_KEY_TUPLE },
    { name: "zeroForOne", type: "bool" },
    { name: "amountIn", type: "uint128" },
    { name: "amountOutMinimum", type: "uint128" },
  ] as const;
  if (layout === "v4-launch") {
    return encodeAbiParameters(
      [{ type: "tuple", components: [...base, { name: "hookData", type: "bytes" }] }],
      [
        {
          poolKey: p.key,
          zeroForOne: p.zeroForOne,
          amountIn: p.amountIn,
          amountOutMinimum: p.amountOutMinimum,
          hookData: p.hookData ?? "0x",
        },
      ],
    );
  }
  return encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          ...base,
          { name: "minHopPriceX36", type: "uint256" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    [
      {
        poolKey: p.key,
        zeroForOne: p.zeroForOne,
        amountIn: p.amountIn,
        amountOutMinimum: p.amountOutMinimum,
        minHopPriceX36: 0n,
        hookData: p.hookData ?? "0x",
      },
    ],
  );
}

/**
 * The V4_SWAP command input: SWAP_EXACT_IN_SINGLE, then SETTLE_ALL (pay at most
 * amountIn of the input) and TAKE_ALL (receive at least amountOutMinimum).
 */
export function encodeV4SwapInput(p: ExactInSingle, layout: ParamsLayout): Hex {
  const input = p.zeroForOne ? p.key.currency0 : p.key.currency1;
  const output = p.zeroForOne ? p.key.currency1 : p.key.currency0;
  const actions = concat([
    numberToHex(ACTIONS.SWAP_EXACT_IN_SINGLE, { size: 1 }),
    numberToHex(ACTIONS.SETTLE_ALL, { size: 1 }),
    numberToHex(ACTIONS.TAKE_ALL, { size: 1 }),
  ]);
  const params = [
    encodeExactInSingle(p, layout),
    encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [input, p.amountIn]),
    encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [output, p.amountOutMinimum]),
  ];
  return encodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], [actions, params]);
}

// ---------------------------------------------------------------- Permit2
export const PERMIT_SINGLE_TYPES = {
  PermitDetails: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint160" },
    { name: "expiration", type: "uint48" },
    { name: "nonce", type: "uint48" },
  ],
  PermitSingle: [
    { name: "details", type: "PermitDetails" },
    { name: "spender", type: "address" },
    { name: "sigDeadline", type: "uint256" },
  ],
} as const;

export interface PermitSingle {
  details: { token: Address; amount: bigint; expiration: number; nonce: number };
  spender: Address;
  sigDeadline: bigint;
}

/** EIP-712 typed data for a Permit2 PermitSingle (signed by the testnet-only signer). */
export function permit2TypedData(permit2: Address, chainId: number, permit: PermitSingle) {
  return {
    domain: { name: "Permit2", chainId, verifyingContract: permit2 },
    types: PERMIT_SINGLE_TYPES,
    primaryType: "PermitSingle" as const,
    message: permit,
  };
}

/** The PERMIT2_PERMIT command input: abi.encode(PermitSingle, signature). */
export function encodePermit2PermitInput(permit: PermitSingle, signature: Hex): Hex {
  return encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "details", type: "tuple", components: PERMIT_SINGLE_TYPES.PermitDetails },
          { name: "spender", type: "address" },
          { name: "sigDeadline", type: "uint256" },
        ],
      },
      { type: "bytes" },
    ],
    [permit, signature],
  );
}

// ---------------------------------------------------------------- Universal Router
export const UNIVERSAL_ROUTER_ABI = [
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      { name: "commands", type: "bytes" },
      { name: "inputs", type: "bytes[]" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export function encodeExecute(commands: number[], inputs: Hex[], deadline: bigint): Hex {
  return encodeFunctionData({
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: "execute",
    args: [concat(commands.map((c) => numberToHex(c, { size: 1 }))), inputs, deadline],
  });
}
