import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

/**
 * Dev-only: lets headless spike pages POST their results back so they can be
 * recorded without a test-runner dependency. Writes outside the repo (path
 * from SPIKE_OUT); never enabled in builds.
 */
function spikeResults(): Plugin {
  return {
    name: "selfnode-spike-results",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__spike", (req, res) => {
        const out = process.env.SPIKE_OUT;
        if (req.method !== "POST" || !out) return void res.writeHead(404).end();
        const name = (req.url ?? "").replace(/[^a-z0-9-]/gi, "") || "result";
        let body = "";
        req.on("data", (c: Buffer) => (body += c.toString()));
        req.on("end", () => {
          writeFileSync(resolve(out, `${name}.json`), body);
          res.writeHead(204).end();
        });
      });
    },
  };
}

/**
 * Self-host Anon-RPC's iframe bootstrap so the strict CSP needs no
 * 'unsafe-inline' (the harness otherwise injects an inline srcdoc script).
 * Served in dev and emitted in builds, straight from the pinned package.
 */
function anonRpcIframe(): Plugin {
  const require = createRequire(import.meta.url);
  const hostEntry = require.resolve("@anon-rpc/browser-harness");
  const bootJs = () => readFileSync(new URL("./iframe-boot.js", `file://${hostEntry}`), "utf8");
  const html =
    '<!doctype html><meta charset="utf-8"><title>anon-rpc sandbox</title><script src="/anon-rpc-iframe.js"></script>\n';
  return {
    name: "selfnode-anon-rpc-iframe",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === "/anon-rpc-iframe.html")
          return void res.setHeader("content-type", "text/html").end(html);
        if (req.url === "/anon-rpc-iframe.js")
          return void res.setHeader("content-type", "text/javascript").end(bootJs());
        next();
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "anon-rpc-iframe.html", source: html });
      this.emitFile({ type: "asset", fileName: "anon-rpc-iframe.js", source: bootJs() });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), anonRpcIframe(), spikeResults()],
  build: {
    // Never inline assets as data: URLs (Vite inlines files < 4 kB by default,
    // e.g. small font subsets), so the CSP can keep font-src/img-src at 'self'.
    assetsInlineLimit: 0,
    rollupOptions: { input: { main: resolve(import.meta.dirname, "index.html") } },
  },
});
