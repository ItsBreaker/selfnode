/**
 * The privacy report's content: who learns what, per mode. This is what judges
 * and users read, so every line must match the code. `status: "planned"` marks
 * features not built yet; the page says so rather than implying they exist.
 */
import type { Mode } from "@selfnode/core";

export interface Party {
  name: string;
  who: string;
  status: "live" | "planned";
  learns: Record<Mode, string>;
}

export const PARTIES: Party[] = [
  {
    name: "Public RPC provider",
    who: "PublicNode by default (changeable in Settings).",
    status: "live",
    learns: {
      private:
        "Your requests (addresses, transactions) but not your IP address: it sees the anonymity network's exit instead.",
      verified: "Not used for reads. Helios's execution RPC (below) takes its place.",
      mynode: "Nothing. Your node answers. Selfnode never falls back to a public RPC.",
    },
  },
  {
    name: "Anonymity network",
    who: "Nox by default; Nym or Tor if you choose them.",
    status: "live",
    learns: {
      private:
        "Its operators see that you use it and the timing of your traffic. Its sandboxed worker sees your requests, including signed transactions before broadcast. With Nox, TLS to the RPC runs inside the worker, so the exit node relays traffic it can't read.",
      verified: "Only your outgoing transactions, which are always broadcast through it.",
      mynode: "Only your outgoing transactions, which are always broadcast through it.",
    },
  },
  {
    name: "Bootstrap provider",
    who: "PublicNode, on the chain where the network's specifier contract lives (Sepolia for Nox, Ethereum for Nym and Tor).",
    status: "live",
    learns: {
      private:
        "Your IP address and that you're starting this anonymity network: one read of the specifier contract's worker hash and resolvers. Nothing about your addresses. This read isn't anonymised, because the anonymity network doesn't exist yet.",
      verified: "The same single read (the network is still used for broadcasts).",
      mynode:
        "Nothing, if your node is on the specifier's chain (Sepolia for Nox): the read goes to your own node instead. Otherwise (e.g. Nym or Tor, whose specifier is on Ethereum, with a Sepolia-only node) the same single public read.",
    },
  },
  {
    name: "Swarm gateway (bzz.limo)",
    who: 'Only if you click "Load labels from the Swarm archive" in Settings.',
    status: "live",
    learns: {
      private:
        "Nothing, unless you load the archive. Then: your IP address and that you downloaded Selfnode's label archive (three public snapshot files, about 2.7 MB), once per session. Not anonymised: the anonymity network only carries JSON-RPC. Nothing about your own addresses. Files are used only if their SHA-256 matches the one recorded on Arkiv.",
      verified: "The same: nothing unless you load the archive.",
      mynode: "The same: nothing unless you load the archive.",
    },
  },
  {
    name: "Worker download source",
    who: "The resolver URLs published in the specifier contract.",
    status: "live",
    learns: {
      private:
        "Your IP address, when the network's code bundle is downloaded. The bytes are only run if their hash matches the one pinned on-chain.",
      verified: "The same, once.",
      mynode: "The same, once.",
    },
  },
  {
    name: "Helios upstreams",
    who: "An execution RPC and a consensus endpoint (PublicNode by default on Ethereum; yours on Sepolia).",
    status: "live",
    learns: {
      private: "Not used.",
      verified:
        "Your IP address and every read request. Helios can't use the anonymity network. Answers are verified against consensus, and the consensus endpoint is trusted for the starting checkpoint.",
      mynode: "Not used.",
    },
  },
  {
    name: "Your node and its peers",
    who: "The node you configure in Settings, or one run by the desktop app.",
    status: "live",
    learns: {
      private: "Not used.",
      verified: "Not used.",
      mynode:
        "Your node sees your requests. If it runs on someone else's machine, they do too. Its peers see the node's IP address, but not your requests or transactions, because those are broadcast through the anonymity network.",
    },
  },
  {
    name: "Checkpoint sync provider",
    who: "A beacon node that serves a recent finalized state (ethpandaops by default; changeable in the desktop app's Node settings).",
    status: "live",
    learns: {
      private: "Not used.",
      verified: "Not used.",
      mynode:
        "Desktop node manager only, once, on the first sync: your IP address and that you're starting a Sepolia beacon node. Nothing about your addresses.",
    },
  },
  {
    name: "Arkiv",
    who: "The Arkiv testnet RPC, for address labels and function names.",
    status: "live",
    learns: {
      private:
        "Which addresses and function selectors you look up, but not your IP address: lookups go through the anonymity network and are cached locally.",
      verified: "Same as Private: lookups go through the anonymity network.",
      mynode: "Same as Private: lookups go through the anonymity network.",
    },
  },
  {
    name: "Uniswap",
    who: "Uniswap Labs and its servers.",
    status: "live",
    learns: {
      private:
        "Nothing. Quotes and swaps are calls to Uniswap's on-chain contracts through your active route. There is no Uniswap API, so the RPC provider sees them like any other request.",
      verified: "Nothing. As above, through Helios.",
      mynode: "Nothing. As above, through your node.",
    },
  },
  {
    name: "Web host",
    who: "Cloudflare, serving this site's static files.",
    status: "live",
    learns: {
      private:
        "Your IP address and that you loaded Selfnode. No RPC traffic goes through it, and the site loads no third-party scripts, fonts or analytics.",
      verified: "The same.",
      mynode: "The same. The desktop app doesn't use it at all.",
    },
  },
];

export const EXCEPTIONS: { title: string; detail: string }[] = [
  {
    title: "The bootstrap read",
    detail:
      'Starting an anonymity network needs one direct read of its on-chain specifier (worker hash and resolvers). It\'s counted as "Bootstrap read" in the traffic counter. In My node mode it goes to your own node when that node is on the specifier\'s chain, and is counted as "Your node".',
  },
  {
    title: "Verified mode",
    detail:
      "Helios takes URLs, not a fetch function, so its reads go direct to its upstreams. It's a separate mode you choose, labelled Helios · direct everywhere.",
  },
  {
    title: "My node mode",
    detail: "Reads go to your node. Broadcasts still go through the anonymity network.",
  },
  {
    title: "Direct requests you approve",
    detail:
      "If the anonymity network is down, Selfnode shows an error. It never retries directly on its own. A direct request only happens when you confirm it for that one action, and the connection indicator turns amber and counts it.",
  },
  {
    title: "The Swarm archive, if you load it",
    detail:
      "Off by default. Clicking \"Load labels from the Swarm archive\" in Settings downloads three public snapshot files directly from the bzz.limo gateway, which sees your IP. They're plain downloads, not RPC calls, so they aren't in the traffic counter. The files are used only if their SHA-256 matches the one recorded on Arkiv.",
  },
];

export const TRUST_POINTS: { title: string; detail: string }[] = [
  {
    title: "The specifier contract",
    detail:
      "The anonymity network's code is identified by a hash stored on-chain. You trust whoever controls that contract, and the bootstrap provider to report the hash honestly. Anyone can rebuild the published bundle and check the hash. Selfnode remembers the hash each network used on this device; if it changes, it stops and asks before running the new code, and connects nowhere if you decline.",
  },
  {
    title: "The anonymity network's worker",
    detail:
      "It runs sandboxed, with no access to your keys, storage or this page. Like any RPC path, though, it sees your requests and could censor or lie about responses.",
  },
  {
    title: "Helios's checkpoint",
    detail:
      "Verified mode starts from the latest finalized checkpoint reported by its consensus endpoint. A dishonest endpoint could start Helios from a wrong checkpoint. Use an endpoint you trust, ideally your own node's.",
  },
  {
    title: "The checkpoint sync provider",
    detail:
      "The desktop node manager starts Nimbus from a recent finalized state served by a checkpoint provider, instead of syncing from genesis. A dishonest provider could start your node on the wrong chain. Use a provider you trust, or compare the checkpoint against another source; you can change it in the Node settings.",
  },
  {
    title: "Private mode isn't verified",
    detail:
      "The RPC provider can't see who you are, but Selfnode can't check its answers either. Use Verified mode or your own node when correctness matters most.",
  },
];
