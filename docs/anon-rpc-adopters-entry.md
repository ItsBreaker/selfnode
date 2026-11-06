# Entry for the anon-rpc adopters list

Added under `walletsAndApps` in
[`ethereum/anon-rpc/adopters.json5`](https://github.com/ethereum/anon-rpc/blob/main/adopters.json5)
by a PR against that file alone, as the file asks. Approved by the maintainer
after the site was deployed.

```json5
    {
      id: "selfnode",
      label: "Selfnode",
      kind: "wallet",
      url: "https://selfnode.jhfe.workers.dev/",
      note: "A private wallet, block explorer and Uniswap swap app. Every RPC call in the default Private mode goes through anon-rpc (Nox by default; Nym or Tor if chosen), including Arkiv label lookups and every transaction broadcast, except one disclosed bootstrap read of the worker specifier. It never falls back to a direct connection without the user's per-action approval, and shows a live counter of the share of traffic routed through anon-rpc.",
      workers: ["nox", "nym", "tor-js"],
    },
```

PR title: `adopters: add Selfnode (wallet)`.
