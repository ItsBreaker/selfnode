# Arkiv SDK and docs friction

Kept as we go. Honest notes, newest last.

- `@arkiv-network/sdk@1.0.1` README recommends an access key because the public
  RPC is heavily rate-limited. It is unclear from the docs whether _reads_ need
  one, which matters for a public web app that cannot hold a secret.
