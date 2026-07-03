import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  ready: () => ipcRenderer.send("app-ready"),
  getSystemLocale: () => ipcRenderer.invoke("get-system-locale") as Promise<string>,
  onNavigate: (cb: (path: string) => void) => {
    const handler = (_: unknown, path: string) => cb(path);
    ipcRenderer.on("navigate", handler);
    return () => { ipcRenderer.removeListener("navigate", handler); };
  },
  updates: {
    checkNow: () => ipcRenderer.send("check-for-updates"),
    installNow: () => ipcRenderer.send("install-update"),
    onStatus: (cb: (status: { state: string; message?: string; notes?: string[] }) => void) => {
      const handler = (_: unknown, status: { state: string; message?: string; notes?: string[] }) => cb(status);
      ipcRenderer.on("update-status", handler);
      return () => { ipcRenderer.removeListener("update-status", handler); };
    },
    getAutoCheck: () => ipcRenderer.invoke("get-auto-check-updates") as Promise<boolean>,
    setAutoCheck: (enabled: boolean) => ipcRenderer.send("set-auto-check-updates", enabled),
  },
});
