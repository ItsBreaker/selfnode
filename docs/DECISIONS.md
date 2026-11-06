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
- **Max for ETH (added in Phase 7):** balance minus buffered gas × the larger
  of 2× the max fee or fee + 1 gwei. Sepolia fees are a few wei and move
  between Max and Review, so a 10% margin failed review in testing; review
  still re-checks everything and blocks rather than sends if fees jump past
  the reserve.
- **Show the recovery phrase again (Phase 7):** always asks for the password
  and decrypts the vault afresh; hidden on Hide, after two minutes, on tab hide
  or lock.
- **Still no ENS recipients.** In Private mode the name would be resolved by an
  unverified public RPC, which could return any address; doing this safely
  needs Verified-mode resolution and a clear "resolved to" confirmation. Deferred.
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

- **Traffic-share number for the README:** 97.9% (95 of 97 calls; superseded by
  98.0%, 97 of 99, re-measured on the production build below), measured in a
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

## Phase 5: desktop (Electron)

- **Anon-RPC sandbox under `app://`: works. No fallback needed** (checked
  2026-11-06 at 14:58, about 4 minutes into the 90-minute window). The production
  web build is served from `app://selfnode` with the website's `_headers`, in a
  `contextIsolation` + `sandbox` window without `nodeIntegration`. Results:
  Nox (live block in 6.7 s), Nym (26 s), Helios Verified mode on mainnet with its
  WASM (5.1 s) and Arkiv labels through Nox (7.2 s), all with zero CSP violations
  and zero console errors. The harness's same-origin `iframeUrl` check passes
  because `app` is registered as a standard, secure scheme.
- **One source of truth for headers:** the desktop protocol handler parses the
  web build's `_headers` (tested against the real file), so the app and the
  website enforce the same CSP.
- **`ELECTRON_RUN_AS_NODE` gotcha:** VS Code sets it for child processes, which
  makes Electron run as plain Node (`protocol` is undefined). `launch.mjs` clears
  it for `pnpm start`.
- **Electron 45.2.2:** the newest release older than pnpm's minimum release age.
  Its postinstall (binary download from Electron's GitHub releases, checked
  against SHA-256 sums) is allowed in `allowBuilds`.
- **Execution client: Nethermind, not Geth** (the maintainer's decision). Geth no
  longer publishes official macOS binaries: its store's last macOS build is
  1.15.6 (about March 2025), too old for today's Sepolia, and its downloads page
  points Mac users to Homebrew. Nethermind 2.2.2 publishes official macOS ARM64,
  macOS x64 and Windows x64 builds with GitHub-recorded SHA-256 digests.
  Nethermind + Nimbus are both minority clients, which helps client diversity.
- **Consensus client: Nimbus 26.10.2** on macOS ARM64 and Windows x64. Neither
  Nimbus nor Lighthouse publishes an Intel macOS build, so Intel Macs get a "not
  supported on this Mac" message rather than an unofficial binary.
- **Verification:** the archive must match the SHA-256 pinned from the GitHub
  release digest. For Nimbus, the extracted `nimbus_beacon_node` must also match
  the SHA-512 in its release notes (both were checked for macOS and Windows when
  the manifest was written). A whole-tree hash of each install is re-checked
  before every start. There's no gpg on the build machine, so `.asc` signatures
  aren't checked.
- **Disk-minimising flags** (cited in `src/node/manager.ts`): Nethermind
  `--config sepolia`, `Sync.DownloadBodiesInFastSync=false`,
  `Sync.DownloadReceiptsInFastSync=false`, `History.Pruning=Rolling` (82125-epoch
  minimum window), `Pruning.Mode=Hybrid` with `FullPruningTrigger=VolumeFreeSpace`;
  Nimbus `trustedNodeSync --backfill=false` and `--history=prune`. Every flag was
  checked against the shipped binaries' `--help`.
- **Disk figures (official):** Nethermind's measured 2.2.0 database sizes. Sepolia
  is 893 GB with the default config, of which blocks are 548 GB and receipts
  132 GB. Keeping only state, headers, code and blobs gives about 212 GB for
  Sepolia and about 325 GB for mainnet. Nimbus's hardware guide says 200 GB.
  Growth: Nethermind's "around 30 GB each week" for state, with 4 weeks buffered.
  So Sepolia needs 532 GB and mainnet 645 GB, plus the larger of 50 GB or 10% free.
- **Would mainnet fit in 800 GB?** The initial sync, yes: 645 GB plus about
  90 GB of margin. Long term it's tight. State grows about 30 GB a week, and
  Nethermind's full pruning wants at least 250 GB of free headroom while it runs,
  so an 800 GB drive would need regular pruning or resyncs. Nethermind's docs
  recommend 2 TB. This build is Sepolia-only.
- **Verified locally (macOS ARM64, 2026-11-06)**, driven through the UI:
  pre-flight passed (883 GB free vs 532 + 99 margin); both clients were
  downloaded and verified; checkpoint sync; Nethermind reached 6–7 peers and Nimbus
  2–4 within a minute; RPC 8545, Engine 8551 and REST 5052 bound to 127.0.0.1;
  a clean stop left no client processes. A bad IPC argument was rejected.
  `require` and `process` are undefined in the page.
- **Packaging:** electron-builder 26.18.1, universal unsigned `.dmg` (225 MB) and
  NSIS `.exe`, `publish: null`. The node binaries aren't bundled; they're
  downloaded and verified at runtime. The packaged app was re-tested (Nox, Helios,
  node pre-flight). electron-winstaller's install script (Squirrel, unused) is denied.
- **Windows shutdown (researched; no new dependencies).** Node's `child.kill()`
  on Windows always terminates the process; delivering Ctrl+C to a console
  process needs native code (`GenerateConsoleCtrlEvent` with a shared console).
  - Nethermind's JSON-RPC `admin` namespace has no shutdown method. It does have
    `admin_pauseBlockProcessing`, documented as "intended for testing and
    diagnostics". It stops block processing but doesn't pause the initial snap
    sync's writes. On Windows only, Selfnode enables the `Admin` module (RPC is
    still bound to 127.0.0.1), calls it, and waits for
    `admin_isBlockProcessingPaused` before stopping.
  - Nimbus has no shutdown endpoint. `beacon_chain/process_state.nim` stops
    cleanly only on SIGINT (SIGTERM isn't generated on Windows), so it's
    force-killed.
  - So the Windows node manager is labelled **experimental** in the UI and README:
    a stop may require a resync.
- **Stricter "synced" for the auto-switch:** besides both clients reporting
  done, with peers and a head, the execution head must be under 2 minutes old
  (`isSynced`, tested). The switch to local reads happens once, so a later
  manual switch back sticks.
- **Manifest reviewed by the maintainer (2026-11-06):** the URLs are official, all
  four SHA-256s match the GitHub release digests, and the Nimbus SHA-512s match
  its release notes. `maintainerReviewed` is set to true.
- **Where the Sepolia disk figures come from, and why they're conservative.**
  - **Execution, 212 GB:** Nethermind's published per-directory database sizes
    for a Sepolia node on 2.2.0 (`flat` 181 GB + `headers` 5.1 GB + `code` 24 GB +
    `blobTransactions` 1.3 GB, rounded up). Historical `blocks` and `receipts`
    (548 + 132 GB) are excluded because Selfnode doesn't download them.
  - **Consensus, 200 GB:** Nimbus's hardware guide, which is a general figure
    (written with mainnet in mind). A pruned Sepolia beacon database is far
    smaller, so this overstates it.
  - **Growth, 30 GB/week for 4 weeks:** Nethermind's state-growth figure is for
    mainnet; Sepolia's state grows more slowly.

  We deliberately use the larger published numbers: refusing to start on a drive
  that might fit is better than filling someone's disk. The low-disk watchdog
  (50 GB or 10%) is the second safety net.

- **Checkpoint sync is a trust point.** It's listed on the Privacy page as a third
  party (it sees your IP once) and as something you trust (it chooses the state
  Nimbus starts from).
- **GPG signatures:** Nethermind publishes `.asc` signatures for each build.
  Verifying them is a planned improvement (there's no gpg on the build machine,
  and we'd need to pin Nethermind's signing key). Nimbus publishes none, hence the
  extra SHA-512 check.

## Windows graceful shutdown (verified in CI, 2026-11-06)

This supersedes the "experimental on Windows" entries above.

- **Mechanism (no new dependencies or binaries):**
  - **Start:** the client is started by a PowerShell launcher using `Start-Process`,
    which (per PowerShell's `Process.cs`) uses `CREATE_NEW_CONSOLE`, not
    `CREATE_NEW_PROCESS_GROUP`. So the client gets its own hidden console. stdout
    and stderr go to log files that the app tails. The launcher reports the PID and
    exit code; `$p.Handle` is read early, because PowerShell otherwise loses `ExitCode`.
  - **Stop:** an inline `Add-Type` C# helper runs `FreeConsole` →
    `AttachConsole(pid)` → `SetConsoleCtrlHandler(NULL, TRUE)` →
    `GenerateConsoleCtrlEvent(CTRL_C_EVENT, 0)`. Only the client is on that
    console. We wait 60 s, and only then force-kill, logging it.
- **Three Windows-specific problems the CI test found** (each fixed):
  1. `tar` on PATH was Git's GNU tar, which can't read `.zip`. We now always use
     `%SystemRoot%\System32\tar.exe` (bsdtar), and `/usr/bin/tar` on macOS,
     which also prevents PATH hijacking.
  2. Nimbus refused a pre-created data folder ("Data folder has insecure ACL").
     Nimbus now creates its own folder, with owner-only access.
  3. The clients inherited "ignore Ctrl+C" from the processes that started them,
     so the event was delivered (helper returned 0) but ignored. The launcher now
     calls `SetConsoleCtrlHandler(NULL, FALSE)` first; that state is inherited by
     child processes (Win32 docs).
- **What "clean" means** (asserted by `.github/workflows/node-shutdown.yml` on
  windows-latest and macos-latest):
  - The client exited by itself after the interrupt (no force-kill).
  - Its exit code is the documented clean-interrupt code: Nethermind **130**
    (`ExitCodes.SigInt = 130; // 128 + 2`), Nimbus **0**.
  - It printed its own final line: Nethermind's `Nethermind is shut down`
    (`Program.cs`), and Nimbus's `Databases closed`.
  - Nethermind colourises its output, so lines are stripped of ANSI codes first.
- **Results:** Windows: Nimbus stopped in 2 s (exit 0), Nethermind in 1 s
  (exit 130). macOS: Nimbus 1 s (exit 0), Nethermind under 1 s (exit 130).
  Every assertion passed.
- **Quit, OS shutdown and log-off:**
  - `before-quit` keeps the app alive until both clients have stopped.
  - macOS/Linux: `powerMonitor` `shutdown` with `preventDefault()`.
  - Windows: the window's `query-session-end` with `preventDefault()`, plus a
    best-effort stop on `session-end`.
- **Damage detection:** a per-client `.running` marker is removed only after a
  verified clean exit. If it's found on the next start, the Node page warns about
  an unclean stop. If a client dies at startup with Nethermind's
  `DbCorruption = 109` exit code, or a database error in its log, the page offers
  a one-click **resync from checkpoint**. It deletes that client's data only after
  a native confirmation dialog.
- **UPnP / NAT-PMP off by default:** Nethermind `--Network.EnableUPnP false`
  ("Whether to enable automatic port forwarding via UPnP. Defaults to false",
  set explicitly) and Nimbus `--nat=none` (its default `any` tries UPnP and
  NAT-PMP; networking guide: "By default, Nimbus uses UPnP").
- **Label:** "Experimental on Windows" became "Tested in CI on Windows; graceful
  shutdown verified" (UI and README) once the CI job passed.
- **The v0.1.0-hackathon Windows build predates this work.** Its notes say
  "experimental" and now point to v0.1.1-hackathon, the first release with
  graceful Windows shutdown, UPnP/NAT-PMP off, and damage detection with resync.

## Swarm snapshots (2026-11-06, reduced scope)

- **Gateway, not a Bee node.** No postage batch or Bee node was available, so
  snapshots are uploaded through the **bzz.limo public gateway**, as the Swarm
  team suggested. It stamps uploads with its own batch; the batch ID and
  lifetime aren't exposed (no `/stamps`, `/tags`, `/stewardship`: all 404), so
  retention is unknown. Reads fall back to `api.gateway.ethswarm.org`.
- **Plain `fetch`, no new dependency.** `POST /bzz` returns the reference, so
  neither `@ethersphere/swarm-cli` nor `@ethersphere/bee-js` is in the repo.
- **The feasibility test used `npx`, outside our policy, and only in `/tmp`.**
  `npx --yes @ethersphere/swarm-cli@3.7.0` (published by Swarm's
  `ethersphereowner` / `ethswarm-devops` npm accounts from
  github.com/ethersphere/swarm-cli) pinned the CLI but resolved its own
  dependencies (bee-js, ethers, ws, …) to their latest matching versions,
  **outside our minimum-release-age policy**. It ran from `/tmp` only, against a
  47-byte test file; nothing from it is in the repo, the lockfile or any
  workspace package.
- **Snapshots are an export of Arkiv, not a re-read of the sources**, so the
  archive is exactly what's mirrored. Canonical JSON (sorted rows and keys, no
  timestamps inside) gives a stable SHA-256 and Swarm reference; unchanged data
  means no new entity write.
- **Trust:** the `selfnode-snapshot` entity (owner-scoped) carries the file's
  SHA-256; `--from-swarm` rejects any download that doesn't match, then
  recomputes every row's `contentHash` before writing anything back.
- **First upload:** 3 snapshot entities, 0.000992 tGLM; balance stayed far above
  the 2 tGLM reserve.
- **App: "Load labels from the Swarm archive" (Settings), opt-in only.** A
  gateway sees the reader's IP and Anon-RPC only carries JSON-RPC, so it's never
  automatic and never remembered: one click, for this session. The expected
  SHA-256s come from the snapshot entities on Arkiv (read through Anon-RPC); if
  Arkiv is unreachable, from pointers pinned in the build. Once loaded, the
  archive answers label and function-name lookups first (shown as "from the
  Swarm archive"); misses still go to Arkiv. Listed on the Privacy page and in
  the README's exceptions table.
- **CSP:** `connect-src` already allows `https:` (users pick their own RPC,
  Helios and node endpoints), so bzz.limo needed no new entry. Narrowing it to
  the gateway would have broken custom endpoints; the opt-in gate is in the app,
  not the CSP.

## Node page: real sync stages instead of a block-number ETA (2026-11-06)

- **Why:** during snap sync Nethermind's `eth_syncing` reports `currentBlock: 0`
  until the state download finishes, so a block-rate ETA stays on
  "estimating…" for hours. Seen on a real Sepolia node: Nethermind `#0 /
12,077,382`, 3–7 peers, `health_nodeStatus` "Still syncing"; Nimbus at the
  head (`sync_distance` 0) but `is_optimistic: true`, waiting for the execution
  client.
- **Nethermind's own stage RPC exists but stays off:** `debug_getSyncStage`
  answers "namespace 'Debug' is disabled". We keep the Debug namespace off on
  the RPC port, so the stage comes from Nethermind's log lines, which the manager
  already receives. The markers (`Sync mode changed from … to …`, `Snap … State
Ranges (Phase 1 of 2)`, `State Sync (Phase 2 of 2, healing)`, `Beacon/Old
Headers`, `Waiting for peers...`) are strings in the shipped 2.2.2 binary;
  unknown modes are shown as-is.
- **Nimbus:** from `/eth/v1/node/syncing` (`is_syncing`, `sync_distance`,
  `is_optimistic`, `el_offline`).
- **No guessed ETA:** a percentage only when the client printed one; "Time to
  sync" only from a measured block rate while catching up blocks, otherwise it
  says it isn't estimated and why.
- **Not released:** in `main` for the **next desktop build**; v0.1.1-hackathon
  doesn't have it. The exact log layouts beyond these markers should be checked
  against a live node's Logs panel when that build is made.

## Anon-RPC bootstrap hardening (2026-11-06)

- **Worker code pinning (trust on first use).** The harness reads the
  specifier's `workerHash()` through our bootstrap provider, then only runs a
  bundle whose keccak-256 matches it. The provider now inspects that result
  before handing it back: after the first successful boot the hash is stored per
  network (`localStorage`, `selfnode:worker-pins`). On later boots a different
  hash pauses the boot and asks: "The anonymity network's code changed since you
  last used it", showing the old and new hash and the specifier. **Use the new
  code** re-pins after the worker boots; **Cancel** (the default focus, also on
  Escape or closing the dialog) fails the boot with a clear error, keeps the old
  pin, and nothing falls back to a direct connection. Without a dialog handler
  (e.g. in core tests) a change is always refused.
- **What this does and doesn't protect against:** a changed specifier (an
  upgrade, or a compromised or impersonated contract or bootstrap RPC) can no
  longer swap the code silently on a device that has used the network before.
  A first-ever boot still trusts the hash it's given.
- **Bootstrap through your own node.** In My node mode the specifier read goes to
  the user's node for the specifier's chain (Sepolia for Nox), counted as "Your
  node", so the public bootstrap RPC isn't contacted. For Nym and Tor (specifier
  on Ethereum) with a Sepolia-only node it's still the disclosed public read.
  When the desktop node becomes synced and the app switches to My node mode, the
  next boot uses the node; an already-running worker isn't restarted. If the
  node can't answer, the boot fails visibly: no silent switch to the public
  bootstrap RPC.
- **Tests:** pin on first boot, refuse without consent, ask then re-pin only on
  accept, no prompt when unchanged, node route vs public route. Verified in the
  browser against the real Nox specifier: fresh pin, Cancel (connection
  "Unavailable" with the reason, pin kept), and Accept (ready, re-pinned).

## The web app on Swarm (2026-11-06)

- **Published**, because Private mode works from it: first production build
  `cf55cea`, re-uploaded as `970e60f` with frame-busting (see below), now at https://bah5acgza24rt5fzsundf6gykleqgqmhtpzrmc2bd2fwx66hixe6z6wcdzura.bzz.limo/
  (reference `d7233e9732a3465f…`), recorded as a `selfnode-snapshot` entity
  with `dataset = "web"`. Tested end to end: Nox through the sandbox iframe,
  reads, Arkiv, the Data page, a deep-link reload, no CSP violations.
- **Meta CSP instead of headers.** The CSPs from `_headers` are injected as
  `<meta>` tags right after `<meta charset>` in `index.html` and the sandbox
  page. Enforcement was checked (inline and third-party scripts blocked).
  `frame-ancestors`, `X-Frame-Options`, COOP and HSTS can't be set this way, so
  the Swarm copy is frameable; Cloudflare stays primary.
- **Why the CID subdomain:** the app uses root-absolute paths
  (`/assets/…`, `/anon-rpc-iframe.html`). `bzz.limo/bzz/<ref>/` serves the
  files under a path prefix where those don't resolve; `<cid>.bzz.limo` gives
  the build its own origin. `bzz.link` and `api.gateway.ethswarm.org` refuse to
  serve websites (redirect to `bzz.link/forbidden`), though they served our JSON
  snapshots.
- **The in-app archive ignores it:** `loadArchive` only takes the `tokens`,
  `labels` and `sigs` snapshot entities (deployed before the `web` entity was
  written, so the live archive never saw it).

## Anonymity-network failover (2026-11-06)

- **When:** a no-exit / tunnel error (e.g. `NoTunnelExitError`), a worker that
  fails to boot, 2 failures in a row, or no answer within 20 s. The 20 s cutoff
  only applies when there's a network left to switch to; otherwise the request
  keeps the transport's normal 45 s timeout (Nym's first answer took about two
  minutes tonight, so cutting it off would make it unusable).
- **Where to:** the next network in Nox → Nym → Tor, starting from the user's
  choice. Tor only if a Tor gateway is configured (the public demo gateway is
  down). A network that already failed this session isn't tried again
  automatically. **Never to a direct connection.**
- **Reads retry once on the new network; broadcasts don't** (a signed
  transaction may already have gone out), they fail and the next one uses the new
  network.
- **Visible:** a notice ("Nox unavailable, switched to Nym"), the route shows
  "via Nym (Nox unavailable)", the connection menu lists each switch with its
  reason and offers "Try Nox again", and Settings → Traffic counts the switches.
- **Pre-warm:** once the first network answers, the next one boots in the
  background, so a switch is quick. That's one extra disclosed bootstrap read
  per session (counted).
- **Setting:** Settings → Anonymity network → "Switch networks automatically",
  on by default.
- **Tested:** core unit tests (no-exit, boot failure, timeout, two failures, Tor
  only when configured, no broadcast retry, never direct, off switch, retry) and
  in the browser with Nox forced to fail
  (`localStorage["selfnode:debug-fail-networks"] = "nox"`, a test aid that can
  only make a network fail): switched in 0.5 s, Ready via Nym, live blocks, 0
  direct requests; with the setting off it stayed Unavailable.

## Stale assets after a deploy (2026-11-06)

- **Problem:** with single-page-app fallback, a missing `/assets/*` file (a chunk
  from the previous build, asked for by an open tab) came back as `index.html`
  with status 200.
- **Fix:** `apps/web/worker.js` runs only for `/assets/*`
  (`run_worker_first`). It fetches the asset and, if the host fell back to HTML,
  returns a plain-text 404 with `no-store`. App routes still fall back to
  `index.html`, and every other path is served straight from static assets with
  `_headers` (assets served through the Worker keep their headers too; checked
  with `wrangler dev`).
- **Reload once:** `vite:preloadError` (failed JS imports and CSS preloads) and a
  failed `<link rel=stylesheet>` under `/assets/` reload the page, at most once
  every 30 s (previously once per session, so a second deploy stranded the tab).
- **Tested** with `wrangler dev`: an open tab on build A, a real build B (the Swap
  chunk renamed), then navigating to Swap in the old tab reloaded it onto build
  B; a missing old stylesheet reloaded it; a second missing file within 30 s
  didn't (no loop).

## Frame-busting (2026-11-06)

- The Wallet and Swap routes (wallet, send, swap, recovery phrase) render only
  "Open Selfnode directly" with a link to open it in its own tab when the app is
  inside a frame (`window.top !== window.self`, or the check throws). Explore,
  Data and the rest still render. It's applied at the route level
  (`app/FrameGuard.tsx`), so `pages/Swap.tsx` and its README line anchors are
  untouched.
- **Why:** the Swarm copy can't send `X-Frame-Options` or `frame-ancestors`.
  On Cloudflare those headers already block framing; this is defence in depth.
- The Anon-RPC sandbox iframe is a separate static page
  (`anon-rpc-iframe.html` + its own script) that never loads the app, so it's
  unaffected; Private mode still works inside a frame (checked).
- The Swarm copy was re-uploaded with it: commit `970e60f`, reference
  `d7233e97…`, same Arkiv entity (`snapshot:web`) patched.

## Multiple wallets (2026-11-06)

- **Model:** encrypted vaults (a recovery phrase or a private key) stay in
  IndexedDB, unchanged in format; a separate, non-secret list
  (`localStorage["selfnode:wallets"]`) holds each account's name, vault id,
  derivation index and address, and which one is active. A phrase vault can back
  several accounts (`m/44'/60'/0'/0/n`); a key vault has one.
- **Migration, no data loss:** the original single vault keeps its IndexedDB key
  (`primary`). With no list stored, `migrateWalletMeta` makes it "Wallet 1"
  (unit-tested, including a lost list never hiding the original vault). Verified
  in the browser by deleting the list and reloading: the wallet reappeared and
  unlocked with its password.
- **Unchanged guarantees:** every vault scrypt + AES-GCM encrypted; one
  password per vault; the decrypted key only in the active session, zeroed on
  lock, auto-lock, page hide, switching wallets (switching always locks) and
  removal; unlocking checks the derived key matches the account's address; the
  signer is still testnet-only. Removal keeps the typed "remove" confirmation;
  a vault is deleted only with its last account. Recovery-phrase reveal is per
  wallet and password-gated, and notes when a phrase backs several accounts.
- **Visible everywhere:** a bar under the header shows the active wallet
  (name, address, locked or unlocked) with a link to switch.
- **Verified on Sepolia** (browser, through Nox): send Wallet 1 → second wallet
  `0x069c3a1e5c268b512a7b455c6595256ae9fa8b6da42190dab6f78316cb79e9b2`, swap
  from the second wallet
  `0xdc06e87837a88f0a16da3a15b5db1106a45c7500f9bbebcfa0edcc6d98fbabfc`, both
  status 1; the first wallet's password is refused on the second.
