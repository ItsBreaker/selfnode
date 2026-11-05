# Submission checklist

Built from section 3 of the build brief. Tick as completed.

## Uniswap Foundation — Build with Uniswap

- [ ] Public GitHub repo with MIT licence
- [ ] `FEEDBACK.md` in repo root (honest developer feedback, kept as we go)
- [ ] Jayden: submit the Uniswap Developer Feedback Form linking to `FEEDBACK.md`
- [ ] README points to exact files + line ranges: Quoter call, Universal Router calldata, Permit2 flow

## Arkiv — Mirror something Ethereum depends on

- [ ] Writes to the current Arkiv testnet (Rabdi, chain ID 7794095) via `@arkiv-network/sdk`
- [ ] A user-visible feature reads from Arkiv (labels, signatures, tokens)
- [ ] Data licences allow republishing; linked in README. No Sourcify data.
- [ ] Re-runnable import script in `scripts/arkiv-mirror/`
- [ ] README lists writer wallet address(es) and one runnable query
- [ ] `/arkiv/friction.md`
- [ ] `/arkiv/reach.md`
- [ ] `/arkiv/why-arkiv.md`
- [ ] `/arkiv/data-quality.md`
- [ ] `/arkiv/schema.md`
- [ ] README AI-use statement (built with Claude Code)

## Arkiv + Swarm bonus

- [ ] Dataset snapshots on Swarm, referenced by `snapshot` entities (`swarmRef`)
- [ ] Unencrypted references only
- [ ] `/arkiv/swarm.md` (all required sections incl. postage batch, Bee node, demo timestamp)

## Ethereum Foundation — Best Use of Anon-RPC

- [ ] App reads go through Anon-RPC by default
- [ ] In-app traffic-share counter (Settings) + number in README
- [ ] Every non-Anon-RPC exception listed and explained (e.g. bootstrap specifier read)
- [ ] No third-party trackers or analytics
- [ ] README CROPS section
- [ ] Prepared (not opened) PR to `ethereum/anon-rpc` adopters list — ask Jayden first
