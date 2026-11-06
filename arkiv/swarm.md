# Swarm: dataset snapshots referenced from Arkiv

Selfnode's Arkiv mirror (tokens, address labels and the scam list, function
names) is also published as **one snapshot file per dataset on Swarm**. Each
snapshot has a `selfnode-snapshot` entity on Arkiv that holds its Swarm
reference and SHA-256, so anyone can find the archive through Arkiv, fetch it
from any Swarm gateway and check it hasn't been altered. The mirror script can
rebuild or repair the Arkiv entities from those snapshots (`--from-swarm`).

## What lives where

|               | Arkiv (Rabdi testnet, owner `0xA05A5c06d69dECa38FdB779957d4E7B3aC2B8c39`)                                              | Swarm (unencrypted)                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **What**      | One queryable entity per row: 2,105 tokens, 796 labels, 444 function names, plus licence notices ([schema](schema.md)) | One JSON file per dataset (`tokens`, `labels`, `sigs`): every row exactly as on Arkiv, plus that dataset's licence notices |
| **Used for**  | Live lookups by the app (address → label, selector → function name), through Anon-RPC                                  | An archive of the whole dataset at a point in time; bulk download; rebuilding Arkiv                                        |
| **Pointer**   | `selfnode-snapshot` entity per dataset: **`swarmRef`** holds the Swarm reference; `sha256` the file's hash             | —                                                                                                                          |
| **Integrity** | Every row has a `contentHash`; reads are always scoped by owner                                                        | Content-addressed reference, and the file must match the entity's `sha256` before anything uses it                         |
| **Lifetime**  | 90 days, extended by each importer run                                                                                 | As long as the gateway's postage batch lasts (unknown, see below)                                                          |

The `selfnode-snapshot` entity (`type = "snapshot"`, one per dataset, `rowKey =
snapshot:<dataset>`):

| Attribute                          | Example                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| `dataset`                          | `sigs` (indexed)                                                                |
| `swarmRef`                         | `b23b5b239161ba4f21ffaae70e8c52eb39f6db7d3055ee5d9ef175b738a6425e`              |
| `sha256`                           | `9d793d1780e0c7aad996864450e0a1dda5ba7d7f7bdb8ffe3f6beb0123495382`              |
| `rowCount`                         | `444` (u64)                                                                     |
| `version`                          | `selfnode-arkiv-snapshot/1` (the snapshot file format)                          |
| `createdAt`                        | `1793975490` (u64, Unix seconds; 2026-11-06 14:31 UTC)                          |
| `sourceCommit`                     | `2b8a705fe27833b59aac2a2af5d14e0144e1e56e` (comma-separated if several sources) |
| `source`, `license`, `contentHash` | `selfnode/arkiv-snapshots`, `MIT`, hash of the attributes above                 |

Snapshot files are canonical JSON (rows sorted by `rowKey`, attribute names
sorted, no timestamps inside), so unchanged data always produces the same bytes,
the same SHA-256 and the same Swarm reference. A re-run with no data changes
writes nothing to Arkiv.

## The three snapshots

| Dataset | Arkiv entity key                                                     | Swarm reference (bzz.limo link)                                                                            | Size    | Rows  |
| ------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------- | ----- |
| tokens  | `0x7bbc45e538c362cd8830c8fe7d46ddf3d8d5057f726e1fa96c6b6dae51ac6fa9` | [`a287f736…ff00d`](https://bzz.limo/bzz/a287f7361bf3091782ddfc1bea22575ca4d8e4cfe631665f524ab037018ff00d/) | 1.6 MiB | 2,105 |
| labels  | `0xc1f9bab6ed372aea774e5d07664a66437b40dd52f764cbf741249c360e0c7dc8` | [`6f24208c…a6e89`](https://bzz.limo/bzz/6f24208ce8ae294cb6179ea5c2565c5a06ad2621b140d32cb1476483305a6e89/) | 662 KiB | 796   |
| sigs    | `0x0188f3e29dbe9aea7882e1a9fb67bc5af5eb2ed5ff43eda1282e04c9a49cab6d` | [`b23b5b23…6425e`](https://bzz.limo/bzz/b23b5b239161ba4f21ffaae70e8c52eb39f6db7d3055ee5d9ef175b738a6425e/) | 298 KiB | 444   |

Full references: tokens
`a287f7361bf3091782ddfc1bea22575ca4d8e4cfe631665f524ab037018ff00d`, labels
`6f24208ce8ae294cb6179ea5c2565c5a06ad2621b140d32cb1476483305a6e89`, sigs
`b23b5b239161ba4f21ffaae70e8c52eb39f6db7d3055ee5d9ef175b738a6425e`. All three
also read back byte-for-byte from `https://api.gateway.ethswarm.org/bzz/<ref>/`.

## Postage batch and Bee node

- **Batch:** bzz.limo public gateway, recommended by the Swarm team; the
  gateway's own postage batch, ID and lifetime not exposed.
- **Who bought it:** not us. The gateway operator stamps uploads with its own
  batch; we sent no `swarm-postage-batch-id` header and paid nothing.
- **Bee node / service:** no Bee node of our own. Uploads go to the
  [bzz.limo](https://bzz.limo) public gateway (`POST /bzz`); reads use bzz.limo,
  then `api.gateway.ethswarm.org` as a fallback.
- What we could see: uploads return `201 Created` with a `reference` and a
  `swarm-tag` header (e.g. `20841683`). The gateway exposes no `/stamps`,
  `/tags/<id>`, `/stewardship` or `/chainstate` endpoint (all 404), so the batch
  and its TTL are unknown to us. If the batch expires, the snapshots may stop
  being retrievable; the Arkiv data is unaffected, and `--snapshot` can
  re-upload them.

## Files

| File                                                                              | What it does                                                                                                                   |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [`scripts/arkiv-mirror/swarm.ts`](../scripts/arkiv-mirror/swarm.ts)               | Upload (`POST /bzz` on bzz.limo) and verified download (bzz.limo, then api.gateway.ethswarm.org) with plain `fetch`            |
| [`scripts/arkiv-mirror/snapshot.ts`](../scripts/arkiv-mirror/snapshot.ts)         | Owner-scoped export from Arkiv, canonical serialisation, per-row `contentHash` checks, parsing, the `selfnode-snapshot` entity |
| [`scripts/arkiv-mirror/snapshot-run.ts`](../scripts/arkiv-mirror/snapshot-run.ts) | `--snapshot` (export → upload → read back → upsert entity) and `--from-swarm` (entity → download → verify → rebuild/patch)     |
| [`scripts/arkiv-mirror/swarm.test.ts`](../scripts/arkiv-mirror/swarm.test.ts)     | Gateway fallback, wrong-hash rejection and upload errors (fetch mocked)                                                        |
| [`arkiv/examples/swarm-read.ts`](examples/swarm-read.ts)                          | Standalone read for anyone: Arkiv entity → Swarm → SHA-256 check. No key, no Selfnode code                                     |
| [`packages/core/src/labels/schema.ts`](../packages/core/src/labels/schema.ts)     | `SnapshotSchema` (`selfnode-snapshot`)                                                                                         |

No Swarm SDK or CLI is a dependency. A one-off feasibility test used
`npx @ethersphere/swarm-cli@3.7.0` from `/tmp` (see
[DECISIONS.md](../docs/DECISIONS.md)); nothing from it is in the repo.

## Run one upload

Needs the mirror wallet key in `.env` (it writes the snapshot entities).

```sh
pnpm --filter @selfnode/scripts arkiv:mirror --snapshot --only sigs
```

Expected output (real run, 2026-11-06; first upload of all three datasets cost
0.000992 tGLM):

```text
[snapshot] sigs
  exported 444 rows + 1 licence notice(s) from Arkiv (ethereum-lists/4bytes@2b8a705: 444); every contentHash re-checked
  297.9 KiB, sha256 9d793d1780e0c7aad996864450e0a1dda5ba7d7f7bdb8ffe3f6beb0123495382
  uploaded to bzz.limo: b23b5b239161ba4f21ffaae70e8c52eb39f6db7d3055ee5d9ef175b738a6425e (swarm-tag 20841683)
  read back from https://bzz.limo: 297.9 KiB, sha256 matches
  read back from https://api.gateway.ethswarm.org: 297.9 KiB, sha256 matches

[snapshot] Arkiv entities
  snapshots: 3 rows → create 3, update 0, extend 0, skip 0, left to expire 0
  snapshots: 3/3 written, 0.000992225 tGLM
  sigs: entity 0x0188f3e29dbe9aea7882e1a9fb67bc5af5eb2ed5ff43eda1282e04c9a49cab6d → swarmRef b23b5b239161ba4f21ffaae70e8c52eb39f6db7d3055ee5d9ef175b738a6425e
```

Running it again with unchanged data uploads the same bytes, gets the same
reference, and writes nothing: `snapshots: 3 rows → create 0, update 0, extend 0,
skip 3`, 0 tGLM.

## Run one read

Anyone, no key, from an empty folder:

```sh
npm i @arkiv-network/sdk viem && npx tsx swarm-read.ts sigs   # arkiv/examples/swarm-read.ts
```

Expected output:

```text
Arkiv entity 0x0188f3e29dbe9aea7882e1a9fb67bc5af5eb2ed5ff43eda1282e04c9a49cab6d
  swarmRef b23b5b239161ba4f21ffaae70e8c52eb39f6db7d3055ee5d9ef175b738a6425e
  sha256   9d793d1780e0c7aad996864450e0a1dda5ba7d7f7bdb8ffe3f6beb0123495382, 444 rows
Downloaded 305022 bytes from https://bzz.limo; SHA-256 matches the Arkiv entity
  selfnode-arkiv-snapshot/1: 444 rows, e.g. sig:0x00000009
  source ethereum-lists/4bytes@2b8a705 (MIT)
```

Or with nothing but curl:

```sh
curl -s https://bzz.limo/bzz/b23b5b239161ba4f21ffaae70e8c52eb39f6db7d3055ee5d9ef175b738a6425e/ | shasum -a 256
# 9d793d1780e0c7aad996864450e0a1dda5ba7d7f7bdb8ffe3f6beb0123495382  -
```

## Rebuild Arkiv from Swarm (`--from-swarm`)

For each dataset: read its `selfnode-snapshot` entity (owner-scoped), download
the file (bzz.limo, then api.gateway.ethswarm.org), reject it unless the SHA-256
matches the entity, check the format, dataset, owner, `rowCount` and every row's
`contentHash`, then create, patch or extend the Arkiv entities with the same
idempotent sync the importer uses (and the same `--reserve` / `--max-spend`
guards). Real dry run, 2026-11-06, against the live mirror:

```text
$ pnpm --filter @selfnode/scripts arkiv:mirror --from-swarm --dry-run
Arkiv mirror (dry run) as 0xA05A5c06d69dECa38FdB779957d4E7B3aC2B8c39, balance 8.882080126 tGLM, reserve 2

[from-swarm] tokens
  Arkiv entity 0x7bbc45e538c362cd8830c8fe7d46ddf3d8d5057f726e1fa96c6b6dae51ac6fa9: swarmRef a287f7361bf3091782ddfc1bea22575ca4d8e4cfe631665f524ab037018ff00d, sha256 57fbbbef55035158…, 2105 rows, selfnode-arkiv-snapshot/1, created 2026-11-06T14:31:13.000Z
  downloaded from https://bzz.limo: 1645.8 KiB, sha256 matches the entity
  verified: format selfnode-arkiv-snapshot/1, owner 0xA05A5c06d69dECa38FdB779957d4E7B3aC2B8c39, 2105 rows + 2 notice(s), every contentHash recomputed
  tokens (MyEtherWallet/ethereum-lists) from Swarm: 1 rows → create 0, update 0, extend 0, skip 1, left to expire 0
  tokens (ethereum-lists/tokens) from Swarm: 2104 rows → create 0, update 0, extend 0, skip 2104, left to expire 0

[from-swarm] labels
  Arkiv entity 0xc1f9bab6ed372aea774e5d07664a66437b40dd52f764cbf741249c360e0c7dc8: swarmRef 6f24208ce8ae294cb6179ea5c2565c5a06ad2621b140d32cb1476483305a6e89, sha256 0e4f3caf50d22214…, 796 rows, selfnode-arkiv-snapshot/1, created 2026-11-06T14:31:21.000Z
  downloaded from https://bzz.limo: 661.6 KiB, sha256 matches the entity
  verified: format selfnode-arkiv-snapshot/1, owner 0xA05A5c06d69dECa38FdB779957d4E7B3aC2B8c39, 796 rows + 1 notice(s), every contentHash recomputed
  labels (MyEtherWallet/ethereum-lists) from Swarm: 796 rows → create 0, update 0, extend 0, skip 796, left to expire 0

[from-swarm] sigs
  Arkiv entity 0x0188f3e29dbe9aea7882e1a9fb67bc5af5eb2ed5ff43eda1282e04c9a49cab6d: swarmRef b23b5b239161ba4f21ffaae70e8c52eb39f6db7d3055ee5d9ef175b738a6425e, sha256 9d793d1780e0c7aa…, 444 rows, selfnode-arkiv-snapshot/1, created 2026-11-06T14:31:30.000Z
  downloaded from https://bzz.limo: 297.9 KiB, sha256 matches the entity
  verified: format selfnode-arkiv-snapshot/1, owner 0xA05A5c06d69dECa38FdB779957d4E7B3aC2B8c39, 444 rows + 1 notice(s), every contentHash recomputed
  sigs (ethereum-lists/4bytes) from Swarm: 444 rows → create 0, update 0, extend 0, skip 444, left to expire 0
  notices (ethereum-lists/tokens) from Swarm: 1 rows → create 0, update 0, extend 0, skip 1, left to expire 0
  notices (MyEtherWallet/ethereum-lists) from Swarm: 2 rows → create 0, update 0, extend 0, skip 2, left to expire 0
  notices (ethereum-lists/4bytes) from Swarm: 1 rows → create 0, update 0, extend 0, skip 1, left to expire 0

Spent 0 tGLM; balance 8.882080126 tGLM.
```

Everything is `skip` because Arkiv currently matches the snapshots exactly. If
entities had expired or been changed, the same run would list them as `create`
or `update`. Gateway fallback, with the first gateway unreachable:

```text
$ pnpm --filter @selfnode/scripts arkiv:mirror --from-swarm --dry-run --only sigs \
    --swarm-gateways https://gateway.invalid,https://api.gateway.ethswarm.org
  skipped https://gateway.invalid: fetch failed
  downloaded from https://api.gateway.ethswarm.org: 297.9 KiB, sha256 matches the entity
```

## In the app: "Load labels from the Swarm archive" (opt-in)

Settings → **Swarm archive**. Off by default, never automatic, never remembered:
one click downloads the three snapshots (about 2.7 MB) straight from bzz.limo
for this session. A warning above the button says the gateway sees your IP
address, because Anon-RPC only carries JSON-RPC. The Privacy page lists it as a
party and an exception.

The expected SHA-256s come from the `selfnode-snapshot` entities on Arkiv, read
through Anon-RPC. If Arkiv can't be reached, the app uses the pointers pinned in
the build and says why. A file is used only if its hash, format, dataset, owner
and row count all check out. Once loaded, the archive answers label and
function-name lookups first (shown as "from the Swarm archive"); anything it
doesn't have still goes to Arkiv. Code:
[`packages/core/src/labels/archive.ts`](../packages/core/src/labels/archive.ts)
(tests in `archive.test.ts`, live check in `archive.live.test.ts`) and
[`apps/web/src/state/labels.tsx`](../apps/web/src/state/labels.tsx). Verified on
the live site: no gateway request before the click, three verified downloads
after it, and decoded calls attributed to the archive.

## The web app on Swarm

The production web build (commit `970e60f`) is also on Swarm, and **Private
mode works from it**:

- **URL:** [https://bah5acgza24rt5fzsundf6gykleqgqmhtpzrmc2bd2fwx66hixe6z6wcdzura.bzz.limo/](https://bah5acgza24rt5fzsundf6gykleqgqmhtpzrmc2bd2fwx66hixe6z6wcdzura.bzz.limo/)
- **Swarm reference:** `d7233e9732a3465f1b0a59206830f37e62c16823d16d7f78e8b93d9f5843cd22` (a website
  collection; index and error document `index.html`, so deep links work)
- **Arkiv:** `selfnode-snapshot` entity
  `0x8746ba3e56aacc8a4bafe1959e19519d533a6f6140ac9041326c420cdee905c4`
  (`dataset = "web"`, `version` / `sourceCommit` = the git commit, `rowCount` =
  88 files, `sha256` of the uploaded tar).
- **Script:** `pnpm --filter @selfnode/scripts swarm:site`
  ([`scripts/arkiv-mirror/site.ts`](../scripts/arkiv-mirror/site.ts)): uploads
  `apps/web/dist` through bzz.limo with plain fetch, checks the URL serves this
  build's `index.html` byte-for-byte, then writes the entity. It refuses to run
  with uncommitted app code.

Tested in a headless browser from that URL: Nox reached Ready through the
sandbox iframe, live Sepolia reads, Arkiv labels and decoded calls, the Data
page and a deep-link reload all worked, with 13 calls through Anon-RPC, the 2
usual bootstrap reads, 0 direct, and no CSP violations.

**Differences from the Cloudflare site** (a gateway can't send our headers):

- The CSPs are `<meta>` tags. Verified enforced: injected inline scripts and
  third-party scripts are blocked. But `frame-ancestors` can't be set from a
  meta tag, and `X-Frame-Options`, COOP and HSTS aren't sent, so the Swarm copy
  can be framed by another site (see the next point). The Cloudflare site
  remains the primary one.
- **Clickjacking defence in the app itself:** because this copy can be framed,
  the Wallet and Swap pages refuse to render inside a frame (`window.top !==
window.self`) and show "Open Selfnode directly" instead. Checked by framing
  this URL from another origin.
- It's a separate origin, so its settings, wallet and worker-hash pins are
  separate from the Cloudflare site's.
- Only bzz.limo serves it, at the base32 CID subdomain (root-absolute paths
  need their own origin). `bzz.link` and `api.gateway.ethswarm.org` redirect
  websites to `bzz.link/forbidden`; `bzz.limo/bzz/<ref>/` serves the files, but
  the app's absolute paths don't resolve under that prefix.
- Same batch caveat as above: the gateway's own postage batch, so we don't know
  how long it stays retrievable.

## Demo video

Swarm segment at **[TIMESTAMP: to be added after recording]**.

## Friction notes

- **The postage batch is invisible.** With a public gateway we can't see the
  batch ID, who funds it or its TTL, so we can't say how long the snapshots will
  stay retrievable. A documented way for a gateway to report the batch (or the
  expected retention) of an upload would make public-gateway uploads usable for
  anything that matters. Running our own Bee node with a batch we bought was out
  of scope for the hackathon.
- **Uploading itself was easy.** `POST /bzz` with a JSON body returned a
  reference immediately; no SDK or CLI needed. Re-uploading identical bytes
  returns the identical reference, which made idempotent snapshots trivial.
- **`bzz.link` subdomains need a CID**, not the hex reference: a 64-character hex
  reference is longer than a DNS label allows (`https://<hex>.bzz.link`
  fails to resolve). The `/bzz/<hex>/` path form on bzz.limo and
  api.gateway.ethswarm.org works.
- **No way to check retention or replication from the gateway**: `/stewardship`
  and `/tags/<id>` return 404 on bzz.limo, so "uploaded" can only be confirmed by
  reading back, which we do from two gateways.
- **Tooling and our dependency policy:** the suggested
  `npm install --global @ethersphere/swarm-cli` would pull its dependencies at
  their latest versions, outside our minimum-release-age policy. We ran it once
  via `npx` from `/tmp` for the feasibility test, then used plain `fetch` in the
  repo.
- **Privacy:** reading from a gateway reveals the reader's IP to it. Anon-RPC
  only carries JSON-RPC, so a browser can't fetch Swarm content through it.
  That's why the app's archive download is opt-in and comes with a warning,
  never automatic. A way to fetch Swarm content over a mixnet would remove that
  trade-off.
