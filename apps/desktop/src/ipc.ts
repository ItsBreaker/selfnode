/**
 * IPC between the UI and the main process. Specific channels only (no generic
 * invoke). Every message must come from our app:// main frame, and every
 * argument is validated before use.
 */
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Notification,
  powerMonitor,
  safeStorage,
  type IpcMainInvokeEvent,
} from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NodeManager, type NodeSettings } from "./node/manager";
import { loadManifest, unsupportedReason } from "./node/manifest";
import { preflight } from "./node/preflight";
import { ORIGIN } from "./protocol";

function trusted(e: IpcMainInvokeEvent): boolean {
  const frame = e.senderFrame;
  return !!frame && frame === e.sender.mainFrame && frame.url.startsWith(`${ORIGIN}/`);
}

function guard<A extends unknown[], R>(fn: (...args: A) => R | Promise<R>) {
  return async (e: IpcMainInvokeEvent, ...args: unknown[]): Promise<R> => {
    if (!trusted(e)) throw new Error("Untrusted IPC sender");
    return fn(...(args as A));
  };
}

const isHttpsUrl = (v: unknown): v is string => {
  if (typeof v !== "string" || v.length > 300) return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
};

export function setupIpc(appRoot: string): NodeManager {
  const manifest = loadManifest(appRoot);
  const settingsPath = join(app.getPath("userData"), "node-settings.json");
  const defaults: NodeSettings = {
    dataDir: join(app.getPath("userData"), "node-data", "sepolia"),
    pauseOnBattery: true,
    checkpointUrl: manifest.checkpointSync.sepolia[0] ?? "",
  };
  const load = (): NodeSettings => {
    try {
      const raw = JSON.parse(readFileSync(settingsPath, "utf8")) as Partial<NodeSettings>;
      return {
        dataDir:
          typeof raw.dataDir === "string" && existsSync(raw.dataDir)
            ? raw.dataDir
            : defaults.dataDir,
        pauseOnBattery:
          typeof raw.pauseOnBattery === "boolean" ? raw.pauseOnBattery : defaults.pauseOnBattery,
        checkpointUrl: isHttpsUrl(raw.checkpointUrl) ? raw.checkpointUrl : defaults.checkpointUrl,
      };
    } catch {
      return defaults;
    }
  };
  let settings = load();
  const save = () => writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

  const broadcast = (channel: string, payload: unknown) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, payload);
  };
  const manager = new NodeManager(
    manifest,
    join(app.getPath("userData"), "bin"),
    settings,
    (s) => broadcast("node:status", s),
    (title, body) => {
      if (Notification.isSupported()) new Notification({ title, body }).show();
    },
  );

  ipcMain.handle(
    "node:info",
    guard(() => ({
      unsupported: unsupportedReason(),
      manifest: {
        checkedAt: manifest.checkedAt,
        maintainerReviewed: manifest.maintainerReviewed,
        clients: {
          nethermind: manifest.clients.nethermind.version,
          nimbus: manifest.clients.nimbus.version,
        },
        disk: manifest.disk,
        checkpointSync: manifest.checkpointSync.sepolia,
      },
    })),
  );
  ipcMain.handle(
    "node:preflight",
    guard(() => preflight(manifest, settings.dataDir)),
  );
  ipcMain.handle(
    "node:status",
    guard(() => manager.status),
  );
  ipcMain.handle(
    "node:settings",
    guard(() => settings),
  );
  ipcMain.handle(
    "node:start",
    guard(() => manager.start()),
  );
  ipcMain.handle(
    "node:stop",
    guard(() => manager.stop()),
  );
  ipcMain.handle(
    "node:logs",
    guard((source: unknown) => {
      if (
        source !== undefined &&
        source !== "nethermind" &&
        source !== "nimbus" &&
        source !== "selfnode"
      )
        throw new Error("bad source");
      return manager.logs(source).slice(-500);
    }),
  );
  ipcMain.handle(
    "node:resync",
    guard(async (client: unknown) => {
      if (client !== "nethermind" && client !== "nimbus") throw new Error("bad client");
      const name = client === "nethermind" ? "Nethermind" : "Nimbus";
      const win = BrowserWindow.getFocusedWindow();
      const opts = {
        type: "warning" as const,
        buttons: [`Delete ${name} data and resync`, "Cancel"],
        defaultId: 1,
        cancelId: 1,
        message: `Resync ${name} from checkpoint?`,
        detail: `This deletes ${name}'s database in ${settings.dataDir}. The next start syncs it again, which can take hours. Your wallet isn't affected.`,
      };
      const { response } = win
        ? await dialog.showMessageBox(win, opts)
        : await dialog.showMessageBox(opts);
      if (response !== 0) return { deleted: false };
      await manager.resync(client);
      return { deleted: true };
    }),
  );
  ipcMain.handle(
    "node:setPauseOnBattery",
    guard((v: unknown) => {
      if (typeof v !== "boolean") throw new Error("bad value");
      settings = { ...settings, pauseOnBattery: v };
      manager.updateSettings(settings);
      save();
      return settings;
    }),
  );
  ipcMain.handle(
    "node:setCheckpointUrl",
    guard((v: unknown) => {
      if (!isHttpsUrl(v)) throw new Error("Use an https:// URL");
      settings = { ...settings, checkpointUrl: v };
      manager.updateSettings(settings);
      save();
      return settings;
    }),
  );
  ipcMain.handle(
    "node:chooseDataDir",
    guard(async () => {
      if (manager.running) throw new Error("Stop the node before changing its data directory.");
      const win = BrowserWindow.getFocusedWindow();
      const opts = {
        title: "Choose where to store the node's data",
        properties: ["openDirectory", "createDirectory"] as ("openDirectory" | "createDirectory")[],
      };
      const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
      const dir = r.filePaths[0];
      if (r.canceled || !dir) return settings;
      settings = { ...settings, dataDir: dir };
      manager.updateSettings(settings);
      save();
      return settings;
    }),
  );

  // OS-level encryption for the (already password-encrypted) wallet vault.
  ipcMain.handle(
    "vault:available",
    guard(() => safeStorage.isEncryptionAvailable()),
  );
  ipcMain.handle(
    "vault:wrap",
    guard((text: unknown) => {
      if (typeof text !== "string" || text.length > 64 * 1024) throw new Error("bad value");
      return safeStorage.encryptString(text).toString("base64");
    }),
  );
  ipcMain.handle(
    "vault:unwrap",
    guard((b64: unknown) => {
      if (typeof b64 !== "string" || b64.length > 128 * 1024 || !/^[A-Za-z0-9+/=]+$/.test(b64))
        throw new Error("bad value");
      return safeStorage.decryptString(Buffer.from(b64, "base64"));
    }),
  );

  // OS shutdown / restart (macOS, Linux): delay it until both clients have stopped cleanly.
  // Electron passes an Event here (docs: "If the event handler invokes e.preventDefault()…"),
  // though its typings declare no arguments.
  powerMonitor.on("shutdown", (...args: unknown[]) => {
    if (!manager.running) return;
    (args[0] as Electron.Event | undefined)?.preventDefault();
    void manager.stop().finally(() => app.quit());
  });
  powerMonitor.on("on-battery", () => void manager.onBattery());
  powerMonitor.on("on-ac", () => void manager.onAc());
  return manager;
}
