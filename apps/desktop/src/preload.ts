/**
 * Minimal, typed bridge. Sandboxed preload: only `electron`'s contextBridge
 * and ipcRenderer are available. The node manager adds specific, validated
 * calls (never a generic `invoke`).
 */
import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("selfnodeDesktop", Object.freeze({ isDesktop: true, version: 1 }));
