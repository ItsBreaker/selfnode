/**
 * Minimal, typed bridge (sandboxed preload). Exposes specific functions only,
 * never ipcRenderer itself or a generic invoke. The main process validates
 * the sender and every argument again.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

const node = Object.freeze({
  info: () => ipcRenderer.invoke("node:info"),
  preflight: () => ipcRenderer.invoke("node:preflight"),
  status: () => ipcRenderer.invoke("node:status"),
  settings: () => ipcRenderer.invoke("node:settings"),
  start: () => ipcRenderer.invoke("node:start"),
  stop: () => ipcRenderer.invoke("node:stop"),
  logs: (source?: "nethermind" | "nimbus" | "selfnode") => ipcRenderer.invoke("node:logs", source),
  setPauseOnBattery: (v: boolean) => ipcRenderer.invoke("node:setPauseOnBattery", v),
  setCheckpointUrl: (url: string) => ipcRenderer.invoke("node:setCheckpointUrl", url),
  chooseDataDir: () => ipcRenderer.invoke("node:chooseDataDir"),
  onStatus: (cb: (status: unknown) => void) => {
    const listener = (_e: IpcRendererEvent, s: unknown) => cb(s);
    ipcRenderer.on("node:status", listener);
    return () => ipcRenderer.removeListener("node:status", listener);
  },
});

const vault = Object.freeze({
  available: () => ipcRenderer.invoke("vault:available") as Promise<boolean>,
  wrap: (text: string) => ipcRenderer.invoke("vault:wrap", text) as Promise<string>,
  unwrap: (b64: string) => ipcRenderer.invoke("vault:unwrap", b64) as Promise<string>,
});

contextBridge.exposeInMainWorld(
  "selfnodeDesktop",
  Object.freeze({ isDesktop: true, version: 1, node, vault }),
);
