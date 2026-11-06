/**
 * Swarm over public gateways, with plain fetch (no swarm-cli or bee-js).
 *
 * Upload: POST /bzz on the bzz.limo public gateway (recommended by the Swarm
 * team). It stamps uploads with its own postage batch; the batch ID and its
 * lifetime are not exposed. Uploads are unencrypted, so anyone can read them.
 *
 * Download: bzz.limo first, then api.gateway.ethswarm.org. Content is
 * verified against an expected SHA-256 before it's used, so a gateway can't
 * substitute data unnoticed.
 */
import { createHash } from "node:crypto";

export const UPLOAD_GATEWAY = "https://bzz.limo";
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
    headers: { "Content-Type": contentType },
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
