/**
 * Generates the local test keys straight into .env (gitignored).
 * Private keys are NEVER printed or logged; only the derived addresses are.
 * Re-running is safe: existing keys are kept, never overwritten.
 */
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";

const ENV_PATH = resolve(import.meta.dirname, "../../.env");
const KEYS = ["SEPOLIA_TEST_PRIVATE_KEY", "ARKIV_MIRROR_PRIVATE_KEY"] as const;
const isKey = (v: string | undefined): v is `0x${string}` => !!v && /^0x[0-9a-fA-F]{64}$/.test(v);

let env = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
const current = (name: string) => env.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim();

for (const name of KEYS) {
  const existing = current(name);
  let key: `0x${string}`;
  if (isKey(existing)) {
    key = existing;
    console.log(`${name}: kept existing key`);
  } else {
    key = generatePrivateKey();
    const line = `${name}=${key}`;
    env =
      current(name) !== undefined
        ? env.replace(new RegExp(`^${name}=.*$`, "m"), line)
        : `${env}${env && !env.endsWith("\n") ? "\n" : ""}${line}\n`;
    console.log(`${name}: generated new key`);
  }
  console.log(`  address: ${privateKeyToAddress(key)}`);
}

writeFileSync(ENV_PATH, env, { mode: 0o600 });
chmodSync(ENV_PATH, 0o600);
console.log(`Wrote .env (mode 600). Private keys were not printed.`);
