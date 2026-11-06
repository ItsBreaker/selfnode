# Reach: who uses this, and how others can

## Now

- **Selfnode itself.** The explorer labels every address it shows (contract
  names, token names, MyEtherWallet's scam list) and decodes calldata with the
  mirrored function names. The wallet checks every recipient against the mirror
  before signing, and warns, with the source named, if the address is flagged.
  All reads go through Anon-RPC and are cached on the device.
- **Anyone, in a browser: the public Data page** at
  [selfnode.jhfe.workers.dev/data](https://selfnode.jhfe.workers.dev/data) (no wallet). Search
  the 2,105 tokens by symbol or address, the 796 labels (652 flagged) by name,
  category or address, and the function names (444 at first import, refreshed
  daily from a fresh usage sample) by selector or text. Every row
  shows its source, licence and source commit, and the page prints a standalone
  "query this yourself" snippet for the exact query it ran.

## Reuse it in your wallet or explorer (copy-paste)

Everything below runs as-is against the live mirror: no access key, no Selfnode
code, just the official SDK. The full script is
[`arkiv/examples/query.ts`](examples/query.ts)
(`npm i @arkiv-network/sdk viem && npx tsx query.ts`).

```ts
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { and, eq } from "@arkiv-network/sdk/query";
import { http } from "viem";

const MIRROR = "0xA05A5c06d69dECa38FdB779957d4E7B3aC2B8c39"; // always scope by owner
const arkiv = createPublicClient({ chain: rabdi({ accessKey: "" }), transport: http() });
```

**Label for an address.** A contract name, a token, or "Flagged by
MyEtherWallet's list":

```ts
const { entities } = await arkiv
  .select({ name: true, category: true, note: true, source: true, sourceCommit: true })
  .where(
    and(
      eq("type", "label"),
      eq("chain", "1"),
      eq("address", "0x09750ad360fdb7a2ee23669c4503c974d86d8694"),
    ),
  )
  .ownedBy(MIRROR)
  .limit(1)
  .fetch();
// → name "Flagged by MyEtherWallet's list", category "flagged",
//   note (bytes, hex-encoded UTF-8) "XRP phishing website (ripple.com.pt) …"
```

**Token by symbol** (a symbol can match several contracts, so check the address):

```ts
const { entities } = await arkiv
  .select({ address: true, name: true, decimals: true, source: true })
  .where(and(eq("type", "token"), eq("chain", "1"), eq("symbol", "USDC")))
  .ownedBy(MIRROR)
  .limit(10)
  .fetch();
// → address 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48, decimals 6, source ethereum-lists/tokens
```

**Function name for a selector** (collisions come back as `;`-separated candidates):

```ts
const { entities } = await arkiv
  .select({ text: true, rank: true, source: true })
  .where(and(eq("type", "sig"), eq("selector", "0xa9059cbb")))
  .ownedBy(MIRROR)
  .limit(1)
  .fetch();
// → text (bytes, hex-encoded UTF-8) "transfer(address,uint256)", rank 1
```

**More filters you can combine** (all indexed):

| Want                             | Filter                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| Every flagged address on mainnet | `and(eq("type","label"), eq("chain","1"), eq("category","flagged"))`                    |
| Labels from one source only      | `eq("source","MyEtherWallet/ethereum-lists")`                                           |
| Sepolia tokens                   | `and(eq("type","token"), eq("chain","11155111"))`                                       |
| The 100 most-used function names | `and(eq("type","sig"), lte("rank", i32(100)))` (`i32` from `@arkiv-network/sdk/schema`) |
| The licence notice for a dataset | `and(eq("type","dataset"), eq("dataset","labels"))`                                     |

**Prefix search** works on indexed `str` attributes, e.g.
`and(eq("type","token"), startsWith("symbol","USD"))` (7 tokens) or
`startsWith("selector","0xa905")`. It does **not** work on non-indexed ones:
`startsWith("name", …)` on labels silently returns nothing, so the Data page
filters names and function texts on the device instead.

Tips: batch many addresses in one query with
`or(addresses.map((a) => eq("address", a)))` (we use chunks of 25). Cache
results, including "not found". Read through an anonymity network if you can,
which is what Selfnode does.

## After the event

- **Any wallet or explorer can query it**, keylessly and without asking us. The
  only requirement is to scope reads by our owner address
  (`0xA05A5c06d69dECa38FdB779957d4E7B3aC2B8c39`). See the runnable query in
  [schema.md](schema.md#query-it-yourself).
- **Typical integrations:**
  - A wallet's send screen: look up the recipient's `selfnode-label` and show a
    warning if `category = "flagged"`.
  - A block explorer or transaction simulator: decode unknown calldata from
    `selfnode-sig`, trying each `;`-separated candidate.
  - A portfolio app: token symbols and decimals from `selfnode-token`.
- **Anyone can fork the mirror.** `scripts/arkiv-mirror/` is open source (MIT) and
  re-runnable. Point it at a funded Rabdi key and it publishes the same datasets
  under a new owner, with the same provenance fields.
- **Freshness:** the mirror is **refreshed daily** by
  [`.github/workflows/arkiv-mirror.yml`](https://github.com/ItsBreaker/selfnode/actions/workflows/arkiv-mirror.yml).
  A run with no source changes only extends entities close to expiry, well
  inside the 45-day extension window, and costs nothing otherwise.
- **Bulk copies:** each dataset is also a verified snapshot on Swarm
  ([swarm.md](swarm.md)); [`examples/swarm-read.ts`](examples/swarm-read.ts)
  fetches one and checks it against Arkiv.
