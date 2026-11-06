# Demo script (3 minutes)

**Setup before recording**

- Open **https://selfnode.jhfe.workers.dev/** in a clean browser profile (or
  run `pnpm --filter @selfnode/web dev` locally).
- Have a wallet created and funded on Sepolia: `pnpm --filter @selfnode/scripts
fund <address> 0.004`.
- Open the Overview once so Nox is already connected (the first connection takes
  a few seconds).
- Keep a terminal ready in `arkiv/examples`.

| Time | Show                                                                                                         | Say                                                                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00 | Overview                                                                                                     | "Every wallet leaks your IP and your addresses to an RPC provider, and depends on Etherscan and Uniswap's servers. Selfnode doesn't."                                            |
| 0:15 | Click the **mode indicator** to open the popover                                                             | "Private mode is the default. Every request goes through Anon-RPC, here over the Nox mixnet. The popover says exactly what this hides and what it doesn't."                      |
| 0:35 | **Privacy** page, scroll briefly                                                                             | "This is the full report: what every third party learns in each mode, every exception, and what you still trust."                                                                |
| 0:50 | **Swap**: sell 0.0005 ETH, show the pool table                                                               | "Quotes come from Uniswap's v4 Quoter contract, as plain `eth_call`s through the anonymity network. No Uniswap API, no API key. We quote every pool and show the price impact."  |
| 1:10 | **Review swap**, show the preview, **Sign and swap**                                                         | "Simulated first and explained in plain English. Signed on this device, testnet only, and broadcast through Nox." Wait for "Swap confirmed".                                     |
| 1:40 | Open the new tx in **Explore** (search the hash with ⌘K)                                                     | "Our own explorer. The function name, `execute`, comes from our Arkiv mirror, not from Etherscan."                                                                               |
| 2:00 | Settings → Network → **Ethereum**; open block view, then search `0x09750ad360fdb7a2ee23669c4503c974d86d8694` | "Token labels like USDT and USDC come from Arkiv. This address is flagged by MyEtherWallet's list. We name the source and the exact commit, and we never call it a flat 'scam'." |
| 2:25 | Terminal: `npx tsx query.ts`                                                                                 | "That data is public on Arkiv: 3,349 entities with MIT provenance on every row. Any wallet can query it with no key and no permission from us."                                  |
| 2:40 | Settings → **Traffic**                                                                                       | "In a full session, about 98% of calls went through Anon-RPC. The rest are the two disclosed bootstrap reads, and none went direct."                                             |
| 2:50 | Back to Overview                                                                                             | "Private by default, verifiable when you want it, on your own node when you have one. Open source, MIT."                                                                         |

**If something is slow:** Nox requests take 1–3 s, so pre-warm the pages you'll
show. If Nox is unavailable, say so. The app shows "Unavailable" and won't fall
back, which is the point.

## Desktop add-on (about 45 seconds, if there's time)

**Setup:**

- Install the [v0.1.0-hackathon](https://github.com/ItsBreaker/selfnode/releases/tag/v0.1.0-hackathon)
  build on an Apple Silicon Mac (right-click → Open the first time).
- Start the node at least an hour before recording, so it has peers and visible
  sync progress. If it's fully synced, even better: the app will already have
  switched to it.

| Show                                                               | Say                                                                                                                                                                                     |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The **Node** page: pre-flight panel                                | "The desktop app can run your own pruned Sepolia node. Before anything starts, it checks your disk against Nethermind's and Nimbus's own published sizes, and keeps 50 GB or 10% free." |
| The **Logs** panel (Selfnode tab)                                  | "Both clients come only from their official GitHub releases, verified against pinned checksums before they run. Nimbus is checked twice. Nothing updates itself."                       |
| The **Status** panel: peers, slot, ETA                             | "Nethermind and Nimbus are both minority clients, which is good for client diversity. RPC and Engine ports are bound to localhost only."                                                |
| If synced: the mode indicator showing **My node · 127.0.0.1:8545** | "Once synced, Selfnode reads from your own node. No RPC provider sees anything. Transactions still go out through the anonymity network, so your node's peers don't learn your IP."     |
