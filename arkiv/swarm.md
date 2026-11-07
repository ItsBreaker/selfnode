# Swarm: dataset snapshots referenced from Arkiv

Selfnode's Arkiv mirror (tokens, address labels and the scam list, function
names) is also published as **one snapshot file per dataset on Swarm**. Each
snapshot has a `selfnode-snapshot` entity on Arkiv that holds its Swarm
reference and SHA-256, so anyone can find the archive through Arkiv, fetch it
from any Swarm gateway and check it hasn't been altered. The mirror script can
rebuild or repair the Arkiv entities from those snapshots (`--from-swarm`).

**Networks:** the files are on **Swarm mainnet**, with postage paid on **Gnosis
Chain**; the pointer entities are on **Arkiv's Rabdi testnet**; the data itself
describes **Ethereum mainnet and Sepolia** (tokens, labels and function names
for both).

## What lives where

|               | Arkiv (Rabdi testnet, owner `0xA05A5c06d69dECa38FdB779957d4E7B3aC2B8c39`)                                              | Swarm (unencrypted)                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **What**      | One queryable entity per row: 2,105 tokens, 796 labels, 462 function names, plus licence notices ([schema](schema.md)) | One JSON file per dataset (`tokens`, `labels`, `sigs`): every row exactly as on Arkiv, plus that dataset's licence notices |
| **Used for**  | Live lookups by the app (address → label, selector → function name), through Anon-RPC                                  | An archive of the whole dataset at a point in time; bulk download; rebuilding Arkiv                                        |
| **Pointer**   | `selfnode-snapshot` entity per dataset: **`swarmRef`** holds the Swarm reference; `sha256` the file's hash             | —                                                                                                                          |
| **Integrity** | Every row has a `contentHash`; reads are always scoped by owner                                                        | Content-addressed reference, and the file must match the entity's `sha256` before anything uses it                         |
| **Lifetime**  | 90 days, extended by each importer run                                                                                 | Our postage batch: TTL about 28.9 days on 2026-11-07, so until about 2026-12-05 (see below)                                |

The `selfnode-snapshot` entity (`type = "snapshot"`, one per dataset, `rowKey =
snapshot:<dataset>`):

| Attribute                          | Example                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| `dataset`                          | `sigs` (indexed)                                                                |
| `swarmRef`                         | `27ee40b590654b64f185a577ec240a14b4f6a33625789573848a956d836387bf`              |
| `sha256`                           | `bb0b67fdeb54474018588c8f56e7a6bcc279a9e3707e36d76843c335292fc368`              |
| `rowCount`                         | `613` (u64)                                                                     |
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
| sigs    | `0x0188f3e29dbe9aea7882e1a9fb67bc5af5eb2ed5ff43eda1282e04c9a49cab6d` | [`27ee40b5…387bf`](https://bzz.limo/bzz/27ee40b590654b64f185a577ec240a14b4f6a33625789573848a956d836387bf/) | 408 KiB | 613   |

Full references: tokens
`a287f7361bf3091782ddfc1bea22575ca4d8e4cfe631665f524ab037018ff00d`, labels
`6f24208ce8ae294cb6179ea5c2565c5a06ad2621b140d32cb1476483305a6e89`, sigs
`27ee40b590654b64f185a577ec240a14b4f6a33625789573848a956d836387bf`. All three
read back byte-for-byte from bzz.limo and `https://api.gateway.ethswarm.org/bzz/<ref>/`
after the 2026-11-07 upload.

The sigs snapshot has **613** rows: everything the mirror owns on Arkiv at
export time, which is the 462 function names from the latest import plus 151
older ones that are no longer in the source and are left to expire (they aren't
extended). tokens and labels didn't change, so they kept the same references.
The app's built-in fallback pointer for sigs (used only if Arkiv can't be
reached) still names the previous 444-row snapshot `b23b5b23…`, which bzz.limo
still serves.

## Postage batch and Bee node

- **Batch:** `ec74f01450338e4cad4ca3435f4e8cb09b677c032bce1c7208ccccc258febd86`, label `selfnode-public-mirror`, depth 19, immutable.
- **Who provided it:** provided by the Swarm Foundation via a Devcon 8 Mumbai
  gift code.
- **TTL:** `batchTTL` 2,493,840 s (about 28.9 days) when checked on 2026-11-07
  at 00:20 IST, so it expires around **2026-12-05 15:30 UTC** unless topped up.
  `usable: true`.
- **Bee node:** Nook v0.7.7, running a local Bee light node (Bee 2.8.3) on Swarm
  mainnet, API at `http://127.0.0.1:1633`. Uploads go to that node with plain
  `fetch` and the `swarm-postage-batch-id` header (plus
  `swarm-deferred-upload: false`, so the call returns once the chunks are pushed).
- **Reads** use bzz.limo, then `api.gateway.ethswarm.org` as a fallback; the
  upload is only reported as done once both serve the expected SHA-256.
- **Earlier uploads** (2026-11-06) went through the bzz.limo public gateway,
  stamped with the gateway's own batch. Re-uploading the same bytes with our
  batch gives the same reference, so the tokens and labels references didn't
  change and are now also covered by our batch.
- If the batch expires, the snapshots may stop being retrievable; the Arkiv data
  is unaffected, and `--snapshot` can re-upload them with a new batch.

## Files

| File                                                                              | What it does                                                                                                                   |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [`scripts/arkiv-mirror/swarm.ts`](../scripts/arkiv-mirror/swarm.ts)               | Upload (`POST /bzz` on bzz.limo, or your own Bee node) and verified download (bzz.limo, then api.gateway.ethswarm.org)         |
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
# Through the bzz.limo public gateway (its own batch):
pnpm --filter @selfnode/scripts arkiv:mirror --snapshot --only sigs

# Through your own Bee node and batch (what the current snapshots used):
SWARM_UPLOAD_URL=http://127.0.0.1:1633 SWARM_POSTAGE_BATCH_ID=<batch id> \
  pnpm --filter @selfnode/scripts arkiv:mirror --snapshot
```

Real run through the local Bee node, 2026-11-07 (only the sigs entity changed;
0.000084 tGLM):

```text
[snapshot] sigs
  exported 613 rows + 1 licence notice(s) from Arkiv (ethereum-lists/4bytes@2b8a705: 613); every contentHash re-checked
  408.3 KiB, sha256 bb0b67fdeb54474018588c8f56e7a6bcc279a9e3707e36d76843c335292fc368
  uploaded via http://127.0.0.1:1633 (batch ec74f014…): 27ee40b590654b64f185a577ec240a14b4f6a33625789573848a956d836387bf (swarm-tag none)
  read back from https://bzz.limo: 408.3 KiB, sha256 matches
  read back from https://api.gateway.ethswarm.org: 408.3 KiB, sha256 matches

[snapshot] Arkiv entities
  snapshots: 3 rows → create 0, update 1, extend 0, skip 2, left to expire 0
```

First run, through bzz.limo (2026-11-06; first upload of all three datasets cost
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

Expected output (from the first snapshot, 2026-11-06; today it prints the
613-row snapshot above):

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
curl -s https://bzz.limo/bzz/27ee40b590654b64f185a577ec240a14b4f6a33625789573848a956d836387bf/ | shasum -a 256
# bb0b67fdeb54474018588c8f56e7a6bcc279a9e3707e36d76843c335292fc368  -
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

The production web build (commit `c95186a`, with frame-busting and the Anon-RPC
resilience changes) is also on Swarm, uploaded through our Bee node with our
batch, and **Private mode works from it**:

- **URL:** [https://bah5acgzaioxjlpvswpkqqryu7ed5ylkw7ajxcadarxiignu44j2u2agvkykq.bzz.limo/](https://bah5acgzaioxjlpvswpkqqryu7ed5ylkw7ajxcadarxiignu44j2u2agvkykq.bzz.limo/)
- **Swarm reference:** `43ae95beb2b3d5084714f907dc2d56f8137100608dd083369ce2754d00d55615` (a website
  collection; index and error document `index.html`, so deep links work)
- **Arkiv:** `selfnode-snapshot` entity
  `0x8746ba3e56aacc8a4bafe1959e19519d533a6f6140ac9041326c420cdee905c4`
  (`dataset = "web"`, `version` / `sourceCommit` = the git commit, `rowCount` =
  87 files, `sha256` of the uploaded tar).
- **Script:** `pnpm --filter @selfnode/scripts swarm:site`
  ([`scripts/arkiv-mirror/site.ts`](../scripts/arkiv-mirror/site.ts)): uploads
  `apps/web/dist` with plain fetch (bzz.limo, or your own node with the same
  two environment variables as above), checks the URL serves this
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
- Same batch as the snapshots, so the same expiry (around 2026-12-05).

## Demo video

Swarm segment at **2:40–3:20**.

## Friction notes

- **With a public gateway the postage batch is invisible.** We couldn't see the
  batch ID, who funds it or its TTL, so we couldn't say how long uploads would
  stay retrievable. A documented way for a gateway to report the batch (or the
  expected retention) of an upload would make public-gateway uploads usable for
  anything that matters. We moved to our own batch (a Devcon gift code) on a
  local Bee light node, where `/stamps` shows the TTL.
- **Own node, plain fetch:** with Nook's local Bee node, the only changes were
  the URL and the `swarm-postage-batch-id` header. `swarm-deferred-upload:
false` made the upload call wait until the chunks were pushed, so the
  read-back from the public gateways worked straight away.
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
