# Selfnode — Build Brief for Claude Code

You are helping me (a solo developer) build **Selfnode** for the ETHGlobal Mumbai hackathon (November 2026). I have roughly one day left. I develop on a MacBook, I'm comfortable with React + TypeScript + Vite + pnpm, and I have not used Electron before. I have zero Rust experience, so do not ask me to write or debug Rust.

Read this whole brief before doing anything. Then do **Phase 0 only** and report back to me before moving on.

---

## 1. Non-negotiable rules

### 1.1 The repo is public
The GitHub repo will be **public** and judged by sponsors.
- Never commit secrets, private keys, mnemonics, API keys, tokens, `.env` files, personal paths, or anything about my machine or network (no home-server hostnames or IPs).
- Use a `.env.example` with placeholder values only. Add a strict `.gitignore` (covering `.env*` except `.env.example`, `*.pem`, `*.key`, keystores, `node_modules`, build output, Electron `release/` and `dist/`, OS files, and any local node data directories).
- Any key the code needs at runtime (e.g. the Arkiv mirror wallet) is read from an environment variable on my machine and is never logged.
- Test keys are generated at runtime, never hard-coded.
- Before every commit, scan the staged diff for anything that looks like a secret. If `gitleaks` is installed, run `gitleaks protect --staged`; if it isn't, tell me and I'll decide whether to install it (via Homebrew). Add a GitHub Actions job that runs gitleaks on pushes.

### 1.2 Supply-chain safety (do not install anything malicious)
- **Only use the dependencies listed in section 6.** If you think you need anything else, stop and ask me, telling me the package name, publisher, weekly downloads, repo link and why.
- Before adding any package, confirm the exact name on npm (watch out for typosquats and look-alike scopes), and check that it's published by the expected org and actively maintained.
- Pin **exact versions** (no `^` or `~`). Commit `pnpm-lock.yaml`.
- Install scripts: rely on pnpm's default of blocking dependency build scripts, and allow only the ones genuinely required (e.g. `electron`, `esbuild`) via `pnpm.onlyBuiltDependencies` in the root `package.json`. Tell me which ones you allowed and why.
- Never run `curl | bash`, never pipe remote scripts into a shell, never install global packages or system tools without asking me first.
- Run `pnpm audit` after installing and report anything high or critical.
- No telemetry, analytics, error-tracking SDKs, ad SDKs or remote fonts/scripts anywhere. Fonts are self-hosted from npm (`@fontsource/*`).

### 1.3 Facts in this brief may be wrong
I gathered some details (contract addresses, package names, chain IDs, flags) from quick research. **Verify every external fact against the official source before relying on it**, and tell me if anything here is wrong. Record each address/URL you use in `packages/core/src/config/` with a comment linking to its official source.

### 1.4 Safety for anything that signs or spends
- The wallet signs **testnet transactions only** (Sepolia) for this hackathon. Mainnet is **read-only**. Enforce this in code with a clear guard and a test.
- Private keys never leave the device, are never sent over the network, never logged and never stored unencrypted.
- **Never silently downgrade privacy.** If an anonymised request fails, show an error. Falling back to a direct RPC is only allowed as an explicit, per-action choice by the user, with a clear warning.

### 1.5 How to work with me
- Work in the phases in section 9. At the end of each phase, stop and give me a short summary: what works, what doesn't, what you verified, and any decisions I need to make.
- **Git workflow:**
  - The remote `origin` (`https://github.com/ItsBreaker/selfnode.git`) is already set up. Work on `main`.
  - Commit early and often: one logical change per commit, never a giant "WIP" commit. Sponsors require a real multi-commit history. Don't squash or rewrite history, and **never force-push**.
  - Use Conventional Commits with a clear subject (≤72 chars, imperative mood) and a short body explaining *why* when it isn't obvious. For example: `feat(transport): route viem requests through Anon-RPC worker` or `fix(wallet): block signing on mainnet`.
  - **Push to `origin main` after each commit**, provided typecheck, lint and tests pass and the secret scan is clean. If a push fails (e.g. auth), tell me; don't work around it.
  - Before the first commit, check `git config user.email`. If it looks like a personal email, warn me and suggest my GitHub noreply address, because commit emails are public.
- **Don't deploy anything or create GitHub Releases without asking me.**
- Keep `docs/DECISIONS.md` updated with every notable decision and trade-off.
- Run typecheck, lint and tests before each commit. Fix failures rather than disabling checks.
- If something this brief requires conflicts with ETHGlobal's rules, tell me. One rule I know of: all project code must be written during the hackathon.
- If a spike shows something isn't feasible, tell me straight away and propose the fallback. Don't fake functionality, mock data in the real UI, or hard-code demo values. The only exception is clearly labelled fixtures in tests.

---

## 2. What Selfnode is

**One line:** a private, verified Ethereum wallet, block explorer and swap app that can run on your own node, so you never depend on Infura, Etherscan or Uniswap's servers.

**The name may change before submission.** Keep the product name, tagline and any brand strings in one place (`packages/core/src/brand.ts`) and use them everywhere, so a rename is a single edit. The repo name will stay `selfnode`.

### 2.1 Connection modes (always visible in the header)
1. **Private (default):** every Ethereum JSON-RPC request goes through **Anon-RPC** (an Ethereum Foundation standard that runs an anonymity network's client, such as Tor or Nym, as a hash-pinned sandboxed worker). No RPC provider learns the user's IP address alongside their addresses.
2. **Verified:** the **Helios** light client verifies responses against Ethereum consensus, ideally with Anon-RPC as its transport, so answers are both private and tamper-evident. (Feasibility of the combination is a Phase 0 spike.)
3. **My node:** the user points Selfnode at their own node's RPC URL. In the desktop app, they can also download and run a pruned node locally (section 5).

### 2.2 Features
- **Wallet:** create or import (BIP-39 mnemonic or private key), password-encrypted local storage, send/receive ETH and ERC-20s on Sepolia, and a plain-English pre-sign preview (decoded call, recipient label, simulation result, warnings for flagged addresses).
- **Explorer ("free Etherscan"):** search by address, transaction hash, block number or ENS name. Show balances, token balances, transactions, receipts, decoded calldata and logs, contract info. Addresses show **labels** and calls show **decoded function names**, both sourced from Arkiv. Full address history is only available against an archive node (say so honestly in the UI; don't fake it).
- **Swap:** Uniswap swaps on Sepolia, quoted **on-chain via the Quoter contract** over Anon-RPC (no Uniswap API, no API key), executed through the Universal Router, with Permit2 approvals, slippage settings, deadline, price impact and minimum received.
- **Privacy report page:** for each mode, a clear table of what each third party can learn (RPC provider, anonymity network, bootstrap provider, Arkiv, Uniswap, Cloudflare as the web host). Judges will read this; make it accurate.
- **Labels on Arkiv:** a re-runnable import script mirrors open-licensed address labels, function signatures and token lists into Arkiv as queryable entities, which the app reads.
- **Desktop app (macOS + Windows):** the same UI plus a node manager (section 5).

### 2.3 Networks
- **Sepolia:** wallet, signing, swaps, demo.
- **Mainnet:** read-only explorer and balances.
- Chain selection lives in config. Anon-RPC chooses the chain by whichever RPC URL we pass to its `fetch`, so we need configurable public RPC URLs for each chain (no keys) and a bootstrap provider.

### 2.4 Out of scope this weekend
Mobile app, privacy pools (Kohaku integration), mainnet signing, multi-chain beyond mainnet/Sepolia, hardware wallets, signed/notarized installers, auto-updates.

---

## 3. Prize tracks: requirements we must satisfy

We are targeting exactly three partner prizes plus one bonus. Build a `docs/SUBMISSION_CHECKLIST.md` from this section and keep it ticked off.

### 3.1 Uniswap Foundation — "Build with Uniswap"
- Public GitHub repo, open-source licence (MIT).
- `FEEDBACK.md` in the repo root with honest developer feedback (what worked, what was confusing, missing docs, bugs). Keep notes as you go.
- I will fill in the Uniswap Developer Feedback Form linking to `FEEDBACK.md`. Remind me.
- `README.md` must point to the exact files and line ranges where we use Uniswap contracts (Quoter call, Universal Router calldata building, Permit2 flow).

### 3.2 Arkiv — "Mirror something Ethereum depends on"
- Built from scratch at the hackathon. Writes to **Arkiv's current testnet** (the prize page listed chain ID `7794095`; verify against Arkiv docs) via the official SDK. A user-visible feature must **read** from Arkiv.
- The data's licence must allow republishing, linked in the README. **No Sourcify data from any chain.**
- The import script lives in the repo and is re-runnable.
- README must list the writing wallet address(es) and one runnable query.
- Required files, each judged at 25%:
  - `/arkiv/friction.md`: honest SDK/docs feedback, kept as we go.
  - `/arkiv/reach.md`: who uses this now and after the event, and how other wallets/explorers can query it.
  - `/arkiv/why-arkiv.md`: what's lost if this were Postgres (public, permissionless, queryable by anyone without asking us, can't be taken down by one company, expirations keep it fresh).
  - `/arkiv/data-quality.md`: sources, licences, freshness/refresh cadence, dedup rules, query filters available.
- Also `/arkiv/schema.md`: entities, queried attributes, owners, expirations.
- README must include a statement on AI use (built with Claude Code).

### 3.3 Arkiv + Swarm bonus (does not use a partner pick; competitive, not guaranteed)
- Store **snapshots of the mirrored datasets** on Swarm, and reference them from Arkiv entities (e.g. a `dataset-snapshot` entity with a `swarmRef` attribute).
- **Unencrypted references only** (public data). Encrypted Swarm references contain their key and Arkiv entities are public.
- `/arkiv/swarm.md` must cover: what lives on Swarm vs Arkiv and which entity field holds the reference; one entity key and its Swarm reference with a link; postage batch ID, who bought it, and the Bee node/service used; repo files that upload and read; steps to run one upload and one read with expected output; demo video timestamp; Swarm friction notes.
- This is a later phase. Ask me how I'll get a Bee node or postage batch before starting it.

### 3.4 Ethereum Foundation — "Best Use of Anon-RPC"
- App reads go through Anon-RPC **by default**. Measure and display the share of RPC traffic routed through Anon-RPC (a small in-app counter in Settings, plus a number in the README). Every exception, such as the one-time bootstrap read of the worker specifier, is listed and explained.
- No third-party trackers or analytics.
- README needs a **CROPS** section (censorship resistance, open source, privacy, security): control dependencies, licensing and buildability, what third parties learn, and how keys and data are protected.
- Bonus credibility: prepare (but don't submit) a PR to the `ethereum/anon-rpc` adopters list adding Selfnode under wallets and apps. Ask me before opening it.

---

## 4. Integration notes (verify each against official docs)

### 4.1 Anon-RPC
- Package: `@anon-rpc/browser-harness` (browser only; the sandbox is a null-origin iframe running a Web Worker). Repo: `github.com/ethereum/anon-rpc`; read `docs/integrate-wallet.md`, `SPEC.md` and `adopters.json5`.
- Usage: construct **one long-lived** `AnonRpcWorker` per network with `{ address: <specifier>, config, preExisting: { rpcProvider } }`. Then `worker.fetch(url, init)` behaves like `fetch` and can be passed to viem as the HTTP transport's custom fetch function (verify the viem option name).
- Startup: the harness reads `workerHash()` and `workerResolvers()` from the specifier contract via the bootstrap provider. This one-time read is **not anonymised**, and the bootstrap provider is trusted for it. Document this in the privacy report.
- Specifier addresses I found (**verify each against the official adopters list before use**):
  - Tor (`tor-js`): `0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e` (mainnet). Its demo gateway has limited capacity and may disappear, so the gateway must be configurable. I may run my own.
  - Nym: `0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0` (mainnet).
  - Nox: `0x35133267A8F7EC35046a83DCA0f4Ca8A6e1b7A9A` (Sepolia).
  - Passthrough: `0x4fd77be300f31c5fe6ab266d35d27750a3478d27`. **Testing only. It does NOT anonymise. Never ship it as a default or make it selectable without a loud warning.**
- Expect noticeable startup and per-request latency, so design proper loading and progress states and batch requests (multicall) where possible.
- `eth_sendRawTransaction` through the worker isn't documented. Test it in Phase 0.

### 4.2 Helios
- Use Helios's official JavaScript/WASM build from npm (verify the exact package name and publisher; it's by a16z). No Rust.
- Phase 0 spike: can Helios use Anon-RPC's `fetch` as its execution and consensus transport? If not, Verified mode uses Helios with a direct upstream, and the UI and privacy report state that trade-off clearly.
- Helios needs `eth_getProof` from its execution RPC. Check that our chosen RPCs support it.

### 4.3 Uniswap (Sepolia)
- Get the official Sepolia deployment addresses (Universal Router, Quoter (v4 Quoter or v3 QuoterV2), Permit2, PoolManager or factory) from Uniswap's official docs deployment pages, and cite them in config.
- Prefer v4 if the quoting and swap path is workable in the time available; otherwise use v3 and record why in `docs/DECISIONS.md`.
- Sepolia liquidity is thin. Write a script (`scripts/seed-pool.ts`) that deploys a test ERC-20 (or uses an existing official test token), creates a pool against WETH and adds liquidity, using a key from an env var. It must be re-runnable and print the addresses for config.
- All quoting is `eth_call` to the Quoter over the active transport. No Uniswap Trading API.

### 4.4 Arkiv
- Official SDK: `@arkiv-network/sdk` (verify). Use the current testnet from Arkiv's docs or prize page (chain ID `7794095`; verify the RPC URLs and faucet).
- The Arkiv store is shared and public, so **always scope reads by `owner`** (our mirror wallet address, from config).
- Entity types (put the final design in `/arkiv/schema.md`):
  - `label`: attributes `type="label"`, `chain`, `address` (lowercase), `name`, `category`, `source`, `license`, `key` (deterministic, e.g. `label:1:0xabc…`).
  - `sig`: `type="sig"`, `selector` (`0xa9059cbb`), `text` (`transfer(address,uint256)`), `source`, `license`, `key`.
  - `token`: `type="token"`, `chain`, `address`, `symbol`, `decimals`, `name`, `source`, `license`, `key`.
  - `dataset-snapshot`: `type="snapshot"`, `dataset`, `version`, `rowCount`, `sha256`, `swarmRef`, `createdAt`.
- The import script `scripts/arkiv-mirror/` must be **idempotent**: upsert by deterministic `key` (update or extend existing entities rather than duplicating), write in batches with retry and backoff, set expirations (e.g. 30 days) that are extended on each run, and print a summary.
- **Datasets:** propose candidate open-licensed sources for address labels, function signatures and token lists, with links to each licence, and **ask me to approve them before importing anything**. Respect each source's licence and attribution requirements.
- In the app, cache Arkiv results locally (IndexedDB) so labels keep working offline and the app doesn't hammer Arkiv.

### 4.5 Wallet crypto
- Use viem accounts, plus `@scure/bip39` and `@scure/bip32` for mnemonics.
- Encryption at rest: scrypt (`@noble/hashes`) with sensible parameters, then AES-GCM via WebCrypto with a random salt and IV. Store the encrypted blob in IndexedDB (web). On desktop, also wrap it with Electron `safeStorage`.
- Auto-lock after inactivity, and clear decrypted keys from memory on lock where practical.
- Signing happens in a single small module that is easy to audit.

---

## 5. Desktop app (Electron)

- Electron + `electron-builder`. Reuse the web UI; the desktop app adds only the node manager and secure key storage.
- **Security checklist (all required):** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, no remote content loaded in privileged windows, a minimal typed preload bridge exposing only specific functions, validation of every IPC message, `setWindowOpenHandler` denying new windows (open external links in the OS browser only after confirmation), blocking navigation away from the app, a strict CSP, and devtools disabled in production builds.
- **Node manager:**
  - Pre-flight checks: free disk space, RAM, SSD if detectable, and OS/arch. Show clear requirements: pruned mainnet needs roughly 500 GB+ and 2 TB is recommended, at least 16 GB RAM, and about 12 hours for the first sync. Sepolia is much smaller.
  - Clients: **Geth** (execution) + **Nimbus** (consensus). If Nimbus has no official build for a platform, fall back to **Lighthouse**, and record that in `DECISIONS.md`.
  - Binaries are downloaded **only from the official release URLs** of each project, and verified against SHA-256 checksums pinned in a manifest file in the repo (`apps/desktop/node-manifest.json`). I'll review that manifest. Never execute a file that fails verification. Store binaries and data in the app's user-data directory. No auto-updates.
  - Run Geth pruned (verify flags; e.g. `--history.chain postmerge` for new mainnet nodes) and Nimbus with checkpoint sync from a configurable URL. Generate the JWT secret locally with permissions restricted to the user. Bind all RPC and Engine API ports to `127.0.0.1` only.
  - Show sync progress (`eth_syncing`, peers, an ETA estimate). Switch Selfnode to the local node automatically once synced (with a toast), and keep using Private/Verified until then.
  - Even in My node mode, **broadcast transactions via Anon-RPC by default** (a node broadcasting directly reveals your IP to peers). Explain this in the UI and the privacy report.
  - Laptop-friendly: pause on battery (Electron `powerMonitor`, configurable), clean shutdown of child processes on quit, and logs viewable in-app.
- **Builds:** GitHub Actions matrix: `macos-latest` produces a universal `.dmg`, `windows-latest` produces an NSIS `.exe`. Artifacts are unsigned; add SHA-256 checksums. A "how to open an unsigned app" note goes on the web app's Download page. Don't create a GitHub Release without asking me.

---

## 6. Allowed dependencies (ask before adding anything else)

- Tooling: `pnpm` workspaces, `typescript`, `vite`, `@vitejs/plugin-react`, `vitest`, `eslint` + `typescript-eslint`, `prettier`.
- Web: `react`, `react-dom`, a router (`react-router` or `@tanstack/react-router`; pick one), `@tanstack/react-query`, `tailwindcss` (with our own design tokens, not default styling), Radix UI primitives (unstyled, for accessibility), `lucide-react` (icons, used sparingly), `@fontsource/*` (self-hosted fonts), `idb` (IndexedDB helper).
- Ethereum: `viem`, `@scure/bip39`, `@scure/bip32`, `@noble/hashes`, Helios's official JS package, `@anon-rpc/browser-harness`, `@arkiv-network/sdk`, the official Uniswap SDK packages only if they clearly help (e.g. Universal Router command encoding; justify first), and `@ethersphere/bee-js` (Swarm phase only).
- Desktop: `electron`, `electron-builder`.
- Deploy: `wrangler` (dev dependency) for Cloudflare.

---

## 7. Architecture

```
selfnode/
  packages/
    core/                 # framework-agnostic TypeScript
      src/brand.ts        # name, tagline, links (single source of truth)
      src/config/         # chains, RPC URLs, Anon-RPC specifiers, Uniswap & Arkiv addresses (with source links)
      src/transport/      # mode router: Private (Anon-RPC) / Verified (Helios) / My node; traffic accounting
      src/wallet/         # keygen/import, encryption, signing, testnet guard
      src/explorer/       # block/tx/address queries, calldata + log decoding
      src/labels/         # Arkiv reads + local cache
      src/swap/           # Quoter, Universal Router, Permit2
  apps/
    web/                  # React + Vite; deploy to Cloudflare as static assets
    desktop/              # Electron main/preload; node manager; loads the web build
  scripts/
    arkiv-mirror/         # idempotent dataset importer
    seed-pool.ts          # Sepolia test pool
  arkiv/                  # schema.md, friction.md, reach.md, why-arkiv.md, data-quality.md, swarm.md
  docs/                   # DECISIONS.md, SUBMISSION_CHECKLIST.md, DEMO_SCRIPT.md
  FEEDBACK.md  README.md  LICENSE (MIT)  .env.example
```

- **One transport layer.** Everything (wallet, explorer, swap) gets its viem client from `core/transport`, which knows the active mode, counts requests by route, and never falls back silently.
- **Web hosting:** a static build served by a Cloudflare Worker with static assets (no backend). Set security headers: a strict CSP, `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, and frame-ancestors none. Make sure the CSP still allows what the Anon-RPC sandbox iframe, its Web Worker and WASM genuinely need; work this out from the harness docs and test it in the production build.
- Don't deploy without asking me. Use placeholder names in the `wrangler` config.

---

## 8. Design: polished, not "AI-generated"

I want this to look like a carefully made product, not a template.

- **Light-first**, with a dark theme and a toggle (respect the system preference on first load, then remember the user's choice).
- **Feel:** calm, precise, editorial, like a well-made instrument or a good banking app. Generous whitespace, a clear hierarchy, restrained colour.
- **Avoid:** purple/blue gradients, glassmorphism, neon glows, emoji as icons, generic "hero + three feature cards" landing pages, default shadcn/Tailwind look, rounded-everything, stock illustrations, and "AI sparkle" iconography.
- **Typography:** one distinctive, highly legible sans for UI (not Inter; propose 2–3 options and let me pick) and a good monospace for addresses, hashes and numbers. Use tabular numerals for amounts.
- **Colour:** a neutral base with **one** accent, plus semantic colours for verified, warning, danger and private states. Define everything as design tokens (CSS variables) for both themes, and check WCAG AA contrast.
- **The connection mode is the product.** Show a persistent, elegant mode indicator (Private / Verified / My node) with a small status detail (e.g. "via Tor · 1.2 s"), and a clear state when it's starting up or degraded.
- **Addresses:** label or name first, shortened hex second, with copy-to-clipboard and a "verified label from Arkiv" marker. Never show a raw 42-character address where a label exists.
- **Quality details:** real empty, loading and error states (skeletons that match the layout); keyboard navigation and visible focus rings; a ⌘K search for the explorer; subtle, purposeful motion only (respect `prefers-reduced-motion`); responsive down to mobile width.
- **Pages:** Overview (mode, network, balances, node status), Wallet, Explore, Swap, Node (desktop only, plus a "Download the desktop app" page on web), Privacy report, Settings.
- Before building pages, create a small internal style guide route (`/styleguide`) showing tokens, type scale and core components in both themes. Show it to me (screenshots or a description) for sign-off.

---

## 9. Phases (stop and report after each)

**Phase 0 — Setup and risk spikes (do first, report before continuing)**
1. Scaffold the monorepo, tooling, licence, `.gitignore`, `.env.example`, brand file, CI (typecheck, lint, test, gitleaks).
2. Spikes, each as a small script or test with a written result in `docs/DECISIONS.md`:
   - Anon-RPC: create a worker with a real anonymising network (not passthrough) and do `eth_blockNumber` on **Sepolia** and **mainnet** via viem using `worker.fetch`. Measure latency. Test whether `eth_sendRawTransaction` works with a tiny Sepolia transaction (I'll provide a funded test key via env var when you ask).
   - Helios: can it run in the browser with Anon-RPC's fetch as transport? Does our RPC support `eth_getProof`?
   - Arkiv: write one entity to the current testnet and query it back, scoped by owner.
   - Uniswap: confirm the Sepolia addresses, get one Quoter quote, and decide v3 vs v4.
3. Report: what works, what doesn't, recommended fallbacks, and the final dependency list with versions.

**Phase 1 — Core transport + app shell + design system**
Mode router with traffic accounting, settings, theme toggle, `/styleguide`, app layout and navigation, Privacy report page (initial version).

**Phase 2 — Wallet**
Create/import, encrypt/lock, balances, send on Sepolia, pre-sign preview, testnet guard (with a test).

**Phase 3 — Explorer + Arkiv labels**
Explorer views; label and signature decoding from Arkiv with a local cache; the mirror import script (after I approve the datasets); the Arkiv docs files.

**Phase 4 — Swap**
Seed-pool script, Quoter quotes over the active transport, Permit2 + Universal Router swap, slippage/deadline UI, `FEEDBACK.md` and the README pointers to the exact lines.

**Phase 5 — Desktop + node manager**
Electron shell with the security checklist, pre-flight checks, verified binary download, pruned Sepolia sync with progress, auto-switch to the local node, CI builds for macOS and Windows.

**Phase 6 — Swarm bonus + submission docs**
Dataset snapshots on Swarm referenced from Arkiv (after I sort out the Bee node and postage batch), `/arkiv/swarm.md`, the CROPS README section, the traffic-share number, the AI-use statement, `docs/SUBMISSION_CHECKLIST.md` complete, `docs/DEMO_SCRIPT.md` (a 3-minute demo path).

**Phase 7 — Polish**
Visual QA in both themes, accessibility pass, performance pass, final secret scan of the whole git history, README screenshots.

---

## 10. First message back to me

After reading this brief, reply with:
1. Anything in this brief you think is wrong, risky or unclear.
2. Your Phase 0 plan with the exact packages and versions you intend to install (wait for my OK before installing). The first commit can be just the `.gitignore`, licence and this brief, so the repo history starts cleanly.
3. What you need from me (e.g. funded Sepolia test key via env var, Arkiv testnet funds, my preferred font from your shortlist).
