/**
 * What each client is actually doing, in plain words, from what the clients
 * themselves report. No ETA is guessed: a percentage is shown only when the
 * client prints one.
 *
 * Nethermind (2.2.2): during snap sync `eth_syncing` reports currentBlock 0
 * until the state download finishes, so block numbers say nothing. Its sync
 * stage RPC (`debug_getSyncStage`) needs the Debug namespace, which we keep
 * disabled. Instead we read the log lines the manager already receives. The
 * markers below are strings found in the shipped 2.2.2 binary:
 *   "Sync mode changed from <modes> to <modes>"      (SyncMode flags)
 *   "Snap         State Ranges (Phase 1 of 2): (…"   (snap progress, %)
 *   "Snap - State Ranges (Phase 1 of 2) finished."
 *   "State Sync (Phase 2 of 2, healing)"
 *   "Beacon Headers …", "Old Headers …"               (header progress)
 *   "Waiting for peers..."
 * Nimbus: the standard beacon API `/eth/v1/node/syncing`
 * (is_syncing, sync_distance, is_optimistic, el_offline).
 */

export interface SyncStage {
  /** e.g. "Syncing state (snap)", "Downloading headers", "Catching up blocks". */
  label: string;
  /** Extra facts the client reported, e.g. "also downloading headers · 1,204,000 / 12,077,300". */
  detail?: string;
  /** Only when the client printed a percentage itself. */
  percent?: number;
}

/** What we've learned from Nethermind's log so far. */
export interface NethermindLogView {
  modes: string[] | null;
  snapPercent: number | null;
  snapDone: boolean;
  healing: boolean;
  headers: { kind: "Beacon" | "Old"; done: number; total: number } | null;
  waitingForPeers: boolean;
}

export const emptyNethermindView = (): NethermindLogView => ({
  modes: null,
  snapPercent: null,
  snapDone: false,
  healing: false,
  headers: null,
  waitingForPeers: false,
});

const num = (s: string) => Number(s.replace(/[,_\s]/g, ""));

/** Fold one Nethermind log line into the view (returns the same object if nothing changed). */
export function readNethermindLine(v: NethermindLogView, line: string): NethermindLogView {
  const mode = line.match(/Sync mode changed from .*? to (.+?)\s*$/);
  if (mode?.[1]) {
    const modes = mode[1]
      .split(/[,|]/)
      .map((m) => m.trim())
      .filter(Boolean);
    return { ...v, modes, waitingForPeers: modes.includes("Disconnected") };
  }
  if (/State Ranges \(Phase 1 of 2\)\s*(is )?finished/.test(line))
    return { ...v, snapDone: true, snapPercent: 100 };
  const snap = line.match(/State Ranges \(Phase 1 of 2\)[^(]*\(\s*([\d.]+)\s*%/);
  if (snap?.[1]) return { ...v, snapPercent: Math.min(100, Number(snap[1])) };
  if (/State Sync \(Phase 2 of 2, healing\)/.test(line))
    return { ...v, healing: true, snapDone: true };
  const hdr = line.match(/\b(Beacon|Old) Headers\s+([\d,]+)\s*\/\s*([\d,]+)/);
  if (hdr?.[1] && hdr[2] && hdr[3])
    return {
      ...v,
      headers: { kind: hdr[1] as "Beacon" | "Old", done: num(hdr[2]), total: num(hdr[3]) },
    };
  if (/Waiting for peers\.\.\./.test(line)) return { ...v, waitingForPeers: true };
  return v;
}

const fmt = (n: number) => n.toLocaleString("en-US");

/** Plain words for Nethermind's SyncMode flags, most informative first. */
const MODE_WORDS: [mode: string, words: string][] = [
  ["StateNodes", "Syncing state (healing)"],
  ["SnapSync", "Syncing state (snap)"],
  ["FastSync", "Syncing state (fast sync)"],
  ["UpdatingPivot", "Choosing a sync starting point"],
  ["BeaconHeaders", "Downloading headers"],
  ["FastHeaders", "Downloading headers"],
  ["FastBodies", "Downloading block bodies"],
  ["FastReceipts", "Downloading receipts"],
  ["DbLoad", "Loading blocks from disk"],
  ["Full", "Catching up blocks"],
  ["WaitingForBlock", "At the chain head"],
  ["Disconnected", "Waiting for peers"],
];

export function describeNethermind(
  v: NethermindLogView,
  rpc: { syncing: boolean | null; currentBlock: number | null; highestBlock: number | null },
): SyncStage | null {
  if (rpc.syncing === false && rpc.currentBlock) return { label: "Synced" };
  const headers = v.headers
    ? `${v.headers.kind === "Beacon" ? "headers" : "old headers"} ${fmt(v.headers.done)} / ${fmt(v.headers.total)}`
    : null;
  const active = (v.modes ?? []).filter((m) => m !== "None");
  const ranked = MODE_WORDS.filter(([m]) => active.includes(m));
  const unknown = active.filter((m) => !MODE_WORDS.some(([k]) => k === m));
  const top = ranked[0];
  if (v.waitingForPeers && (!top || top[0] === "Disconnected"))
    return { label: "Waiting for peers" };

  let stage: SyncStage | null = null;
  // A healing line after snap finished is newer news than a SnapSync mode logged earlier.
  if (top && !(top[0] === "SnapSync" && (v.healing || v.snapDone))) stage = { label: top[1] };
  else if (v.healing) stage = { label: "Syncing state (healing)" };
  else if (v.snapPercent !== null && !v.snapDone) stage = { label: "Syncing state (snap)" };
  else if (headers) stage = { label: "Downloading headers" };
  else if (rpc.syncing && rpc.currentBlock) stage = { label: "Catching up blocks" };
  else if (unknown.length) stage = { label: "Syncing" };
  else if (rpc.syncing)
    stage = { label: "Syncing", detail: "waiting for Nethermind to report its stage" };
  if (!stage) return null;

  // Facts the client reported, attached to the stage they belong to.
  const extra: string[] = [];
  if (stage.label === "Syncing state (snap)" && v.snapPercent !== null && !v.snapDone)
    stage.percent = v.snapPercent;
  if (stage.label === "Syncing state (healing)") extra.push("phase 2 of 2");
  // (Catching up blocks: the Node page already shows #current / highest.)
  const alsoHeaders =
    stage.label !== "Downloading headers" &&
    ranked.some(([m]) => m === "BeaconHeaders" || m === "FastHeaders");
  if (headers && (stage.label === "Downloading headers" || alsoHeaders))
    extra.push(alsoHeaders ? `also downloading ${headers}` : headers);
  else if (alsoHeaders) extra.push("also downloading headers");
  if (unknown.length) extra.push(`mode ${unknown.join(", ")}`);
  if (extra.length) stage.detail = [stage.detail, ...extra].filter(Boolean).join(" · ");
  return stage;
}

export interface NimbusSyncing {
  is_syncing: boolean;
  sync_distance: string | number;
  is_optimistic?: boolean;
  el_offline?: boolean;
}

export function describeNimbus(s: NimbusSyncing | null): SyncStage | null {
  if (!s) return null;
  const behind = Number(s.sync_distance);
  if (s.el_offline) return { label: "Waiting for Nethermind", detail: "execution client offline" };
  if (s.is_syncing)
    return { label: "Syncing the beacon chain", detail: `${fmt(behind)} slots behind` };
  if (s.is_optimistic)
    return {
      label: "Following the chain",
      detail: "optimistic until Nethermind finishes syncing",
    };
  return { label: "Synced" };
}
