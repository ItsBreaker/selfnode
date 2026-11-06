# Demo script (3 minutes)

**Setup before recording**

- Open **https://selfnode.jhfe.workers.dev/** in a clean browser profile (or
  run `pnpm --filter @selfnode/web dev` locally).
- Have **two wallets** on the Wallet page, the first funded on Sepolia:
  `pnpm --filter @selfnode/scripts fund <address> 0.004`. (Wallets → Add wallet,
  or "Add an account from this recovery phrase".)
- Open Overview and Explore once so Nox is connected and the tables are warm
  (the first connection takes a few seconds).
- Keep a terminal ready in `arkiv/examples`.

| Time | Show                                                                                                | Say                                                                                                                                                                             |
| ---- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00 | Overview                                                                                            | "Every wallet leaks your IP and your addresses to an RPC provider, and depends on Etherscan and Uniswap's servers. Selfnode doesn't."                                           |
| 0:15 | Click the **mode indicator** to open the popover                                                    | "Private mode is the default. Every request goes through Anon-RPC, here over the Nox mixnet. If Nox fails, Selfnode switches to Nym and says so. Never to a direct connection." |
| 0:30 | **Explore**: Latest blocks and Latest transactions, live                                            | "A free Etherscan, without Etherscan: live blocks and transactions read through the mixnet. Method names come from our Arkiv mirror; addresses show labels or ENS names."       |
| 0:50 | **Wallet**: the active-wallet bar, then **Swap** next to Send: sell 0.0005 ETH, show the quote      | "Several wallets, one active, each its own encrypted vault. Swap opens right here: quotes from Uniswap's v4 Quoter contract as plain `eth_call`s. No Uniswap API, no API key."  |
| 1:10 | **Review swap**, show the preview, **Sign and swap**                                                | "Simulated first and explained in plain English. Signed on this device, testnet only, and broadcast through Nox." Wait for "Swap confirmed".                                    |
| 1:35 | Open the new tx in **Explore** (⌘K, paste the hash), then the sender's address: **Recent activity** | "The function name, `execute`, comes from Arkiv. The address page scans the latest blocks and says so: full history needs an index, and we don't fake it."                      |
| 2:00 | **Data** page: Labels → Flagged, then Function names, search `swap`                                 | "That's the Arkiv mirror, open to anyone without a wallet. Every row has its source, licence and commit. Flagged addresses name the list; we never call them a flat 'scam'."    |
| 2:20 | Terminal: `npx tsx query.ts` (or copy the page's "query this yourself" snippet)                     | "The same data, queried with only the official SDK and no key. It's refreshed daily by a GitHub Action, and snapshotted to Swarm."                                              |
| 2:40 | Settings → **Traffic**                                                                              | "In a full session, about 96% of calls went through Anon-RPC. The rest are disclosed bootstrap reads; none went direct. Network switches are counted here too."                 |
| 2:50 | Back to Overview                                                                                    | "Private by default, verifiable when you want it, on your own node when you have one. Open source, MIT."                                                                        |

**If something is slow:** Nox requests take 1–3 s, so pre-warm the pages you'll
show. Use **Test connection** in the connection menu to check Nox and Nym before
recording. While a network is still connecting, the indicator shows "retrying
(attempt n of 3)". If Nox fails, Selfnode switches to Nym, but only once Nym is
up (its first connection can take a minute or two), and switches back when Nox
answers again. If nothing is available, the app shows "Unavailable" and won't
fall back to a direct connection, which is the point.

**Optional extras, if there's time:** the **Privacy** page (what every third
party learns, per mode), and the Swarm mirror of the app
([swarm.md](../arkiv/swarm.md#the-web-app-on-swarm)).

## Desktop add-on (about 45 seconds, if there's time)

**Setup:**

- Install the [v0.1.2-hackathon](https://github.com/ItsBreaker/selfnode/releases/tag/v0.1.2-hackathon)
  build on an Apple Silicon Mac (right-click → Open the first time).
- Start the node at least an hour before recording, so it has peers and visible
  sync progress. If it's fully synced, even better: the app will already have
  switched to it.
- The v0.1.2 build includes the current web app (Explore tables, multiple
  wallets, Swap, failover and retries) and the Node page's real sync stages.

| Show                                                               | Say                                                                                                                                                                                     |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The **Node** page: pre-flight panel                                | "The desktop app can run your own pruned Sepolia node. Before anything starts, it checks your disk against Nethermind's and Nimbus's own published sizes, and keeps 50 GB or 10% free." |
| The **Logs** panel (Selfnode tab)                                  | "Both clients come only from their official GitHub releases, verified against pinned checksums before they run. Nimbus is checked twice. Nothing updates itself."                       |
| The **Status** panel: peers, slot                                  | "Nethermind and Nimbus are both minority clients, which is good for client diversity. RPC and Engine ports are bound to localhost only."                                                |
| If synced: the mode indicator showing **My node · 127.0.0.1:8545** | "Once synced, Selfnode reads from your own node. No RPC provider sees anything. Transactions still go out through the anonymity network, so your node's peers don't learn your IP."     |
