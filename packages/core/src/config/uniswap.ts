/**
 * Uniswap deployments on Sepolia (11155111). Verified 2026-11-06: each address
 * has code on-chain and both Quoters returned quotes (scripts/spikes/uniswap-quote.ts).
 *
 * Sources (official Uniswap docs, github.com/Uniswap/docs):
 * - v4: https://docs.uniswap.org/contracts/v4/deployments  ("Sepolia: 11155111" table)
 *   content/protocols/v4/deployments.mdx
 * - v3: https://docs.uniswap.org/contracts/v3/reference/deployments/ethereum-deployments
 *   content/protocols/v3/deployments/v3-ethereum-deployments.mdx
 * - Sepolia WETH: same v3 page ("Wrapped Native Token" table)
 * - Sepolia USDC (Circle): https://developers.circle.com/stablecoins/usdc-contract-addresses
 *   (on-chain symbol() == "USDC" checked 2026-11-06)
 */
export const uniswapSepolia = {
  universalRouter: "0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b", // shared by v3 and v4 on Sepolia
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  v4: {
    poolManager: "0xE03A1074c86CFeDd5C142C4F04F1a1536e203543",
    quoter: "0x61b3f2011a92d183c7dbadbda940a7555ccf9227",
    stateView: "0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c",
    positionManager: "0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4",
  },
  v3: {
    factory: "0x0227628f3F023bb0B980b67D528571c95c6DaC1c",
    quoterV2: "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3",
  },
  tokens: {
    weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  },
} as const;
