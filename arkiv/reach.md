# Reach: who uses this, and how others can

## Now

- **Selfnode itself.** The explorer labels every address it shows (contract
  names, token names, MyEtherWallet's scam list) and decodes calldata with the
  mirrored function names. The wallet checks every recipient against the mirror
  before signing, and warns, with the source named, if the address is flagged.
  All reads go through Anon-RPC and are cached on the device.

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
- **Freshness:** re-running the importer is cheap when nothing changed (it only
  extends entities close to expiry), so it suits a scheduled job, for example
  weekly, well inside the 45-day extension window.
