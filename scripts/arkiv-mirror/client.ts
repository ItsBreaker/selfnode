/**
 * Arkiv clients for the mirror script. The access key is sent ONLY in the
 * X-API-KEY header (never in the URL path) and is redacted from any error.
 */
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

process.loadEnvFile(new URL("../../.env", import.meta.url).pathname);
const accessKey = process.env.ARKIV_ACCESS_KEY ?? "";
const pk = process.env.ARKIV_MIRROR_PRIVATE_KEY as `0x${string}` | undefined;
if (!pk) throw new Error("ARKIV_MIRROR_PRIVATE_KEY must be set in .env");

export const redact = (s: string) => (accessKey ? s.split(accessKey).join("[redacted]") : s);
export const account = privateKeyToAccount(pk);
const chain = rabdi({ accessKey: "" }); // keyless URL; key goes in the header
const transport = () =>
  http(undefined, {
    fetchOptions: accessKey ? { headers: { "X-API-KEY": accessKey } } : {},
    timeout: 60_000,
    retryCount: 3,
  });
export const writer = createWalletClient({ chain, account, transport: transport() });
export const reader = createPublicClient({ chain, transport: transport() });
