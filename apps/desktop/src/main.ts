/**
 * Selfnode desktop: the same web UI, served from app://selfnode with the
 * website's security headers, plus (Phase 5) a node manager.
 *
 * Security checklist (brief §5): contextIsolation, sandbox, no nodeIntegration,
 * no remote content in privileged windows, a minimal typed preload bridge,
 * new windows denied (external links only after confirmation), navigation
 * locked to the app origin, strict CSP, devtools off in packaged builds.
 */
import { app, BrowserWindow, dialog, session, shell } from "electron";
import { join } from "node:path";
import { setupIpc } from "./ipc";
import type { NodeManager } from "./node/manager";
import { handleScheme, ORIGIN, registerScheme } from "./protocol";

app.setName("Selfnode"); // userData → .../Selfnode
registerScheme();
let manager: NodeManager | null = null;
let quitting = false;
const headless = process.env.SELFNODE_HEADLESS === "1"; // automation: hidden window
const webRoot = app.isPackaged
  ? join(process.resourcesPath, "web")
  : join(__dirname, "../../web/dist");

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    show: !headless,
    backgroundColor: "#f6f5f1",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
      preload: join(__dirname, "preload.js"),
    },
  });
  // No new windows. External http(s) links open in the OS browser after confirmation.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) {
      void dialog
        .showMessageBox(win, {
          type: "question",
          buttons: ["Open in browser", "Cancel"],
          defaultId: 1,
          cancelId: 1,
          message: "Open this link in your browser?",
          detail: url,
        })
        .then(async ({ response }) => {
          if (response === 0) await shell.openExternal(url);
        });
    }
    return { action: "deny" };
  });
  // Never navigate away from the app.
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(`${ORIGIN}/`)) e.preventDefault();
  });
  void win.loadURL(`${ORIGIN}/`);
  return win;
}

void app.whenReady().then(() => {
  // Deny every permission request (camera, geolocation, notifications, ...).
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  handleScheme(webRoot);
  manager = setupIpc(app.isPackaged ? app.getAppPath() : join(__dirname, ".."));
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("web-contents-created", (_e, contents) => {
  // Block webviews.
  contents.on("will-attach-webview", (e) => e.preventDefault());
});

// Clean shutdown: stop the node's processes before the app exits.
app.on("before-quit", (e) => {
  if (quitting || !manager?.running) return;
  e.preventDefault();
  quitting = true;
  void manager.stop().finally(() => app.quit());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
