import { writeFileSync } from "node:fs";
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

export default defineConfig({
  plugins: [react(), tailwindcss(), spikeResults()],
  build: {
    rollupOptions: { input: { main: resolve(import.meta.dirname, "index.html") } },
  },
});
