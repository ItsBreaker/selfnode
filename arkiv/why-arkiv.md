# Why Arkiv (and not Postgres)

Selfnode's goal is a wallet and explorer that don't depend on any one company's
servers. Address labels, token metadata and function names are exactly the kind
of shared data every wallet and explorer needs, and today it mostly lives in a few
private databases (Etherscan's labels, 4byte.directory's API). Mirroring it into
Arkiv changes who controls it.

What would be lost if this were a Postgres database we ran:

- **Anyone can read it, without asking us.** There's no API key, signup or rate
  plan we control. The Rabdi public endpoint served our owner-scoped queries
  keylessly, and any wallet or script can run the same query
  ([schema.md](schema.md#query-it-yourself)).
- **Our own Data page is just another reader.**
  [selfnode.jhfe.workers.dev/data](https://selfnode.jhfe.workers.dev/data) browses the mirror
  with the same keyless, owner-scoped queries anyone can run, and shows each one
  as a copy-paste snippet. There's no private API behind it.
- **It doesn't depend on us staying online.** If Selfnode's maintainers vanish, the
  entities stay readable until they expire, and anyone can re-run the open importer
  to publish their own copy under their own owner address.
- **Provenance is checkable, not promised.** Every entity says which repository
  and which exact commit it came from, and the owner address is part of the
  query. A Postgres table would ask you to trust our export; here you can diff
  any row against the source at `sourceCommit`.
- **No single company can take it down.** A hosted database is one account
  suspension or one invoice away from disappearing. The mirror lives on a network
  we don't operate.
- **Expirations keep it fresh by default.** In a database, stale rows stay forever
  unless someone deletes them. Here, rows dropped from a source simply aren't
  extended, so they age out. Freshness becomes a property of the system, not a
  cleanup job: a daily workflow (
  [`.github/workflows/arkiv-mirror.yml`](https://github.com/ItsBreaker/selfnode/actions/workflows/arkiv-mirror.yml))
  re-runs the importer, which patches what changed and extends what's close to
  expiry. An unchanged run costs nothing.
- **It's composable with privacy.** Selfnode reads Arkiv through Anon-RPC, so the
  Arkiv endpoint learns which labels are looked up but not who looked them up. A
  private API we ran would see both, and would be tempting to log.

What we give up, honestly: queries are simpler than SQL (no joins, and no `IN`, so
we batch with `OR`). Text search is prefix-only and only on indexed attributes,
so the Data page searches label names and function texts on the device. Writes
cost testnet gas. And the store is shared, so reads
_must_ be scoped by owner to avoid look-alike entities.
