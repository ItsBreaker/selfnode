/* global Response */
// Runs only for /assets/* (see wrangler.jsonc run_worker_first); everything else
// is served straight from static assets with public/_headers.
//
// The static host answers unknown paths with index.html (single-page app), which
// is right for app routes but wrong for build files: an old tab asking for a
// chunk from a previous deploy would get HTML with a 200. Return a real 404 so
// the browser reports an error and the app reloads onto the new build.
export default {
  async fetch(request, env) {
    const res = await env.ASSETS.fetch(request);
    const type = res.headers.get("content-type") ?? "";
    if (res.status === 200 && type.startsWith("text/html")) {
      return new Response("Not found: this file isn't part of the current build.\n", {
        status: 404,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      });
    }
    return res;
  },
};
