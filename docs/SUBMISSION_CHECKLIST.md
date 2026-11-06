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

- [ ] Dataset snapshots on Swarm, referenced by `snapshot` entities (`swarmRef`)
- [ ] Unencrypted references only
- [ ] `/arkiv/swarm.md` (all required sections incl. postage batch, Bee node, demo timestamp)

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

## Desktop

- [x] Electron app over `app://` with the security checklist (contextIsolation, sandbox, no nodeIntegration, typed validated bridge, new windows/navigation locked, strict CSP, devtools off when packaged)
- [x] Node manager: pre-flight, verified downloads, pruned Sepolia (Nethermind + Nimbus), sync progress, auto-switch, pause on battery and low disk, clean shutdown, logs
- [x] CI builds for macOS (universal dmg) and Windows (NSIS) with SHA-256 checksums
- [x] `apps/desktop/node-manifest.json` reviewed by Jayden; `maintainerReviewed` is true
- [x] Desktop pre-release published: https://github.com/ItsBreaker/selfnode/releases/tag/v0.1.1-hackathon (unsigned .dmg/.exe + SHA256SUMS.txt), linked from the web Download page, README and demo script. v0.1.0-hackathon is kept and marked superseded.
- [x] Windows graceful shutdown: real Ctrl+C, verified by the node-shutdown CI job on windows-latest and macos-latest (label now "Tested in CI on Windows; graceful shutdown verified")

## Final checks (2026-11-06)

- [x] gitleaks over the full git history (`gitleaks git --log-opts=--all`): 84 commits, no leaks. Working-tree hits are only the gitignored `.env` and local mirror reports, which hold public commit hashes; no secrets found in them.
- [x] README re-checked: feature table, test count, architecture, and all 14 Uniswap line anchors verified against the source
- [ ] Swarm bonus: on hold, waiting on the Arkiv team
