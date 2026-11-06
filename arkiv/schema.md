# Arkiv schema

Selfnode mirrors open-licensed Ethereum metadata into Arkiv's **Rabdi testnet**
(chain ID `7794095`). The schemas live in
[`packages/core/src/labels/schema.ts`](../packages/core/src/labels/schema.ts) and
are shared by the importer and the app.

## Owner

Every entity is written by the mirror wallet
**`0xA05A5c06d69dECa38FdB779957d4E7B3aC2B8c39`**
([explorer](https://rabdi.explorer.arkiv.network/address/0xA05A5c06d69dECa38FdB779957d4E7B3aC2B8c39)).
Arkiv is public: anyone can write an entity that _looks_ like ours. So every
read, in the app and in the examples below, is scoped with `ownedBy(<mirror wallet>)`.

## Entities

Each schema is a named SDK schema, so entities also carry the indexed
`arkiv.schema` tag. We additionally set `type`, for clients that don't use the
SDK's schemas.

### Common provenance (on every entity)

| Attribute      | Indexed | Meaning                                                              |
| -------------- | ------- | -------------------------------------------------------------------- |
| `rowKey`       | yes     | Deterministic upsert key (Arkiv reserves `key`, so we use `rowKey`). |
| `source`       | yes     | Source repository, e.g. `MyEtherWallet/ethereum-lists`.              |
| `license`      | no      | `MIT` for every current source.                                      |
| `sourceCommit` | no      | The exact commit the current values were imported from.              |
| `contentHash`  | no      | SHA-256 of the row's values, used to skip unchanged rows on re-runs. |

### `selfnode-label` (`type = "label"`)

| Attribute  | Indexed | Example                                                |
| ---------- | ------- | ------------------------------------------------------ |
| `chain`    | yes     | `"1"`                                                  |
| `address`  | yes     | lowercase `0x…`                                        |
| `name`     | no      | `"Flagged by MyEtherWallet's list"` or a contract name |
| `category` | yes     | `contract` or `flagged`                                |
| `note`     | no      | The scam list's comment, if any                        |

`rowKey = label:<chainId>:<address>`

### `selfnode-token` (`type = "token"`)

| Attribute  | Indexed  | Example             |
| ---------- | -------- | ------------------- |
| `chain`    | yes      | `"1"`, `"11155111"` |
| `address`  | yes      | lowercase `0x…`     |
| `symbol`   | yes      | `USDC`              |
| `name`     | no       | `USD Coin`          |
| `decimals` | no (i32) | `6`                 |

`rowKey = token:<chainId>:<address>`

### `selfnode-sig` (`type = "sig"`)

| Attribute  | Indexed   | Example                                                                                             |
| ---------- | --------- | --------------------------------------------------------------------------------------------------- |
| `selector` | yes       | `0xa9059cbb`                                                                                        |
| `text`     | no        | `transfer(address,uint256)`; several candidates are `;`-separated, because 4-byte selectors collide |
| `rank`     | yes (i32) | `1` = highest priority (standards first, then by observed mainnet usage)                            |

`rowKey = sig:<selector>`

### `selfnode-dataset` (`type = "dataset"`)

One per (dataset, source). This is where the MIT notice travels with the data,
on Arkiv itself.

| Attribute     | Indexed  | Example                                                 |
| ------------- | -------- | ------------------------------------------------------- |
| `dataset`     | yes      | `labels`, `tokens`, `sigs`                              |
| `copyright`   | no       | `Copyright (c) 2020 MyEtherWallet`                      |
| `licenseText` | no       | Full MIT licence text from the source at `sourceCommit` |
| `url`         | no       | Link to the source tree at that commit                  |
| `rowCount`    | no (u64) | Rows imported from this source                          |

### `selfnode-snapshot` (`type = "snapshot"`), Swarm bonus phase

One per dataset (`rowKey = snapshot:<dataset>`): `dataset`, `version` (the
snapshot file format, `selfnode-arkiv-snapshot/1`), `rowCount`, `sha256` (of the
file), `swarmRef` (an unencrypted Swarm reference), `createdAt` (Unix seconds),
plus the usual provenance (`source = selfnode/arkiv-snapshots`, `sourceCommit` =
the datasets' source commits). Written by `--snapshot`; see [swarm.md](swarm.md).

## Expiration

Entities are written with a **90-day** lifetime. Each importer run extends any
unchanged entity with fewer than 45 days left back to 90 days, and patches
changed ones. Rows that disappear from a source are **not** extended, so they
expire on their own. That keeps the mirror fresh without anyone deleting
anything.

## Query it yourself

```ts
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { and, eq } from "@arkiv-network/sdk/query";
import { http } from "viem";
import { LabelSchema } from "@selfnode/core/labels/schema"; // or define the same schema yourself

const MIRROR = "0xA05A5c06d69dECa38FdB779957d4E7B3aC2B8c39";
const client = createPublicClient({ chain: rabdi({ accessKey: "" }), transport: http() }); // no key needed to read

const flagged = await client
  .select({ address: true, name: true, note: true, source: true, sourceCommit: true })
  .from(LabelSchema)
  .where(and(eq("chain", "1"), eq("category", "flagged")))
  .ownedBy(MIRROR)
  .limit(10)
  .fetch();
```
