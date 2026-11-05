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

## Phase 0 spikes

(results below as each completes)
