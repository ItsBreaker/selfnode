# Arkiv SDK and docs friction

Kept as we go. Honest notes, newest last.

- `@arkiv-network/sdk@1.0.1` README recommends an access key because the public
  RPC is heavily rate-limited. It is unclear from the docs whether _reads_ need
  one, which matters for a public web app that cannot hold a secret.
- Answered by experiment: keyless reads via `rabdi({ accessKey: "" })` work
  (60 reads in a burst, no throttling). Stating that in the README would save
  web-app builders a worry.
- `rabdi()` throws unless `accessKey` is a string, even an empty one. Fine once
  known, but `rabdi()` with no options could default to the public endpoint.
- A query with no predicate throws `InvalidPredicateError` ("no spelling for
  'match every entity'"). Clear message; worth a line in the README since
  "list everything" is the first thing people try.
- The access key travels in the URL path, so it shows up in any proxy or RPC
  log of the URL. Worth documenting for people routing traffic through relays.
- The SDK's `rabdi({ accessKey })` only supports putting the key in the URL
  path. The endpoint also accepts an `X-API-KEY` header (a real key raised the
  rate limit from 2000 to 5000; a bogus one got 401), but this isn't documented
  in the SDK README. We use the header so the key never appears in URLs or logs.
  A `rabdi({ accessKey, via: "header" })` option would help.
- Writes are fast: `createEntity` resolved in 3.3 s including block inclusion.
- `key` is a reserved attribute name (the SDK throws `InvalidAttributeNameError`).
  We use `rowKey`. A list of reserved names in the README would help, since `key`
  is the most natural name for an upsert key.
- `str` values are capped at **128 UTF-8 bytes**. The error is excellent: it names
  the value and suggests a `bytes` column. But the limit isn't in the README's
  schema section, so we only found it mid-import, on a 134-byte scam-list
  comment. We moved long text (notes, signature candidates, licence text) to
  `bytes`, and byte-fit the short `str` fields.
- Integer columns need explicit wrappers: a JS `bigint` is treated as `u256`, so a
  `u64` column needs `u64(...)`. Clear error, easy fix. Worth one line in the docs.
- No `IN` operator; we batch lookups with `or(eq(...), ...)` in chunks of 25.
  Works well.
- Good: `executeBatch` (creates, patches and extensions in one transaction) makes
  idempotent mirroring easy and cheap. The SDK validates every value **before**
  sending, so bad rows cost no gas.
- Good: costs are low and predictable. We measured them with a probe
  (`scripts/arkiv-mirror/cost-probe.ts`): create ≈ 0.00027 tGLM per entity at a
  90-day lifetime, extend ≈ 0.00007, patch ≈ 0.00002. A table of this kind in the
  docs would help builders budget before they start.
- Pagination by `$key` (`orderBy(asc("$key"))` + `gt("$key", key(last))`) is
  documented clearly and worked first time.
