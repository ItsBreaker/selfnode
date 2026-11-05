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
- [x] Prepared (not opened) PR to `ethereum/anon-rpc` adopters list, in `docs/anon-rpc-adopters-entry.md`. **Jayden: approve before opening.**

## Demo and submission

- [x] `docs/DEMO_SCRIPT.md` (3-minute path)
- [ ] **Jayden:** record the demo video (add its timestamp to `/arkiv/swarm.md` if the Swarm bonus is done)
- [ ] **Jayden:** decide on a public deployment (Cloudflare). Not deployed; the `wrangler` config and security headers aren't written yet.
