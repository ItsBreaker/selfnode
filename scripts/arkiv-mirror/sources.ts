/**
 * Dataset readers. Each pins the exact commit it reads, validates every row and
 * de-duplicates. Counts of what was dropped (and why) go into the summary and
 * /arkiv/data-quality.md.
 */
import { getAddress, isAddress, keccak256, toBytes } from "viem";

export const SOURCES = {
  mew: { repo: "MyEtherWallet/ethereum-lists", license: "MIT" },
  tokens: { repo: "ethereum-lists/tokens", license: "MIT" },
  fourbytes: { repo: "ethereum-lists/4bytes", license: "MIT" },
} as const;

export interface Drop {
  reason: string;
  count: number;
}
export interface Dataset<T> {
  source: string;
  license: string;
  commit: string;
  rows: T[];
  drops: Drop[];
}

const UA = { "user-agent": "selfnode-arkiv-mirror" };
/**
 * GitHub API calls: in CI, send the workflow's read-only GITHUB_TOKEN (only to
 * api.github.com) so the shared runner IP isn't rate-limited at 60 requests/hour.
 */
const GH = {
  ...UA,
  ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};

/** A GitHub API GET, retried on 5xx and network errors (a daily job shouldn't fail on one hiccup). */
async function ghFetch(url: string, headers: Record<string, string>): Promise<Response> {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url, { headers });
      if (r.status < 500) return r;
      last = `HTTP ${r.status}`;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    await new Promise((res) => setTimeout(res, 1000 * 2 ** attempt));
  }
  throw new Error(`GitHub API ${new URL(url).pathname}: ${last} after 4 attempts`);
}

/** The current commit of the default branch (pass --commit to pin a specific one). */
export async function headCommit(repo: string): Promise<string> {
  const r = await ghFetch(`https://api.github.com/repos/${repo}/commits/HEAD`, {
    ...GH,
    accept: "application/vnd.github.sha",
  });
  if (!r.ok) throw new Error(`GitHub ${repo}: ${r.status}`);
  const sha = (await r.text()).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`Unexpected commit for ${repo}`);
  return sha;
}

async function raw(repo: string, commit: string, path: string): Promise<string | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`https://raw.githubusercontent.com/${repo}/${commit}/${path}`, {
      headers: UA,
    });
    if (r.status === 404) return null;
    if (r.ok) return r.text();
    await new Promise((res) => setTimeout(res, 500 * 2 ** attempt));
  }
  throw new Error(`fetch failed: ${repo}@${commit}/${path}`);
}

async function listDir(repo: string, commit: string, dir: string): Promise<string[]> {
  const r = await ghFetch(
    `https://api.github.com/repos/${repo}/git/trees/${commit}?recursive=1`,
    GH,
  );
  if (!r.ok) throw new Error(`GitHub tree ${repo}: ${r.status}`);
  const j = (await r.json()) as { tree: { path: string; type: string }[]; truncated: boolean };
  if (j.truncated) throw new Error(`Tree for ${repo} was truncated; can't list ${dir}`);
  return j.tree.filter((t) => t.type === "blob" && t.path.startsWith(dir)).map((t) => t.path);
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx] as T);
      }
    }),
  );
  return out;
}

class Drops {
  #m = new Map<string, number>();
  add(reason: string) {
    this.#m.set(reason, (this.#m.get(reason) ?? 0) + 1);
  }
  list(): Drop[] {
    return [...this.#m].map(([reason, count]) => ({ reason, count }));
  }
}

/** Arkiv `str` values are capped at 128 UTF-8 bytes. Trim to fit without splitting a character. */
export function fitStr(s: string, maxBytes = 128): string {
  const enc = new TextEncoder();
  if (enc.encode(s).length <= maxBytes) return s;
  let out = "";
  for (const ch of s) {
    if (enc.encode(`${out}${ch}…`).length > maxBytes) break;
    out += ch;
  }
  return `${out}…`;
}
/** Collapse whitespace and cap length. By default the result also fits a 128-byte `str`. */
const clean = (s: unknown, max = 120, fitBytes = true) => {
  const t = typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "";
  return fitBytes ? fitStr(t) : t;
};
/** Valid hex address; mixed-case must pass its EIP-55 checksum. */
function addr(a: unknown): string | null {
  if (typeof a !== "string" || !isAddress(a, { strict: false })) return null;
  const mixed = a !== a.toLowerCase() && a !== `0x${a.slice(2).toUpperCase()}`;
  if (mixed && !isAddress(a, { strict: true })) return null;
  return getAddress(a).toLowerCase();
}

// ---------------------------------------------------------------- tokens
export interface TokenRow {
  chainId: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

export async function readTokens(commits: {
  tokens: string;
  mew: string;
}): Promise<Dataset<TokenRow & { source: string }>[]> {
  // Mainnet: ethereum-lists/tokens, one JSON file per token.
  const drops = new Drops();
  const seen = new Set<string>();
  const files = await listDir(SOURCES.tokens.repo, commits.tokens, "tokens/eth/");
  const parsed = await pool(files, 16, async (f) => {
    const text = await raw(SOURCES.tokens.repo, commits.tokens, f);
    try {
      return text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  });
  const mainnet: (TokenRow & { source: string })[] = [];
  for (const t of parsed) {
    if (!t) {
      drops.add("unparseable file");
      continue;
    }
    const a = addr(t.address);
    const symbol = clean(t.symbol, 32);
    const decimals = Number(t.decimals);
    if (!a) {
      drops.add("invalid or bad-checksum address");
      continue;
    }
    if (!symbol) {
      drops.add("missing symbol");
      continue;
    }
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
      drops.add("decimals out of range");
      continue;
    }
    if (seen.has(a)) {
      drops.add("duplicate address");
      continue;
    }
    seen.add(a);
    mainnet.push({
      chainId: 1,
      address: a,
      symbol,
      name: clean(t.name) || symbol,
      decimals,
      source: SOURCES.tokens.repo,
    });
  }

  // Sepolia: ethereum-lists/tokens has none; MyEtherWallet's list has a small one.
  const sdrops = new Drops();
  const sseen = new Set<string>();
  const sep: (TokenRow & { source: string })[] = [];
  const stext = await raw(SOURCES.mew.repo, commits.mew, "dist/tokens/sepolia/tokens-sepolia.json");
  for (const t of (stext ? JSON.parse(stext) : []) as Record<string, unknown>[]) {
    const a = addr(t.address);
    const symbol = clean(t.symbol, 32);
    const decimals = Number(t.decimals);
    if (!a || !symbol || !Number.isInteger(decimals)) {
      sdrops.add("invalid row");
      continue;
    }
    if (sseen.has(a)) {
      sdrops.add("duplicate address");
      continue;
    }
    sseen.add(a);
    sep.push({
      chainId: 11155111,
      address: a,
      symbol,
      name: clean(t.name) || symbol,
      decimals,
      source: SOURCES.mew.repo,
    });
  }
  return [
    {
      source: SOURCES.tokens.repo,
      license: "MIT",
      commit: commits.tokens,
      rows: mainnet,
      drops: drops.list(),
    },
    {
      source: SOURCES.mew.repo,
      license: "MIT",
      commit: commits.mew,
      rows: sep,
      drops: sdrops.list(),
    },
  ];
}

// ---------------------------------------------------------------- labels
export interface LabelRow {
  chainId: number;
  address: string;
  name: string;
  category: "contract" | "flagged";
  note?: string;
}

export async function readLabels(commit: string): Promise<Dataset<LabelRow>> {
  const drops = new Drops();
  const byAddr = new Map<string, LabelRow>();
  // The scam list first: if an address is on both lists, the flag wins (safer).
  const dark = JSON.parse(
    (await raw(SOURCES.mew.repo, commit, "src/addresses/addresses-darklist.json")) ?? "[]",
  ) as Record<string, unknown>[];
  for (const d of dark) {
    const a = addr(d.address);
    if (!a) {
      drops.add("darklist: invalid or bad-checksum address");
      continue;
    }
    if (byAddr.has(a)) {
      drops.add("darklist: duplicate address");
      continue;
    }
    byAddr.set(a, {
      chainId: 1,
      address: a,
      name: "Flagged by MyEtherWallet's list",
      category: "flagged",
      note: clean(d.comment, 1000, false), // stored as bytes, so no 128-byte cap
    });
  }
  const contracts = JSON.parse(
    (await raw(SOURCES.mew.repo, commit, "dist/contracts/eth/contract-abi-eth.min.json")) ?? "[]",
  ) as Record<string, unknown>[];
  for (const c of contracts) {
    const a = addr(c.address);
    const name = clean(c.name);
    if (!a || !name) {
      drops.add("contracts: invalid address or missing name");
      continue;
    }
    if (byAddr.has(a)) {
      drops.add(
        byAddr.get(a)?.category === "flagged"
          ? "contracts: also on scam list (flag kept)"
          : "contracts: duplicate address",
      );
      continue;
    }
    byAddr.set(a, { chainId: 1, address: a, name, category: "contract" });
  }
  return {
    source: SOURCES.mew.repo,
    license: "MIT",
    commit,
    rows: [...byAddr.values()],
    drops: drops.list(),
  };
}

// ---------------------------------------------------------------- signatures
export interface SigRow {
  selector: string;
  texts: string[];
  rank: number;
  uses: number;
}

/** Function signatures we always want, regardless of the usage sample. */
export const STANDARD_SIGNATURES = [
  // ERC-20
  "transfer(address,uint256)",
  "transferFrom(address,address,uint256)",
  "approve(address,uint256)",
  "balanceOf(address)",
  "allowance(address,address)",
  "totalSupply()",
  "decimals()",
  "symbol()",
  "name()",
  // WETH
  "deposit()",
  "withdraw(uint256)",
  // ERC-721
  "safeTransferFrom(address,address,uint256)",
  "safeTransferFrom(address,address,uint256,bytes)",
  "setApprovalForAll(address,bool)",
  "ownerOf(uint256)",
  "getApproved(uint256)",
  "isApprovedForAll(address,address)",
  // ERC-1155
  "safeTransferFrom(address,address,uint256,uint256,bytes)",
  "safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)",
  "balanceOfBatch(address[],uint256[])",
  // Permit2
  "approve(address,address,uint160,uint48)",
  "permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)",
  "transferFrom(address,address,uint160,address)",
  "lockdown((address,address)[])",
  "invalidateNonces(address,address,uint48)",
  // EIP-2612
  "permit(address,address,uint256,uint256,uint8,bytes32,bytes32)",
  // Uniswap Universal Router
  "execute(bytes,bytes[],uint256)",
  "execute(bytes,bytes[])",
  // Uniswap v4 PositionManager / PoolManager / Quoter
  "modifyLiquidities(bytes,uint256)",
  "multicall(bytes[])",
  "unlock(bytes)",
  "initialize((address,address,uint24,int24,address),uint160)",
  "quoteExactInputSingle(((address,address,uint24,int24,address),bool,uint128,bytes))",
  // Uniswap v3
  "exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))",
  "exactInput((bytes,address,uint256,uint256))",
  "quoteExactInputSingle((address,address,uint256,uint24,uint160))",
];

export const selectorOf = (text: string) => keccak256(toBytes(text)).slice(0, 10);

/**
 * Look up each wanted selector in ethereum-lists/4bytes at `commit`, keep only
 * candidate texts whose keccak actually matches, and rank: standards first,
 * then by observed mainnet usage.
 */
export async function readSignatures(
  commit: string,
  usage: Map<string, number>,
  cap: number,
): Promise<Dataset<SigRow>> {
  const drops = new Drops();
  const standard = [...new Set(STANDARD_SIGNATURES.map(selectorOf))];
  const ranked = [...usage.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s)
    .filter((s) => !standard.includes(s));
  const wanted = [...standard, ...ranked].slice(0, cap * 2); // fetch extra: some won't be in 4bytes
  const texts = await pool(wanted, 24, async (sel) => {
    const t = await raw(SOURCES.fourbytes.repo, commit, `signatures/${sel.slice(2)}`);
    return t
      ? t
          .split(";")
          .map((x) => x.trim())
          .filter(Boolean)
      : null;
  });
  const rows: SigRow[] = [];
  wanted.forEach((sel, i) => {
    if (rows.length >= cap) return;
    const cands = texts[i];
    if (!cands) {
      drops.add(
        standard.includes(sel) ? "standard selector not in 4bytes" : "selector not in 4bytes",
      );
      return;
    }
    const verified = cands.filter((c) => selectorOf(c) === sel);
    if (verified.length < cands.length) drops.add("candidate text failed keccak check");
    if (!verified.length) return;
    rows.push({
      selector: sel,
      texts: verified.slice(0, 8),
      rank: rows.length + 1,
      uses: usage.get(sel) ?? 0,
    });
  });
  return { source: SOURCES.fourbytes.repo, license: "MIT", commit, rows, drops: drops.list() };
}

/** The source's LICENSE at the pinned commit, and its copyright line. */
export async function readLicense(
  repo: string,
  commit: string,
): Promise<{ text: string; copyright: string }> {
  const text = (await raw(repo, commit, "LICENSE")) ?? "";
  const copyright =
    text
      .split("\n")
      .find((l) => /^copyright/i.test(l.trim()))
      ?.trim() ?? "";
  if (!/MIT License/i.test(text) || !copyright)
    throw new Error(`${repo}@${commit}: LICENSE isn't the expected MIT text`);
  return { text: text.trim(), copyright };
}
