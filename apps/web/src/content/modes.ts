/**
 * What each connection mode hides and what it doesn't. Shown in the mode
 * popover and the Privacy page; keep the two in sync by using this file only.
 * Accuracy matters more than reassurance here.
 */
import type { Mode } from "@selfnode/core";

export interface ModeCopy {
  summary: string;
  hides: string[];
  reveals: string[];
}

export const MODE_COPY: Record<Mode, ModeCopy> = {
  private: {
    summary:
      "Every request travels through an anonymity network (Nox by default) before it reaches a public RPC.",
    hides: [
      "Your IP address from the RPC provider, so it can't link your addresses to you.",
      "Which of your addresses belong together, across requests.",
    ],
    reveals: [
      "What you ask for. The RPC provider still sees the requests themselves (addresses, transactions) and can log them.",
      "Answers aren't verified. A dishonest RPC provider could return wrong data.",
      "The anonymity network's operators see traffic timing, and its worker sees your requests (including signed transactions before broadcast).",
      "On startup, one direct read of the network's specifier contract (not your addresses) goes to a public RPC.",
    ],
  },
  verified: {
    summary:
      "Helios checks every answer against Ethereum consensus, so a server can't lie to you undetected.",
    hides: ["Nothing extra about your identity. This mode trades privacy for verification."],
    reveals: [
      "Your IP address and your requests to the Helios upstreams (an execution RPC and a consensus endpoint). Helios can't use the anonymity network.",
      "You trust the consensus endpoint for the starting checkpoint.",
      "Transactions you send still go out through the anonymity network.",
    ],
  },
  mynode: {
    summary: "Your own node answers every read, so no RPC provider sees your requests.",
    hides: ["Your requests and addresses from every RPC provider."],
    reveals: [
      "Your node's peers see your node's IP address, but not your requests.",
      "If the node runs on someone else's machine, its operator sees your requests.",
      "Transactions still go out through the anonymity network, because broadcasting from your node would reveal your IP to its peers.",
    ],
  },
};
