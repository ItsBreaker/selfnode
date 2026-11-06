/**
 * Real shutdown test (CI on windows-latest and macos-latest, or locally):
 * download the pinned, verified Nethermind and Nimbus; run them on Sepolia
 * with the production command lines for RUN_SECONDS; stop them with the
 * production graceful method (Ctrl+C on Windows, SIGINT elsewhere); and assert
 * each one exited by itself (not force-killed), with its documented clean-interrupt
 * exit code (Nethermind 130 = ExitCodes.SigInt, Nimbus 0), after
 * printing its own clean-shutdown line.
 *
 *   pnpm --filter @selfnode/desktop build && node apps/desktop/scripts/shutdown-test.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const appDir = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const { loadManifest, currentPlatform } = require(join(appDir, "dist/node/manifest.js"));
const { ensureInstalled } = require(join(appDir, "dist/node/install.js"));
const { startClient } = require(join(appDir, "dist/node/process.js"));
const { nethermindArgs, nimbusArgs, CLEAN_SHUTDOWN, CLEAN_EXIT_CODE } = require(
  join(appDir, "dist/node/args.js"),
);

const RUN_SECONDS = Number(process.env.RUN_SECONDS ?? 75);
const work =
  process.env.SHUTDOWN_TEST_DIR ??
  mkdtempSync(join(process.env.RUNNER_TEMP ?? tmpdir(), "selfnode-shutdown-"));
const logs = join(work, "logs");
const results = {};
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
// This test must survive any stray console Ctrl+C (it never should receive one).
process.on("SIGINT", () => log("(test runner ignored a SIGINT)"));

const platform = currentPlatform();
if (!platform) throw new Error(`No official builds for ${process.platform}-${process.arch}`);
const manifest = loadManifest(appDir);
const binRoot = join(work, "bin");
const data = { nethermind: join(work, "data/nethermind"), nimbus: join(work, "data/nimbus") };
for (const d of [logs, data.nethermind, data.nimbus]) mkdirSync(d, { recursive: true });
const jwt = join(work, "data/jwt.hex");
writeFileSync(jwt, Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex"), {
  mode: 0o600,
});

log(`platform ${platform}, work dir ${work}`);
const el = await ensureInstalled(manifest, "nethermind", platform, binRoot, (m) => log(m));
const cl = await ensureInstalled(manifest, "nimbus", platform, binRoot, (m) => log(m));

const clean = { nethermind: false, nimbus: false };
const tails = { nethermind: [], nimbus: [] };
const start = (client, inst, args) =>
  startClient({
    name: client,
    binary: inst.binary,
    args,
    cwd: inst.dir,
    logDir: logs,
    onLine: (l) => {
      if (CLEAN_SHUTDOWN[client].test(l)) clean[client] = true;
      tails[client].push(l);
      if (tails[client].length > 400) tails[client].shift();
    },
    onNote: (n) => log("note:", n),
  });

const procs = {
  nethermind: start("nethermind", el, nethermindArgs(data.nethermind, jwt)),
  nimbus: start("nimbus", cl, nimbusArgs(data.nimbus, jwt)),
};
log(`running both clients for ${RUN_SECONDS} s…`);
await new Promise((r) => setTimeout(r, RUN_SECONDS * 1000));

let chainId = null;
try {
  const r = await fetch("http://127.0.0.1:8545", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
  });
  chainId = (await r.json()).result;
} catch (e) {
  log("eth_chainId failed:", e.message);
}
for (const c of ["nethermind", "nimbus"])
  if (!procs[c].running)
    throw new Error(`${c} exited before the stop. Last lines:\n${tails[c].slice(-30).join("\n")}`);
log(`both running; Nethermind eth_chainId = ${chainId}`);

for (const c of ["nimbus", "nethermind"]) {
  const t0 = Date.now();
  const r = await procs[c].stop(60_000);
  results[c] = {
    graceful: r.graceful,
    exitCode: r.code,
    signal: r.signal,
    cleanShutdownLine: clean[c],
    stopSeconds: Math.round((Date.now() - t0) / 1000),
  };
  log(c, JSON.stringify(results[c]));
}
writeFileSync(
  join(work, "shutdown-result.json"),
  JSON.stringify({ platform, chainId, results }, null, 2),
);

const failures = [];
if (chainId !== "0xaa36a7")
  failures.push(`Nethermind RPC answered chainId ${chainId}, expected Sepolia 0xaa36a7`);
for (const [c, r] of Object.entries(results)) {
  if (!r.graceful) failures.push(`${c} had to be force-killed`);
  if (r.exitCode !== CLEAN_EXIT_CODE[c])
    failures.push(
      `${c} exit code ${r.exitCode} (signal ${r.signal}), expected its clean-interrupt code ${CLEAN_EXIT_CODE[c]}`,
    );
  if (!r.cleanShutdownLine)
    failures.push(`${c} didn't print its clean-shutdown line (${CLEAN_SHUTDOWN[c]})`);
}
if (failures.length) {
  for (const c of ["nethermind", "nimbus"])
    console.log(`--- last ${c} lines ---\n${tails[c].slice(-25).join("\n")}`);
  console.error("FAIL:\n- " + failures.join("\n- "));
  process.exit(1);
}
log("PASS: both clients shut down cleanly via the graceful method.");
if (!process.env.KEEP_WORK && !process.env.CI) rmSync(work, { recursive: true, force: true });
