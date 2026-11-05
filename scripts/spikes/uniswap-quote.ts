/**
 * Phase 0 spike: confirm Uniswap Sepolia deployments have code, find an
 * existing WETH/USDC pool on v3 and v4, and get one on-chain Quoter quote each.
 * Addresses from Uniswap docs (see packages/core/src/config/uniswap.ts).
 */
import { createPublicClient, http, parseEther, formatUnits, zeroAddress, type Address } from "viem";
import { sepolia } from "viem/chains";

const c = createPublicClient({
  chain: sepolia,
  transport: http("https://ethereum-sepolia-rpc.publicnode.com"),
});
const A = {
  v3Factory: "0x0227628f3F023bb0B980b67D528571c95c6DaC1c",
  v3QuoterV2: "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3",
  v4PoolManager: "0xE03A1074c86CFeDd5C142C4F04F1a1536e203543",
  v4Quoter: "0x61b3f2011a92d183c7dbadbda940a7555ccf9227",
  v4StateView: "0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c",
  universalRouter: "0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
} as const satisfies Record<string, Address>;

for (const [k, a] of Object.entries(A)) {
  const code = await c.getCode({ address: a });
  console.log(
    k.padEnd(16),
    a,
    code && code !== "0x" ? `code ${(code.length - 2) / 2}B` : "NO CODE",
  );
}

// ---- v3 ----
const factoryAbi = [
  {
    type: "function",
    name: "getPool",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }],
    outputs: [{ type: "address" }],
  },
] as const;
const poolAbi = [
  {
    type: "function",
    name: "liquidity",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint128" }],
  },
] as const;
const quoterV2Abi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;
const amountIn = parseEther("0.001");
for (const fee of [100, 500, 3000, 10000]) {
  const pool = await c.readContract({
    address: A.v3Factory,
    abi: factoryAbi,
    functionName: "getPool",
    args: [A.weth, A.usdc, fee],
  });
  if (pool === zeroAddress) {
    console.log(`v3 WETH/USDC ${fee}: no pool`);
    continue;
  }
  const liq = await c.readContract({ address: pool, abi: poolAbi, functionName: "liquidity" });
  let q: string;
  try {
    const { result } = await c.simulateContract({
      address: A.v3QuoterV2,
      abi: quoterV2Abi,
      functionName: "quoteExactInputSingle",
      args: [{ tokenIn: A.weth, tokenOut: A.usdc, amountIn, fee, sqrtPriceLimitX96: 0n }],
    });
    q = `0.001 WETH -> ${formatUnits(result[0], 6)} USDC (gas ~${result[3]})`;
  } catch (e) {
    q = `quote failed: ${String(e).split("\n")[0]?.slice(0, 80)}`;
  }
  console.log(`v3 WETH/USDC ${fee}: pool ${pool} liquidity ${liq} | ${q}`);
}

// ---- v4 (native ETH is currency0 = address(0)) ----
const v4QuoterAbi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          {
            name: "poolKey",
            type: "tuple",
            components: [
              { name: "currency0", type: "address" },
              { name: "currency1", type: "address" },
              { name: "fee", type: "uint24" },
              { name: "tickSpacing", type: "int24" },
              { name: "hooks", type: "address" },
            ],
          },
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
for (const [fee, tickSpacing] of [
  [100, 1],
  [500, 10],
  [3000, 60],
  [10000, 200],
] as const) {
  try {
    const { result } = await c.simulateContract({
      address: A.v4Quoter,
      abi: v4QuoterAbi,
      functionName: "quoteExactInputSingle",
      args: [
        {
          poolKey: {
            currency0: zeroAddress,
            currency1: A.usdc,
            fee,
            tickSpacing,
            hooks: zeroAddress,
          },
          zeroForOne: true,
          exactAmount: amountIn,
          hookData: "0x",
        },
      ],
    });
    console.log(
      `v4 ETH/USDC ${fee}/${tickSpacing}: 0.001 ETH -> ${formatUnits(result[0], 6)} USDC (gas ~${result[1]})`,
    );
  } catch (e) {
    console.log(`v4 ETH/USDC ${fee}/${tickSpacing}: ${String(e).split("\n")[0]?.slice(0, 90)}`);
  }
}
