/**
 * Which struct layout does the deployed router parse? Put an impossible
 * amountOutMinimum (2× quote) ONLY in the swap struct, with TAKE_ALL's min at 0.
 * The layout the router really parses must revert with V4TooLittleReceived.
 */
import {
  ACTIONS,
  COMMANDS,
  encodeExecute,
  quoteExactIn,
  uniswapSepolia,
  NATIVE,
} from "@selfnode/core";
import {
  concat,
  createPublicClient,
  encodeAbiParameters,
  http,
  numberToHex,
  parseEther,
  type Hex,
} from "viem";
import { privateKeyToAddress } from "viem/accounts";
import { sepolia } from "viem/chains";

process.loadEnvFile(new URL("../../.env", import.meta.url).pathname);
const from = privateKeyToAddress(process.env.SEPOLIA_TEST_PRIVATE_KEY as `0x${string}`);
const client = createPublicClient({
  chain: sepolia,
  transport: http("https://ethereum-sepolia-rpc.publicnode.com"),
});
const amountIn = parseEther("0.0001");
const [best] = await quoteExactIn(client as never, {
  tokenIn: NATIVE,
  tokenOut: uniswapSepolia.tokens.usdc,
  amountIn,
});
if (!best) throw new Error("no quote");
const impossible = best.amountOut * 2n;
const PK = {
  type: "tuple",
  components: [
    { name: "currency0", type: "address" },
    { name: "currency1", type: "address" },
    { name: "fee", type: "uint24" },
    { name: "tickSpacing", type: "int24" },
    { name: "hooks", type: "address" },
  ],
} as const;
const swapParams = (perHop: boolean): Hex =>
  perHop
    ? encodeAbiParameters(
        [
          {
            type: "tuple",
            components: [
              { name: "k", ...PK },
              { name: "z", type: "bool" },
              { name: "i", type: "uint128" },
              { name: "m", type: "uint128" },
              { name: "h", type: "uint256" },
              { name: "d", type: "bytes" },
            ],
          },
        ],
        [{ k: best.key, z: true, i: amountIn, m: impossible, h: 0n, d: "0x" }],
      )
    : encodeAbiParameters(
        [
          {
            type: "tuple",
            components: [
              { name: "k", ...PK },
              { name: "z", type: "bool" },
              { name: "i", type: "uint128" },
              { name: "m", type: "uint128" },
              { name: "d", type: "bytes" },
            ],
          },
        ],
        [{ k: best.key, z: true, i: amountIn, m: impossible, d: "0x" }],
      );
for (const perHop of [false, true]) {
  const actions = concat([
    numberToHex(ACTIONS.SWAP_EXACT_IN_SINGLE, { size: 1 }),
    numberToHex(ACTIONS.SETTLE_ALL, { size: 1 }),
    numberToHex(ACTIONS.TAKE_ALL, { size: 1 }),
  ]);
  const params = [
    swapParams(perHop),
    encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [NATIVE, amountIn]),
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      [uniswapSepolia.tokens.usdc, 0n],
    ),
  ];
  const data = encodeExecute(
    [COMMANDS.V4_SWAP],
    [encodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], [actions, params])],
    BigInt(Math.floor(Date.now() / 1000) + 600),
  );
  try {
    await client.call({ account: from, to: uniswapSepolia.universalRouter, data, value: amountIn });
    console.log(
      perHop ? "per-hop-slippage" : "v4-launch",
      "→ did NOT revert (router is not reading the minimum from this layout)",
    );
  } catch (e) {
    const m = String((e as Error).message);
    console.log(
      perHop ? "per-hop-slippage" : "v4-launch",
      "→ reverted:",
      m.match(/0x[0-9a-f]{8}/)?.[0] ?? "",
      m.split("\n")[0]?.slice(0, 120),
    );
  }
}
