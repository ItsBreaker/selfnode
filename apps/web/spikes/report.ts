/** Shared helper for spike pages: show results and POST them to the dev server. */
export function report(name: string, data: unknown): void {
  const json = JSON.stringify(data, null, 2);
  const out = document.getElementById("out");
  if (out) out.textContent = json;
  void fetch(`/__spike/${name}`, { method: "POST", body: json });
}

export const now = () => performance.now();
export const ms = (t0: number) => Math.round(performance.now() - t0);
export const errMsg = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));
