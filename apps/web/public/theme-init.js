/* global localStorage, matchMedia, document */
// Set the theme before first paint (no inline script, so the CSP needs no hash).
// Mirrors src/theme.ts.
(function () {
  var p = localStorage.getItem("selfnode:theme");
  var dark = p === "dark" || (p !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
})();
