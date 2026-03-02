import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  ready: () => ipcRenderer.send("app-ready"),
  onNavigate: (cb: (path: string) => void) => {
    const handler = (_: unknown, path: string) => cb(path);
    ipcRenderer.on("navigate", handler);
    return () => { ipcRenderer.removeListener("navigate", handler); };
  },
  updates: {
    checkNow: () => ipcRenderer.send("check-for-updates"),
    onStatus: (cb: (status: { state: string; message?: string }) => void) => {
      const handler = (_: unknown, status: { state: string; message?: string }) => cb(status);
      ipcRenderer.on("update-status", handler);
      return () => { ipcRenderer.removeListener("update-status", handler); };
    },
    getAutoCheck: () => ipcRenderer.invoke("get-auto-check-updates") as Promise<boolean>,
    setAutoCheck: (enabled: boolean) => ipcRenderer.send("set-auto-check-updates", enabled),
  },
});
