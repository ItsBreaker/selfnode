# Prepared entry for the anon-rpc adopters list (NOT opened)

To add Selfnode under `walletsAndApps` in
[`ethereum/anon-rpc/adopters.json5`](https://github.com/ethereum/anon-rpc/blob/main/adopters.json5),
the file's guidance says a PR against that file alone is enough. **Don't open it
without the maintainer's OK.** Also replace the `url` once there's a public
deployment.

```json5
    {
      id: "selfnode",
      label: "Selfnode",
      kind: "wallet",
      url: "https://github.com/ItsBreaker/selfnode",
      note: "A private wallet, block explorer and Uniswap swap app. Every RPC call goes through anon-rpc by default (Nox, or Nym/Tor if chosen), including Arkiv label lookups and every transaction broadcast. It never falls back to a direct connection without the user's per-action approval, and shows a live counter of the share of traffic routed through anon-rpc.",
      workers: ["nox", "nym", "tor-js"],
    },
```

Suggested PR title: `adopters: add Selfnode (wallet)`.
