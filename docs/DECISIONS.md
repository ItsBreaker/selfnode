# Decisions

Notable decisions and trade-offs, newest last. Dates are 2026-11-06 unless stated.

## Scope and order

Agreed order: Phases 0–4 (Private mode, wallet, explorer + Arkiv labels, swap),
then Phase 6 docs, then Phase 5 desktop (Electron + node manager, Sepolia only,
custom `app://` protocol), then the Swarm bonus. Core stays lean to leave time
for the node manager.

## Toolchain

- **TypeScript 6.0.3, not 7.x.** `typescript-eslint@8.72.1` declares
  `typescript >=4.8.4 <6.1.0`.
- **Install scripts.** pnpm 12 replaced `pnpm.onlyBuiltDependencies` with
  `allowBuilds` (in `pnpm-workspace.yaml`). Only `esbuild` is allowed (Vite needs
  its native binary). Everything else is blocked by pnpm's default.
- **Exact versions** via `savePrefix: ""`; lockfile committed.
- **Secret scan.** `scripts/dev/secret-scan.sh` runs `gitleaks protect --staged`
  when gitleaks is installed, with a grep fallback that never echoes full matches.
  CI runs `gitleaks/gitleaks-action` (free for personal-account repos).
- **CI actions pinned by commit SHA**, not tag.
- **Router:** `react-router` (one router, the more widely used of the two allowed).

## Keys

`scripts/keys/generate.ts` writes the Sepolia test key and the Arkiv mirror key
straight into `.env` (mode 600, gitignored) and prints only addresses. It never
overwrites an existing key.

## Public RPCs (probed 2026-11-06 from a dev machine)

| Chain   | Endpoint                            | blockNumber                     | eth_getProof   |
| ------- | ----------------------------------- | ------------------------------- | -------------- |
| Sepolia | ethereum-sepolia-rpc.publicnode.com | ok                              | yes            |
| Sepolia | sepolia.gateway.tenderly.co         | ok                              | yes            |
| Sepolia | 1rpc.io/sepolia                     | ok                              | no (paid plan) |
| Sepolia | sepolia.drpc.org                    | no (free plan excludes Sepolia) | —              |
| Sepolia | rpc.sepolia.org                     | timeout                         | —              |
| Mainnet | ethereum-rpc.publicnode.com         | ok                              | yes            |
| Mainnet | eth.drpc.org                        | ok                              | yes            |
| Mainnet | mainnet.gateway.tenderly.co         | ok                              | yes            |
| Mainnet | 1rpc.io/eth                         | ok                              | yes            |
| Mainnet | eth.llamarpc.com                    | HTML error page                 | —              |
| Mainnet | cloudflare-eth.com                  | "Cannot fulfill request"        | —              |

## Supply-chain: minimum release age

pnpm 12 enforces `minimumReleaseAge` (about one day) on every lockfile entry.
Installing `vite@8.3.6` (published under a day earlier) made pnpm silently add
a `minimumReleaseAgeExclude` entry to `pnpm-workspace.yaml`. We reverted that,
pinned `vite@8.3.5` (two weeks old) and regenerated the lockfile, so every
entry passes the policy with no exclusions. Rule: never add release-age exclusions.

## Phase 0 spikes

All browser spikes ran in headless Chromium (Brave 155 engine) via
`scripts/dev/run-spike.sh`; Node spikes live in `scripts/spikes/`.

### Anon-RPC (`apps/web/spikes/anon-rpc.spike.ts`)

viem's option is `http(url, { fetchFn: worker.fetch })`. Bootstrap provider:
a direct EIP-1193 shim over PublicNode (the one disclosed non-anonymised read).

| Network          | Ready    | Sepolia `eth_blockNumber` (1st / 2nd) | Mainnet (1st / 2nd) | 5-block batch | Exit IP ≠ ours |
| ---------------- | -------- | ------------------------------------- | ------------------- | ------------- | -------------- |
| **Nox**          | 3.5 s    | 2.9 s / 1.2 s                         | 1.0 s / 1.3 s       | 1.4–1.6 s     | yes            |
| **Nym**          | 7.6–16 s | 13 s / 2.4 s                          | 6.2 s / 1.3 s       | 3–6 s         | yes            |
| **Tor (tor-js)** | failed   | —                                     | —                   | —             | —              |

- **Tor:** the adopters list's demo gateway (`152.236.3.22:12298`) was
  unreachable ("all gateways failed"); Tor never got a consensus in 180 s. Tor
  stays selectable with a user-configured gateway, but is not the default.
- **Nym:** works, but the first call can exceed viem's 10 s default timeout.
  Transport timeout must be ≥ 30 s, with a visible "connecting" state.
- **Decision: default network = Nox.** Fastest and worked first time on both
  chains. Its specifier lives on Sepolia, so its bootstrap read goes to a Sepolia RPC.
- JSON-RPC batching works through the worker, so batch and multicall reads.
- Only a boolean comparing exit IPs was recorded; our own IP was never written down.
- **`eth_sendRawTransaction` works through Anon-RPC** (`apps/web/spikes/broadcast.spike.ts`).
  Two 1-wei self-transfers were signed in Node (`scripts/spikes/sign-sepolia-tx.ts`);
  only the signed raw tx reached the browser. Broadcast and receipt polling both
  went through the worker, with no direct fallback in the code path.
  - Nox: broadcast 1.9 s, receipt after 7.4 s, tx
    `0x41f65cbe8b3296b324b566939dc86a1c8749adb6c5b894fb069b4b4ae786f109` (block 12071773).
  - Nym: broadcast 13.1 s, receipt after 24.2 s, tx
    `0x968af0d78ffb0a95b04f1ab44927e63667b116a439d35ccab9fba8a86c10b51a` (block 12071776).
  - The signing helper read nonce and fees directly from PublicNode (spike only,
    throwaway key). The app reads them through Anon-RPC.

### Helios (`apps/web/spikes/helios.spike.ts`, `helios-node.spike.ts`)

- `@a16z/helios@0.12.0`'s `Config` accepts only `executionRpc`/`consensusRpc`
  URLs, with no fetch hook, so **Helios cannot ride Anon-RPC**. Decision (approved):
  Verified mode is a separate mode with a direct upstream or the user's own node,
  disclosed in the UI and privacy report.
- Lazy `import("@a16z/helios")` works (WASM 3.3 MB, loaded only on demand).
- **Mainnet works in the browser:** PublicNode execution + PublicNode beacon,
  with an explicit finalized checkpoint: sync 1.6 s, verified `eth_getBalance` 463 ms.
- Gotchas found:
  - Without an explicit `checkpoint`, bootstrap can 404 ("not a finalized
    checkpoint"). Fix: pass the latest finalized root from
    `/eth/v1/beacon/headers/finalized`. That makes the consensus endpoint a
    weak-subjectivity trust point; document it in the privacy report.
  - `lodestar-mainnet.chainsafe.io` synced but Helios's head stopped advancing
    ("out of sync: N seconds behind", growing). Reproduced in Node, so it's the
    endpoint, not the browser.
  - Running Sepolia then mainnet in one page failed with "invalid sync committee
    period": the localStorage checkpoint cache appears not to be namespaced per
    network. Use one Helios instance per page/network, or `dbType: "config"`.
- **Sepolia:** no public HTTPS consensus endpoint worked (PublicNode Sepolia
  has no light-client data; Lodestar Sepolia goes stale). Nimbus
  `http://unstable.sepolia.beacon-api.nimbus.team` works but is plain HTTP.
  Decision: Verified mode on Sepolia requires a user-supplied consensus URL
  (e.g. their own node). Verified mode defaults to mainnet reads.
- `eth_getProof`: see the RPC table above. PublicNode and Tenderly serve it on both chains.

### Arkiv (`scripts/spikes/arkiv-read.ts`, `apps/web/spikes/arkiv-anon.spike.ts`)

- **Keyless reads work.** `rabdi({ accessKey: "" })` uses the public endpoint.
  Owner-scoped queries ~330 ms; 30 sequential + 30 parallel reads, 0 failures.
  So the web app needs no key, and none is bundled.
- **Reads through Anon-RPC work** from the browser:
  `http(undefined, { fetchFn: worker.fetch })` via Nox, first query 2.2 s, then 1.6 s.
  Arkiv reads will count toward the Anon-RPC traffic share.
- A query needs at least one predicate; `ownedBy(owner)` satisfies this.
- **Write + keyless read-back works** (`scripts/spikes/arkiv-write.ts`). Entity
  `0x1127a6e7a79ccf8ab9af62ffd3787060eb9792b80de7b71860429129d975f9e2`, tx
  `0x3f244b78189e50b5f8d97640728990b80f239a63798517501453ca687f405f97`,
  3.3 s including inclusion; `getEntity` and the `ownedBy` query (keyless) ~300 ms each.
- **Access key goes in the `X-API-KEY` header, not the URL path.** We use
  `rabdi({ accessKey: "" })` (keyless URL) plus
  `http(undefined, { fetchOptions: { headers: { "X-API-KEY": key } } })`. Checked:
  the real key raises `ratelimit` from 2000 to 5000 and adds an
  `arkiv-quota-used-percent` header, and a bogus key gets 401, so the header is
  honoured. The key is redacted from any error output and never printed.

### Uniswap (`scripts/spikes/uniswap-quote.ts`)

- All Sepolia addresses from the official docs have code on-chain
  (`packages/core/src/config/uniswap.ts`). The Universal Router
  `0x3A9D…F98b` is shared by v3 and v4 on Sepolia.
- Existing liquid pools: v3 WETH/USDC at all four fee tiers and v4 native-ETH/USDC
  at all four (fee/tickSpacing 100/1, 500/10, 3000/60, 10000/200). On-chain
  quotes ≈ 26 USDC per 0.001 ETH from both Quoters.
- **Decision: v4.** The brief said v3 unless v4 proved quick. Quoting v4 was as
  easy as v3, and the expensive part of v4 (seeding a pool through
  PositionManager) is unnecessary because liquid ETH/USDC pools already exist.
  Native ETH in avoids a wrap step; Permit2 is only needed for token→ETH. v3
  stays as a fallback through the same Universal Router if v4 swap encoding
  stalls. `scripts/seed-pool.ts` becomes optional (only if pools dry up).

## Dependency audit (2026-11-06)

`pnpm audit`: 0 critical, 0 high, 1 moderate: `minimatch` ReDoS
(GHSA-g3hv-75wg-m249), reachable only via ESLint (dev-only). Accepted; will
update when ESLint ships a patched range.

## Phase 1: transport layer

- **One router** (`packages/core/src/transport/router.ts`) hands every feature its
  viem transport. Each JSON-RPC call is counted by route (`anon-rpc`, `bootstrap`,
  `helios-direct`, `my-node`, `direct-approved`); a batch counts per call.
- **Broadcasts always go through Anon-RPC**, in all three modes. Verified mode
  needs this too: Helios would otherwise send `eth_sendRawTransaction` straight to
  its upstream.
- **No silent fallback.** A failing worker rejects the call. A direct request
  needs `directOnce(chain, { userConfirmed: true })`, which is typed so it can't
  be used by accident, and is counted separately. Tests cover each of these.
- **Passthrough is blocked** unless `allowInsecureReferenceWorker` is set, and that
  flag is never persisted or restored from storage.
- **Anon transport timeout is 45 s**, because Nym's first call took 13 s in Phase 0.
- **Helios uses `dbType: "config"`** to avoid the un-namespaced localStorage
  checkpoint cache found in Phase 0.

## Phase 1: design system

- **Fonts:** Instrument Sans (400/500/600) for UI and JetBrains Mono (400/500) for
  addresses, hashes and amounts, self-hosted via `@fontsource`. Amounts use
  tabular, slashed-zero numerals.
- **Colour:** warm neutral base with one accent, a deep teal (`#0B5F5A` light,
  `#5BC0B4` dark). The accent doubles as the Private-mode colour, since Private is
  the default and "the mode is the product". Semantic colours: verified (blue),
  my node (graphite), warning (amber), danger (red). Tailwind's default palette,
  fonts, shadows and radii are switched off, so only our tokens exist.
- **WCAG AA is enforced by a test** (`apps/web/src/styles/tokens.test.ts`): 24
  foreground/background pairs per theme, with 4.5:1 for text and 3:1 for
  component borders and the focus ring.
- **Theme:** follows the system preference until the user picks, then remembers
  the choice. An inline script in `index.html` sets it before first paint. Its
  CSP hash will be added when we set the production CSP.
- **Mode indicator:** on small screens it hides the route detail only while the
  connection is healthy, so a problem is never shown by colour alone.
- **Radii are restrained** (3 px / 5 px). No gradients, glass or glow; one subtle
  popover shadow.

## Phase 1 follow-up (design feedback applied)

- **Accent is now neutral ink** (`#22262D` light / `#ECEAE4` dark) for buttons and
  links. Teal is reserved for Private mode, so mode colours carry meaning. Links
  are always underlined, because ink alone doesn't distinguish them.
- **Connection popover:** shows status, route, network, latency and Anon-RPC share,
  what the mode hides and doesn't (from `content/modes.ts`, shared with the
  Privacy page), a mode switch, and links to Privacy and Settings.
- **Labelled states:** Connecting, Slow (over 8 s average) and Unavailable appear as
  words, not just colour, and an amber "N direct" label appears whenever a
  user-approved direct request was made this session. Connection state comes from
  a pure, tested function (`deriveConnection`).
- **Wrong-chain detection:** on start, the app checks the endpoint's `eth_chainId`.
  A mismatch (e.g. a mainnet node configured for Sepolia) is a sticky failure
  until settings change.
- **44 px touch targets** below `sm` for buttons, segmented controls, inputs and
  icon buttons (an invisible hit area); radii stay tight.

## Phase 2: wallet

- **Vault:** scrypt (N=2^17, r=8, p=1; ~180 ms in Node, ~220 ms measured in
  headless Chromium) → AES-GCM (WebCrypto) with a random 32-byte salt and 12-byte
  IV. Version, kind, address, KDF parameters, salt and IV are bound as AES-GCM
  additional data, so tampering with any field fails decryption. Opening refuses
  KDF parameters above N=2^20 so a tampered blob can't exhaust memory. After
  decryption, the derived address must match the stored one. Stored in IndexedDB
  (`idb`). Desktop will additionally wrap it with Electron `safeStorage` (Phase 5).
- **Key in memory:** held as `Uint8Array` in a `WalletSession`, zeroed on lock
  (manual, after 1/5/10/30 minutes of inactivity, on `pagehide`, or on removal).
  viem needs a hex string to sign; strings can't be wiped, so the hex exists only
  for one signature. This is the practical limit in a browser, and it's documented.
- **Signer** (`packages/core/src/wallet/signer.ts`) is the only module that signs.
  Transactions and typed data must name a testnet chain ID; mainnet, unknown
  chains and a missing chain ID are refused, and only EIP-1559 transactions are
  signed. `personal_sign` isn't offered. Tests cover each case.
- **Pre-sign preview:** `gatherSendFacts` (I/O through the active route) plus
  `assessSend` (pure, tested). It covers the zero address, sending tokens to the
  token contract, flagged-label categories (wired to Arkiv in Phase 3), failed
  simulation, insufficient balance, contract recipients and brand-new addresses.
  Some dangers need an explicit acknowledgement; others block the send.
- **History:** only transactions sent from this device, stored locally. Full
  address history needs an archive node (Phase 3 says so in the explorer).
- **No ENS recipients yet**, and no Max button for ETH. Both are deferred.
- **End-to-end on Sepolia (2026-11-06):** a wallet created in the browser UI,
  funded by `scripts/fund-sepolia.ts`, sent 0.0005 ETH back through the UI.
  Signed in-browser, broadcast through Nox, confirmed
  (`0x41209be870e500c3d5e9929606393b0f5def955e059459ed0d739a4c933af54e`).
  Traffic for the session: 24 requests through Anon-RPC, 2 bootstrap reads,
  0 direct.

## Phase 3: explorer and Arkiv labels

- **Datasets (approved):** MyEtherWallet/ethereum-lists (contract labels + scam
  list, and Sepolia tokens), ethereum-lists/tokens (mainnet tokens),
  ethereum-lists/4bytes (capped). All MIT, no Sourcify. Rejected: Etherscan-scraped,
  GPL and unlicensed sources (see `arkiv/data-quality.md`).
- **Provenance on every entity:** `source`, `license`, `sourceCommit`, plus a
  `selfnode-dataset` entity per source holding the copyright line and full MIT
  text, so the notice travels with the data on Arkiv. Licence texts are also in
  `arkiv/licenses/`.
- **`rowKey` instead of `key`**, because Arkiv reserves `key`. That's a deviation
  from the brief's schema.
- **Long text in `bytes`** (Arkiv `str` caps at 128 bytes); short `str` fields are
  byte-fitted without splitting characters.
- **Lifetime 90 days**, extended when under 45 days remain. This is longer than the
  brief's "e.g. 30 days", so the data outlives judging, and costs about 1.5× a
  30-day create.
- **Function names ranked by usage:** standards first, then by selector frequency
  in the latest 300 mainnet blocks. 4bytes covered 444 of 2,777 sampled selectors
  (68.4% of calls). The cap of 5,000 didn't bind. Four v4 selectors are missing
  from 4bytes; Selfnode decodes its own Uniswap calls from ABIs in code.
- **Scam list wording:** "Flagged by MyEtherWallet's list", with the list's note,
  a link to the exact source commit, and "lists can include mistakes". In the
  wallet it's a danger the user must acknowledge, but the decision is theirs. A
  flagged address never gets the blue "verified label" tick.
- **Reads:** keyless, always `ownedBy(mirror)`, through Anon-RPC in every mode
  (`TransportRouter.anonFetch()`, counted as `anon-rpc`), batched per tick with
  chunks running in parallel, and cached in IndexedDB for 24 hours (including
  misses).
- **Explorer:** search (address, tx hash, block number, ENS through the active
  route), ⌘K, and address, transaction and block views. Address history is not
  shown: a standard RPC can't list it and we don't run an indexer. The UI says so.
- **EIP-7708-style native transfer logs:** Sepolia emits a `Transfer` log from
  `0xffff…fffe` for plain ETH transfers. The transaction view shows these as ETH.
- **Measured (browser, Nox, 2026-11-06):** a 50-row mainnet block view with
  labels and decoded methods took ~10 s cold; a flagged-address page took ~7 s.
  0 direct requests.

## Phase 4: swap (Uniswap v4, Sepolia)

- **v4 on the existing pools, no seeding.** Native ETH/USDC pools exist at all four
  standard tiers. `scripts/seed-pool.ts` isn't needed and wasn't written.
- **No Uniswap SDK.** The encoding is ~200 lines of viem
  (`packages/core/src/swap/v4.ts`), with constants verified against
  `Commands.sol` and `Actions.sol`. That's fewer dependencies and easier to audit.
- **Struct layout pinned to `v4-launch`.** The deployed Sepolia Universal Router
  predates v4-periphery #497. Its bytecode contains `V4TooLittleReceived` but none
  of the `*PerHop` errors. Both layouts simulate successfully with empty
  `hookData`, so bytecode was the only conclusive check
  (`scripts/spikes/uniswap-v4-*`). Recorded in `config/uniswap.ts` and FEEDBACK.md.
- **Quoting:** `quoteExactInputSingle` on the v4 Quoter for every standard tier,
  as `eth_call` through the active route (Anon-RPC by default), best output first.
  Price impact is measured against each pool's spot price from `StateView.getSlot0`
  and includes the pool fee.
- **Execution:** `execute(commands, inputs, deadline)` with `V4_SWAP` =
  `SWAP_EXACT_IN_SINGLE` + `SETTLE_ALL(maxIn)` + `TAKE_ALL(minOut)`. The minimum
  is enforced twice, in the swap params and in `TAKE_ALL`.
- **Permit2 for token input:** an ERC-20 approval to Permit2 for **exactly the
  swap amount** (not unlimited), then a `PermitSingle` signature (expiring with
  the swap deadline) passed as `PERMIT2_PERMIT` in the same router call. The
  signature goes through the testnet-only `signTypedData`.
- **Pre-sign checks** (`assessSwap`, tested): balance and gas blocking, failed
  simulation blocking, price impact ≥ 1% warns and ≥ 5% needs acknowledgement,
  slippage over 3% warns.
- **Defaults:** 0.5% slippage (0.1, 0.5, 1 or 3% offered), 20-minute deadline
  (1–180).
- **Verified end-to-end in the browser through Nox (2026-11-06):** ETH → USDC and
  USDC → ETH (approval + permit + swap). Session traffic: 95 through Anon-RPC,
  2 bootstrap, 0 direct. Hashes are in FEEDBACK.md.
- **Known limit:** standard tiers without hooks only. Pools with hooks or
  non-standard tick spacing aren't discovered.
- **Explorer UX (from review feedback):** the transaction view renders as soon as
  the transaction arrives; receipt, block time and logs fill in with skeletons.

## Phase 6: submission docs

- **Traffic-share number for the README:** 97.9% (95 of 97 calls), measured in a
  scripted end-to-end browser session: create a wallet, receive funds, swap both
  directions. The remaining 2 are the bootstrap reads; 0 direct. Shorter sessions
  show a lower share, because the 2 bootstrap reads are a fixed cost per session
  (e.g. 92.3% in the shorter send-only test).
- **Arkiv reach:** a standalone query example (`arkiv/examples/query.ts`, official
  SDK only, no Selfnode code, no key), verified against the live mirror, plus
  copy-paste recipes in `arkiv/reach.md`.
- **Anon-RPC adopters entry** prepared in `docs/anon-rpc-adopters-entry.md`, not
  opened.
- **Known limitation:** the mirrored scam list and contract labels are mainnet
  (chain 1) data. The send-time flagged-recipient check runs on Sepolia, so it has
  no Sepolia flags to match. The explorer shows mainnet flags.
- **Not done:** Cloudflare deployment, `wrangler` config and production security
  headers (CSP that permits the Anon-RPC sandbox). Desktop app and Swarm bonus are
  pending a decision.

## Deployment hardening

- **Cloudflare Worker, static assets only** (`apps/web/wrangler.jsonc`),
  `workers_dev: true`, placeholder name `selfnode-web`. `send_metrics: false`
  disables wrangler telemetry, and observability is off. Not deployed.
- **`html_handling: "none"`** is required. By default Cloudflare 307s
  `/anon-rpc-iframe.html` to `/anon-rpc-iframe`, where the main CSP and
  `X-Frame-Options: DENY` apply, so the sandbox can't load. That would have broken
  Private mode in production while working in dev. Both paths are also matched in
  `_headers`.
- **Strict CSP without `'unsafe-inline'`:**
  - The Anon-RPC harness's inline `srcdoc` bootstrap is replaced by a self-hosted
    `/anon-rpc-iframe.html`, emitted by a Vite plugin from the pinned harness
    package and passed as `iframeUrl`.
  - The inline theme script moved to `/theme-init.js`.
  - Asset inlining is off (`assetsInlineLimit: 0`), so small font subsets aren't
    `data:` URLs.
  - `connect-src` allows `https:`/`wss:` (user-chosen RPC, Helios and node
    endpoints, plus hash-pinned worker resolvers), local `http://127.0.0.1` and
    `localhost` (local node), and `data:` (Helios embeds its WASM as a data: URL).
    A node on a LAN IP over plain HTTP is blocked; use HTTPS or localhost.
  - The sandbox page has its own policy: `script-src 'self' blob: data:
'wasm-unsafe-eval'`, `worker-src blob: data:`, `frame-ancestors 'self'`.
- **Verified under the production headers** (`wrangler dev`, headless Chromium,
  2026-11-06): Nox, Nym, Helios Verified mode on mainnet, the swap page, Arkiv
  labels, and a full create → fund → swap both ways run (97 of 99 calls through
  Anon-RPC). Zero CSP violations and zero console errors.
- **Code splitting:** pages are route-level `lazy`; wallet crypto (scrypt, BIP-39)
  loads on create/unlock; the Arkiv SDK loads on the first label lookup; Helios
  (4.3 MB with inline WASM) loads only in Verified mode; core is marked
  `sideEffects: false`. The first load is 288 kB gzip (850 kB raw), down from
  342 kB gzip in one 1 MB bundle. What remains is mostly React, viem and the
  transport, which Overview needs for live chain data.
- **workerd's postinstall is explicitly denied** (`allowBuilds: workerd: false`).
  It only re-checks or re-downloads the platform binary, which pnpm already
  installs as an optional dependency, and `wrangler dev` works without it.
- **Deployed (2026-11-06, with the maintainer's OK)** with `wrangler deploy` to the
  existing `selfnode` Worker (config name changed from the placeholder so it
  targets that Worker, and so Cloudflare's Git builds accept it). Verified live:
  every path returns 200 with the intended headers, the sandbox page is served at
  `/anon-rpc-iframe.html` with its own CSP, and Nox, Helios (mainnet), Arkiv
  labels and the swap page run in headless Chromium with zero CSP violations.
