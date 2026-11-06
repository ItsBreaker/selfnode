# Submission checklist

Built from section 3 of the build brief. Tick as completed.

## Uniswap Foundation — Build with Uniswap

- [x] Public GitHub repo with MIT licence
- [x] `FEEDBACK.md` in repo root (honest developer feedback, kept as we go)
- [ ] **Jayden:** submit the Uniswap Developer Feedback Form linking to `FEEDBACK.md`
- [x] README points to exact files + line ranges: Quoter call, Universal Router calldata, Permit2 flow

## Arkiv — Mirror something Ethereum depends on

- [x] Writes to the current Arkiv testnet (Rabdi, chain ID 7794095) via `@arkiv-network/sdk`
- [x] A user-visible feature reads from Arkiv (labels, signatures, tokens)
- [x] Data licences allow republishing; linked in README. No Sourcify data.
- [x] Re-runnable import script in `scripts/arkiv-mirror/`
- [x] README lists writer wallet address(es) and one runnable query
- [x] `/arkiv/friction.md`
- [x] `/arkiv/reach.md`
- [x] `/arkiv/why-arkiv.md`
- [x] `/arkiv/data-quality.md`
- [x] `/arkiv/schema.md`
- [x] README AI-use statement (built with Claude Code)

## Arkiv + Swarm bonus

- [x] Dataset snapshots on Swarm, referenced by `snapshot` entities (`swarmRef`): tokens, labels, sigs via the bzz.limo public gateway
- [x] Unencrypted references only
- [x] `/arkiv/swarm.md`: Swarm vs Arkiv, `swarmRef`, entity keys + references with links, batch (gateway's own, ID and lifetime not exposed), files, upload and read steps with real output, `--from-swarm` dry run, friction
- [x] `--from-swarm` rebuild (hash-verified, gateway fallback) and a keyless read example (`arkiv/examples/swarm-read.ts`)
- [x] App: opt-in "Load labels from the Swarm archive" (Settings), with an IP warning, on the Privacy page and in the README exceptions table
- [ ] **Jayden:** demo video timestamp in `/arkiv/swarm.md` (placeholder under "## Demo video")
- [ ] Postage batch details, if the Swarm team shares them

## Ethereum Foundation — Best Use of Anon-RPC

- [x] App reads go through Anon-RPC by default
- [x] In-app traffic-share counter (Settings) + number in README
- [x] Every non-Anon-RPC exception listed and explained (e.g. bootstrap specifier read)
- [x] No third-party trackers or analytics
- [x] README CROPS section
- [x] PR to the `ethereum/anon-rpc` adopters list opened: https://github.com/ethereum/anon-rpc/pull/16

## Demo and submission

- [x] `docs/DEMO_SCRIPT.md` (3-minute path)
- [ ] **Jayden:** record the demo video (`docs/DEMO_SCRIPT.md`; add its timestamp to `/arkiv/swarm.md` if the Swarm bonus is done)
- [x] Deployed: https://selfnode.jhfe.workers.dev/ (Cloudflare Worker, strict security headers, verified live)
- [x] Logo: `docs/brand/selfnode-logo-source.png` (the ETHGlobal logo), a matching SVG redraw (`selfnode-logo.svg`) and `selfnode-logo-512.png`; favicon, app icon and header mark live on the web app
- [ ] **Jayden:** ETHGlobal "Upload images" step (logo + screenshots from `docs/screenshots/`)

## Desktop

- [x] Electron app over `app://` with the security checklist (contextIsolation, sandbox, no nodeIntegration, typed validated bridge, new windows/navigation locked, strict CSP, devtools off when packaged)
- [x] Node manager: pre-flight, verified downloads, pruned Sepolia (Nethermind + Nimbus), sync progress, auto-switch, pause on battery and low disk, clean shutdown, logs
- [x] CI builds for macOS (universal dmg) and Windows (NSIS) with SHA-256 checksums
- [x] `apps/desktop/node-manifest.json` reviewed by Jayden; `maintainerReviewed` is true
- [x] Desktop pre-release published: https://github.com/ItsBreaker/selfnode/releases/tag/v0.1.1-hackathon (unsigned .dmg/.exe + SHA256SUMS.txt), linked from the web Download page, README and demo script. v0.1.0-hackathon is kept and marked superseded.
- [ ] Next desktop build (not released yet): Node page shows real sync stages (`apps/desktop/src/node/stage.ts`) instead of a block-number ETA
- [x] Windows graceful shutdown: real Ctrl+C, verified by the node-shutdown CI job on windows-latest and macos-latest (label now "Tested in CI on Windows; graceful shutdown verified")

## Final checks (2026-11-06)

- [x] gitleaks over the full git history (`gitleaks git --log-opts=--all`): 110 commits, no leaks (re-run 20:51 IST). Earlier working-tree hits were only the gitignored `.env` and local mirror reports, which hold public commit hashes.
- [x] README re-checked (20:52 IST): feature table (incl. Swarm and the archive), entity counts, exceptions table, test count (152), architecture, and all 14 Uniswap line anchors verified against the source
- [x] Traffic share: README's 98.0% (97 of 99, production build) is the latest measurement; the earlier 97.9% (95 of 97) is marked superseded in DECISIONS
- [x] Swarm bonus: snapshots on Swarm (public gateway), referenced from Arkiv; see `/arkiv/swarm.md`
