/**
 * Phase 4 spike: which ExactInputSingleParams layout does the deployed Sepolia
 * Universal Router expect? Simulate (eth_call, nothing sent) an ETH→USDC swap
 * with each layout from the funded test wallet.
 */
import {
  COMMANDS,
  encodeExecute,
  encodeV4SwapInput,
  minReceived,
  quoteExactIn,
  uniswapSepolia,
  NATIVE,
  type ParamsLayout,
} from "@selfnode/core";
import { createPublicClient, http, parseEther, formatUnits } from "viem";
import { privateKeyToAddress } from "viem/accounts";
import { sepolia } from "viem/chains";

process.loadEnvFile(new URL("../../.env", import.meta.url).pathname);
const from = privateKeyToAddress(process.env.SEPOLIA_TEST_PRIVATE_KEY as `0x${string}`);
const client = createPublicClient({
  chain: sepolia,
  transport: http("https://ethereum-sepolia-rpc.publicnode.com"),
});

const amountIn = parseEther("0.0001");
const quotes = await quoteExactIn(client as never, {
  tokenIn: NATIVE,
  tokenOut: uniswapSepolia.tokens.usdc,
  amountIn,
});
for (const q of quotes)
  console.log(
    `fee ${q.key.fee}: ${formatUnits(q.amountOut, 6)} USDC, impact ${q.priceImpactBps / 100}%, liquidity ${q.liquidity}`,
  );
const best = quotes[0];
if (!best) throw new Error("no quotes");
const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
for (const layout of ["v4-launch", "per-hop-slippage"] as ParamsLayout[]) {
  const data = encodeExecute(
    [COMMANDS.V4_SWAP],
    [
      encodeV4SwapInput(
        {
          key: best.key,
          zeroForOne: best.zeroForOne,
          amountIn,
          amountOutMinimum: minReceived(best.amountOut, 50),
        },
        layout,
      ),
    ],
    deadline,
  );
  try {
    await client.call({ account: from, to: uniswapSepolia.universalRouter, data, value: amountIn });
    const gas = await client.estimateGas({
      account: from,
      to: uniswapSepolia.universalRouter,
      data,
      value: amountIn,
    });
    console.log(`${layout}: SIMULATION OK, gas ${gas}`);
  } catch (e) {
    console.log(
      `${layout}: reverted: ${String((e as Error).message)
        .split("\n")
        .slice(0, 2)
        .join(" ")
        .slice(0, 160)}`,
    );
  }
}
