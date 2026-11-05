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
- **`eth_sendRawTransaction`: pending** (waiting for the Sepolia test wallet to
  be funded). The key will sign in Node; only the signed raw tx goes to the browser.

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
- **Write + read-back: pending** (mirror wallet needs Rabdi tGLM).

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
