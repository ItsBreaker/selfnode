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
