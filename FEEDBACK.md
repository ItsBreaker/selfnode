# Uniswap developer feedback

Notes from building Selfnode's swap: Uniswap v4 on Sepolia, quoted with
`eth_call` to the v4 Quoter and executed through the Universal Router, using
viem only (no Uniswap SDK, no Trading API, no API key). Written as we went,
2026-11-06.

## What worked well

- **On-chain quoting is all you need.** The v4 Quoter's
  `quoteExactInputSingle` over plain `eth_call` gave accurate quotes on the first
  try, including through an anonymity network (Anon-RPC). That's what makes a
  private swap UI possible: no request ever reaches a Uniswap server.
- **Native ETH in v4 is lovely.** `currency0 = address(0)` plus `msg.value`
  means ETH → token needs no wrapping and no approval at all.
- **Constants are easy to verify in the source.** `Commands.sol` (Universal
  Router) and `Actions.sol` (v4-periphery) are short and well named.
  `V4_SWAP` → `SWAP_EXACT_IN_SINGLE` → `SETTLE_ALL` → `TAKE_ALL` worked the first
  time we got the struct right (see below).
- **Permit2 via the router (`PERMIT2_PERMIT`, then `V4_SWAP`)** worked first time
  once the ERC-20 approval to Permit2 existed. Combining the permit and the swap
  in one router call is a good design.
- **The deployments page** has everything for Sepolia in one table (PoolManager,
  Universal Router, Quoter, StateView, Permit2), and every address checked out
  on-chain.

## What was confusing, or cost us time

1. **The deployed Sepolia Universal Router doesn't match `main`.**
   `IV4Router.ExactInputSingleParams` on `main` has a `minHopPriceX36` field
   (added in v4-periphery #497, Nov 2025), but the Sepolia router at
   `0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b` predates it. Worse, **with empty
   `hookData` both struct layouts simulate successfully**, so you can't find out
   which one is right by testing a normal swap. We had to check the deployed
   bytecode for the `*PerHop` error selectors to be sure (they're absent).
   _Suggestion:_ list the v4-periphery commit or version for each deployment on
   the deployments page, or expose a `version()` view on the router.
2. **No way to discover pools by pair on-chain.** A v4 `PoolKey` needs fee,
   tick spacing and hooks, and there's no lens that lists the pools for a pair.
   We quote all four standard tiers (100/1, 500/10, 3000/60, 10000/200) with no
   hooks, which works but would miss pools with hooks or non-standard spacing.
   _Suggestion:_ document the canonical fee → tick-spacing pairs prominently, and
   consider a lens for pool discovery.
3. **Price impact has no helper.** We compute it from `StateView.getSlot0`'s
   `sqrtPriceX96` (spot output = `amountIn · sqrtP² / 2¹⁹²`). A worked formula in
   the docs, including fee handling, would save every integrator from re-deriving
   it.
4. **Reverts are opaque without the full error ABI.** While testing slippage
   limits, router reverts surfaced as "Execution reverted for an unknown reason",
   because decoding them means collecting error definitions from several repos
   (Universal Router, v4-periphery, v4-core, Permit2). _Suggestion:_ publish a
   single combined error ABI that clients can decode against.
5. **Permit2's EIP-712 domain has no `version`.** That's correct (`{ name:
"Permit2", chainId, verifyingContract }`), but most EIP-712 domains have one,
   so it's an easy thing to get wrong. One explicit line in the Permit2 docs would
   help.
6. **Testnet pools are priced inconsistently between fee tiers.** On Sepolia, the
   0.3% ETH/USDC pool gave the best output in one direction and the 0.01% pool in
   the other. That's expected on a testnet, but worth a note in the docs so
   people don't think their quoting is broken.

## Bugs

- None found in the contracts. Issue 1 is a documentation and versioning gap,
  not a contract bug.

## Verified on Sepolia (2026-11-06)

- Node script, test wallet: ETH → USDC
  `0x5c595ba93f78f421f78a6db501bcf2ab1f488891c61e7088b96ea2171560fe93`; USDC
  approve-to-Permit2 `0x83de672529d716d062cc39662dac013fa9b7054a0213174dcf44f3c8a1bfc268`;
  USDC → ETH with `PERMIT2_PERMIT` `0x7929a5136b55ccf78bfb877bffc8f7a71cb92aea80123fe04abc9f0314c170e9`.
- Selfnode web UI, wallet created in the browser, all traffic through the Nox
  anonymity network: ETH → USDC
  `0x140aadf85708e32413dd9d719b0128cb0ebfdf7c8bde845b58b0ad1553e86a9e`; USDC →
  ETH via Permit2 `0x872b65f1234465a379af7ec85ba04c98dfef1f2f5c76352eee88879a41a8cdcf`.
