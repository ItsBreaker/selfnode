# Data quality

What Selfnode mirrors into Arkiv, where it comes from, how it's cleaned, and how
fresh it is. Every number below comes from the importer's own output
(`scripts/arkiv-mirror`, first full run on 2026-11-06).

## Sources and licences

All three sources are MIT-licensed, so republishing is allowed, provided the
copyright notice travels with the data. It does, in three places:

1. On **every entity**: `source` (repository), `license` (`MIT`) and
   `sourceCommit` (the exact commit the values were imported from).
2. On Arkiv itself: one `selfnode-dataset` entity per source, holding the
   copyright line and the **full licence text** from that commit.
3. In this repository: [`arkiv/licenses/`](licenses/).

| Dataset                      | Source                                                                                                                        | Pinned commit                              | Licence and copyright                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Address labels and scam list | [MyEtherWallet/ethereum-lists](https://github.com/MyEtherWallet/ethereum-lists/tree/8f86cba9b58db79608ece8fa784775b3c41e2e26) | `8f86cba9b58db79608ece8fa784775b3c41e2e26` | MIT, Copyright (c) 2020 MyEtherWallet ([text](licenses/MyEtherWallet-ethereum-lists.LICENSE.txt)) |
| Mainnet tokens               | [ethereum-lists/tokens](https://github.com/ethereum-lists/tokens/tree/55622d80c18cc5cabaa8cb9a4c4214daaa9cf05e)               | `55622d80c18cc5cabaa8cb9a4c4214daaa9cf05e` | MIT, Copyright (c) 2018 ethereum-lists ([text](licenses/ethereum-lists-tokens.LICENSE.txt))       |
| Sepolia tokens               | MyEtherWallet/ethereum-lists (`dist/tokens/sepolia`)                                                                          | `8f86cba…`                                 | as above                                                                                          |
| Function signatures          | [ethereum-lists/4bytes](https://github.com/ethereum-lists/4bytes/tree/2b8a705fe27833b59aac2a2af5d14e0144e1e56e)               | `2b8a705fe27833b59aac2a2af5d14e0144e1e56e` | MIT, Copyright (c) 2018 Ethereum-Lists Team ([text](licenses/ethereum-lists-4bytes.LICENSE.txt))  |

**No Sourcify data** is used, from any chain.

**Sources we rejected:** `dawsbot/eth-labels` and `brianleect/etherscan-labels`
(MIT code, but the labels are scraped from Etherscan, so the repository's
licence can't grant rights to that data); `Uniswap/default-token-list` and `scamsniffer/scam-database`
(GPL-3.0, which complicates republishing next to MIT code);
`CryptoScamDB/blacklist` and `ethereum-lists/contracts` (no licence).

## What was imported

| Dataset                                                      | Valid rows | Dropped (reason)                                  |
| ------------------------------------------------------------ | ---------- | ------------------------------------------------- |
| Mainnet tokens                                               | 2,104      | 0                                                 |
| Sepolia tokens                                               | 1          | 0                                                 |
| Labels: MyEtherWallet scam list (`category = flagged`)       | 652        | 63 duplicate addresses (715 entries → 652 unique) |
| Labels: MyEtherWallet contract names (`category = contract`) | 144        | 0                                                 |
| Function signatures                                          | 444        | see below                                         |

### Validation and de-duplication rules

- **Addresses** must be valid 20-byte hex. Mixed-case addresses must pass their
  EIP-55 checksum (a bad checksum suggests a typo in the source, so the row is
  dropped, not "fixed"). Stored lowercase.
- **One label per address.** The scam list is read first. If an address is on both
  the scam list and the contract list, the flag wins, because the safer label
  should never be overwritten.
- **Tokens:** a symbol is required, decimals must be an integer from 0 to 36, and a
  duplicate address keeps the first entry.
- **Text fields** are whitespace-normalised. Arkiv `str` values are limited to 128
  UTF-8 bytes, so short fields are trimmed to fit without splitting a character.
  Long text (scam-list notes, signature candidates, licence text) is stored
  unabridged in `bytes` columns.
- **Signatures:** every candidate text is re-hashed, and kept only if
  `keccak256(text)[0:4]` equals its selector. Collisions are kept as several
  `;`-separated candidates; the app tries each one and uses whichever actually
  decodes the calldata.

## How function signatures were chosen (capped import)

4bytes has about a million selectors. Most are never called, so we mirror the
ones that matter, ranked by **real usage**:

1. **Standards first:** ERC-20, ERC-721, ERC-1155, WETH, EIP-2612, Permit2,
   Uniswap's Universal Router, and Uniswap v3/v4 entry points
   (`STANDARD_SIGNATURES` in `scripts/arkiv-mirror/sources.ts`).
2. **Then by observed usage:** we sampled the **300 most recent mainnet blocks**
   (blocks 26,350,922 to 26,351,221): **93,279 transactions**, of which **55,008
   were contract calls** with a selector, using **2,777 distinct selectors**. Each
   selector is ranked by how many calls used it. This counts top-level calls only
   (internal calls would need traces).
3. **Then looked up in 4bytes** at the pinned commit. The cap was 5,000. Only
   **444** of the sampled selectors exist in 4bytes, because the repository was
   last updated in December 2024 and much recent contract activity post-dates it.
   Those 444 still **cover 68.4% of all sampled calls**. Coverage, not budget, is
   the limit.
4. **Known gap:** four Uniswap v4 entry points (`modifyLiquidities`, `unlock`,
   `initialize` and the v4 Quoter's `quoteExactInputSingle`) aren't in 4bytes,
   since v4 launched after its last update. We didn't fill the gap from an
   unapproved source. Selfnode decodes its own Uniswap calls from contract ABIs in
   its code.

`rank` (1 = highest) records this order, so consumers can take the top N.

## Freshness

- Entities live **90 days**. Each importer run patches rows whose content changed,
  extends unchanged rows with fewer than 45 days left, and skips the rest.
- Rows that disappear from a source are **not** extended, so they expire on their
  own.
- Re-runs are cheap. The third run on 2026-11-06 skipped **all 3,345** existing
  rows at zero cost and only created the 4 new licence-notice entities
  (0.0016 tGLM).
- **Refreshed daily by
  [`.github/workflows/arkiv-mirror.yml`](https://github.com/ItsBreaker/selfnode/actions/workflows/arkiv-mirror.yml)**
  (02:17 UTC, plus manual runs; `main` only, never on pull requests). It runs
  the same importer against each source's latest commit, with the 2 tGLM
  reserve guard and at most 1 tGLM per run, and posts a per-dataset summary
  (created / updated / extended / skipped / tGLM) to the run page. The mirror
  key and Arkiv access key are repository secrets, never in the repo.
- A daily run starts with an empty cache, so it takes a fresh 300-block usage
  sample; function-name ranks can shift a little, which costs at most a few
  patches (444 × 0.00002 tGLM ≈ 0.009 tGLM if every rank changed). Locally the
  sample is cached for 7 days.
- `sourceCommit` records the commit a row's values were imported from. Rows
  whose content is unchanged aren't rewritten when a source gets new commits.

## Query filters available

Indexed attributes, all combinable with `and`/`or`, always with `ownedBy(<mirror>)`:

| Entity             | Filter on                                                                          |
| ------------------ | ---------------------------------------------------------------------------------- |
| `selfnode-label`   | `chain`, `address`, `category` (`contract`, `flagged`), `source`, `rowKey`, `type` |
| `selfnode-token`   | `chain`, `address`, `symbol`, `source`, `rowKey`, `type`                           |
| `selfnode-sig`     | `selector`, `rank` (e.g. `lte("rank", i32(100))`), `source`, `rowKey`, `type`      |
| `selfnode-dataset` | `dataset`, `source`, `rowKey`, `type`                                              |

## Cost

Measured on Rabdi (`scripts/arkiv-mirror/cost-probe.ts`, 20 entities per batch):

| Operation               | tGLM per entity |
| ----------------------- | --------------- |
| Create, 1-day lifetime  | 0.000134        |
| Create, 30-day lifetime | 0.000175        |
| Create, 90-day lifetime | 0.000271        |
| Extend by 30 days       | 0.000071        |
| Patch one attribute     | 0.000020        |

Total spent on the initial import, including the cost probe and one aborted
batch that cost nothing (the SDK validates before sending): **about 1.10 tGLM**,
leaving 8.88 tGLM, above the 2 tGLM reserve kept for re-runs and Swarm snapshot
entities. The importer refuses to write below the reserve (`--reserve`).
