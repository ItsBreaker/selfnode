/**
 * The app:// protocol: serves the production web build from disk with the
 * same security headers as the website. Only the "selfnode" host is served,
 * and paths can't escape the build directory.
 */
import { net, protocol } from "electron";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { headersFor, parseHeaders } from "./headers";

export const SCHEME = "app";
export const HOST = "selfnode";
export const ORIGIN = `${SCHEME}://${HOST}`;

/** Must run before app "ready". */
export function registerScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        codeCache: true,
        stream: true,
      },
    },
  ]);
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".wasm": "application/wasm",
};

export function handleScheme(webRoot: string): void {
  const rules = parseHeaders(readFileSync(join(webRoot, "_headers"), "utf8"));
  const root = normalize(webRoot + sep);
  protocol.handle(SCHEME, async (req) => {
    const url = new URL(req.url);
    if (url.host !== HOST) return new Response("Not found", { status: 404 });
    let path = decodeURIComponent(url.pathname);
    let file = normalize(join(root, path));
    if (!file.startsWith(root)) return new Response("Forbidden", { status: 403 });
    // Single-page app: unknown non-asset paths serve index.html (like the Worker).
    if (!existsSync(file) || statSync(file).isDirectory()) {
      if (extname(path)) return new Response("Not found", { status: 404 });
      path = "/index.html";
      file = join(root, "index.html");
    }
    const res = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(headersFor(rules, path === "/index.html" ? url.pathname : path));
    headers.set("content-type", TYPES[extname(file)] ?? "application/octet-stream");
    headers.delete("strict-transport-security"); // meaningless for app://
    return new Response(res.body, { status: 200, headers });
  });
}
