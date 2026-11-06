/**
 * Swarm over public gateways, with plain fetch (no swarm-cli or bee-js).
 *
 * Upload: POST /bzz on the bzz.limo public gateway (recommended by the Swarm
 * team), which stamps uploads with its own postage batch (ID and lifetime not
 * exposed). Or, with SWARM_UPLOAD_URL (e.g. a local Bee node at
 * http://127.0.0.1:1633) and SWARM_POSTAGE_BATCH_ID, through your own node and
 * your own batch; the upload then waits until the chunks are pushed to the
 * network. Uploads are unencrypted, so anyone can read them.
 *
 * Download: bzz.limo first, then api.gateway.ethswarm.org. Content is
 * verified against an expected SHA-256 before it's used, so a gateway can't
 * substitute data unnoticed.
 */
import { createHash } from "node:crypto";

export const UPLOAD_GATEWAY =
  process.env.SWARM_UPLOAD_URL?.replace(/\/$/, "") || "https://bzz.limo";
const BATCH = process.env.SWARM_POSTAGE_BATCH_ID?.trim();
if (BATCH && !/^[0-9a-f]{64}$/.test(BATCH))
  throw new Error("SWARM_POSTAGE_BATCH_ID must be 64 hex characters");
/** Where uploads go, for log lines. */
export const UPLOAD_LABEL = BATCH
  ? `${UPLOAD_GATEWAY} (batch ${BATCH.slice(0, 8)}…)`
  : UPLOAD_GATEWAY;
/** Headers for your own batch (and a synchronous push), if one is set. */
const stampHeaders = (): Record<string, string> =>
  BATCH ? { "swarm-postage-batch-id": BATCH, "swarm-deferred-upload": "false" } : {};
export const READ_GATEWAYS = ["https://bzz.limo", "https://api.gateway.ethswarm.org"] as const;

export const sha256Hex = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

const isRef = (r: unknown): r is string => typeof r === "string" && /^[0-9a-f]{64}$/.test(r);

/** Upload one file; returns its Swarm reference (64 hex chars). */
export async function swarmUpload(
  name: string,
  body: Uint8Array,
  contentType = "application/json",
): Promise<{ reference: string; tag: string | null }> {
  const res = await fetch(`${UPLOAD_GATEWAY}/bzz?name=${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "Content-Type": contentType, ...stampHeaders() },
    body: Buffer.from(body),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Swarm upload failed: HTTP ${res.status} ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as { reference?: unknown };
  if (!isRef(json.reference))
    throw new Error(`Swarm upload: unexpected response ${text.slice(0, 200)}`);
  return { reference: json.reference, tag: res.headers.get("swarm-tag") };
}

export interface SwarmRead {
  bytes: Uint8Array;
  gateway: string;
  /** Gateways that failed or served the wrong content before this one. */
  failures: string[];
}

/**
 * Download a reference and check its SHA-256. Tries each gateway in turn; a
 * gateway that serves different bytes counts as a failure, never a success.
 */
export async function swarmDownload(
  reference: string,
  expectedSha256: string,
  gateways: readonly string[] = READ_GATEWAYS,
): Promise<SwarmRead> {
  if (!isRef(reference)) throw new Error(`Not a Swarm reference: ${reference}`);
  const failures: string[] = [];
  for (const g of gateways) {
    try {
      const res = await fetch(`${g}/bzz/${reference}/`, { signal: AbortSignal.timeout(90_000) });
      if (!res.ok) {
        failures.push(`${g}: HTTP ${res.status}`);
        continue;
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      const got = sha256Hex(bytes);
      if (got !== expectedSha256) {
        failures.push(`${g}: SHA-256 mismatch (got ${got.slice(0, 12)}…)`);
        continue;
      }
      return { bytes, gateway: g, failures };
    } catch (e) {
      failures.push(`${g}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(
    `No gateway served ${reference} with the expected SHA-256: ${failures.join("; ")}`,
  );
}

/** Upload a tar as a Swarm website collection (index and error document = index.html for SPA routes). */
export async function swarmUploadSite(
  tar: Uint8Array,
): Promise<{ reference: string; tag: string | null }> {
  const res = await fetch(`${UPLOAD_GATEWAY}/bzz`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-tar",
      "swarm-collection": "true",
      "swarm-index-document": "index.html",
      "swarm-error-document": "index.html",
      ...stampHeaders(),
    },
    body: Buffer.from(tar),
    signal: AbortSignal.timeout(300_000),
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(`Swarm site upload failed: HTTP ${res.status} ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as { reference?: unknown };
  if (!isRef(json.reference))
    throw new Error(`Swarm site upload: unexpected response ${text.slice(0, 200)}`);
  return { reference: json.reference, tag: res.headers.get("swarm-tag") };
}

/**
 * A Swarm reference as a CIDv1 (codec swarm-manifest 0xfa, multihash keccak-256
 * 0x1b), base32: what subdomain gateways like <cid>.bzz.limo expect.
 */
export function swarmCid(reference: string): string {
  if (!isRef(reference)) throw new Error(`Not a Swarm reference: ${reference}`);
  const bytes = Buffer.concat([
    Buffer.from([0x01, 0xfa, 0x01, 0x1b, 0x20]),
    Buffer.from(reference, "hex"),
  ]);
  const A = "abcdefghijklmnopqrstuvwxyz234567";
  let bits = 0;
  let val = 0;
  let out = "";
  for (const b of bytes) {
    val = ((val << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += A[(val >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) out += A[(val << (5 - bits)) & 31];
  return `b${out}`;
}
