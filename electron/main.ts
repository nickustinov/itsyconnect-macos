import { app, autoUpdater, BrowserWindow, dialog, Menu, safeStorage, ipcMain, screen, shell, protocol, net } from "electron";
import { spawn, ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { createServer as createNetServer } from "node:net";
import { pathToFileURL } from "node:url";
import http from "node:http";

const isDev = !app.isPackaged;
let nextProcess: ChildProcess | null = null;
// --- Update settings persistence ---

interface AppSettings {
  autoCheckUpdates: boolean;
}

const settingsPath = path.join(app.getPath("userData"), "settings.json");

function loadSettings(): AppSettings {
  try {
    return { autoCheckUpdates: true, ...JSON.parse(fs.readFileSync(settingsPath, "utf-8")) };
  } catch {
    return { autoCheckUpdates: true };
  }
}

function saveSettings(settings: AppSettings): void {
  fs.writeFileSync(settingsPath, JSON.stringify(settings));
}

// Register custom protocol before app is ready – gives stable origin for localStorage
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

// --- Master key management via macOS Keychain ---

function ensureMasterKey(): void {
  const keyPath = path.join(app.getPath("userData"), "master-key.enc");

  if (fs.existsSync(keyPath)) {
    const encrypted = fs.readFileSync(keyPath);
    process.env.ENCRYPTION_MASTER_KEY = safeStorage.decryptString(encrypted);
  } else {
    const key = randomBytes(32).toString("hex");
    const encrypted = safeStorage.encryptString(key);
    fs.writeFileSync(keyPath, encrypted);
    process.env.ENCRYPTION_MASTER_KEY = key;
  }
}

// --- Database path ---

function setDatabasePath(): void {
  process.env.DATABASE_PATH = path.join(app.getPath("userData"), "itsyconnect.db");
}

// --- Window state persistence ---

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

const windowStatePath = path.join(app.getPath("userData"), "window-state.json");

function loadWindowState(): WindowState {
  const defaults: WindowState = { width: 1200, height: 800 };
  try {
    const data = JSON.parse(fs.readFileSync(windowStatePath, "utf-8")) as WindowState;
    const width = data.width > 0 ? data.width : defaults.width;
    const height = data.height > 0 ? data.height : defaults.height;

    if (data.x == null || data.y == null) return { width, height };

    const rect = { x: data.x, y: data.y, width, height };
    const visible = screen.getAllDisplays().some((d) => {
      const b = d.bounds;
      return (
        rect.x < b.x + b.width &&
        rect.x + rect.width > b.x &&
        rect.y < b.y + b.height &&
        rect.y + rect.height > b.y
      );
    });

    return visible ? { x: data.x, y: data.y, width, height } : { width, height };
  } catch {
    return defaults;
  }
}

function saveWindowState(win: BrowserWindow): void {
  if (win.isMaximized() || win.isFullScreen()) return;
  const { x, y, width, height } = win.getBounds();
  fs.writeFileSync(windowStatePath, JSON.stringify({ x, y, width, height }));
}

// --- Port finder (pure Node.js, no external deps) ---

function getRandomPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        server.close(() => resolve(addr.port));
      } else {
        server.close(() => reject(new Error("Failed to get port")));
      }
    });
    server.on("error", reject);
  });
}

// --- Custom protocol proxy ---

function registerProtocolProxy(port: number): void {
  const standaloneDir = path.join(app.getAppPath(), ".next", "standalone");

  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Serve static assets directly from filesystem – avoids net.fetch issues with fonts
    if (pathname.startsWith("/_next/static/")) {
      const filePath = path.join(standaloneDir, ".next", "static", pathname.slice("/_next/static/".length));
      return net.fetch(pathToFileURL(filePath).toString());
    }

    // Proxy dynamic requests to Next.js server
    const target = `http://127.0.0.1:${port}${pathname}${url.search}`;
    const opts: RequestInit & { duplex?: string } = {
      method: request.method,
      headers: request.headers,
    };
    if (request.body) {
      opts.body = request.body;
      opts.duplex = "half";
    }
    return net.fetch(target, opts);
  });
}

// --- Next.js server ---

async function startDevServer(): Promise<number> {
  const port = 3000;
  const nextBin = path.join(app.getAppPath(), "node_modules", ".bin", "next");

  nextProcess = spawn(nextBin, ["dev", "--turbopack", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: process.env,
    stdio: "inherit",
    cwd: app.getAppPath(),
  });

  await waitForServer(port);
  return port;
}

async function startProdServer(): Promise<number> {
  const port = await getRandomPort();
  const standaloneDir = path.join(app.getAppPath(), ".next", "standalone");

  process.env.PORT = String(port);
  process.env.HOSTNAME = "127.0.0.1";
  process.chdir(standaloneDir);

  require(path.join(standaloneDir, "server.js"));

  // Next.js sets process.title = "next-server" which overrides macOS menu bar name
  process.title = "Itsyconnect";

  await waitForServer(port);
  return port;
}

function waitForServer(port: number, timeout = 30_000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      const req = http.get(`http://127.0.0.1:${port}`, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeout) {
          reject(new Error("Next.js server failed to start within timeout"));
          return;
        }
        setTimeout(check, 100);
      });
    }
    check();
  });
}

// --- Auto-updater ---

let checkSource: "menu" | "settings" | "auto" = "auto";
let updateInterval: ReturnType<typeof setInterval> | null = null;

function setupAutoUpdater(): void {
  if (isDev) return;

  const feedURL = `https://update.electronjs.org/nickustinov/itsyconnect-macos/${process.platform}-${process.arch}/${app.getVersion()}`;
  autoUpdater.setFeedURL({ url: feedURL });

  autoUpdater.on("error", (err) => {
    mainWindow?.webContents.send("update-status", { state: "error", message: err.message });
    if (checkSource === "menu") {
      dialog.showMessageBox({ message: "Update check failed", detail: err.message });
    }
    checkSource = "auto";
  });

  autoUpdater.on("checking-for-update", () => {
    mainWindow?.webContents.send("update-status", { state: "checking" });
  });

  autoUpdater.on("update-available", () => {
    mainWindow?.webContents.send("update-status", { state: "available" });
    if (checkSource === "menu") {
      dialog.showMessageBox({ message: "A new update is being downloaded." });
    }
    checkSource = "auto";
  });

  autoUpdater.on("update-not-available", () => {
    mainWindow?.webContents.send("update-status", { state: "up-to-date" });
    if (checkSource === "menu") {
      dialog.showMessageBox({ message: "You're up to date!" });
    }
    checkSource = "auto";
  });

  autoUpdater.on("update-downloaded", () => {
    mainWindow?.webContents.send("update-status", { state: "downloaded" });
    dialog.showMessageBox({
      message: "Update downloaded",
      detail: "The update will be installed when you restart.",
      buttons: ["Restart now", "Later"],
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  const settings = loadSettings();
  if (settings.autoCheckUpdates) startUpdateInterval();
}

function startUpdateInterval(): void {
  if (updateInterval) return;
  autoUpdater.checkForUpdates();
  updateInterval = setInterval(() => autoUpdater.checkForUpdates(), 60 * 60 * 1000);
}

function stopUpdateInterval(): void {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

// --- Menu ---

function setupMenu(): void {
  const appName = "Itsyconnect";
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: appName,
      submenu: [
        { role: "about", label: `About ${appName}` },
        {
          label: "Check for updates\u2026",
          click: () => {
            checkSource = "menu";
            autoUpdater.checkForUpdates();
          },
        },
        {
          label: "Settings\u2026",
          accelerator: "CmdOrCtrl+,",
          click: () => {
            mainWindow?.webContents.send("navigate", "/settings");
          },
        },
        { type: "separator" },
        { role: "hide", label: `Hide ${appName}` },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit", label: `Quit ${appName}` },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        ...(isDev
          ? [
              { role: "reload" as const },
              { role: "forceReload" as const },
              { role: "toggleDevTools" as const },
              { type: "separator" as const },
            ]
          : []),
        { role: "togglefullscreen" as const },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
        { role: "close" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- BrowserWindow ---

let mainWindow: BrowserWindow | null = null;

function createWindow(port: number): void {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    ...state,
    minWidth: 1200,
    minHeight: 800,
    show: false,
    titleBarStyle: "hiddenInset",
    icon: path.join(app.getAppPath(), "public", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Lock zoom level – prevent Cmd+/Cmd-/Cmd+0 font size changes
  mainWindow.webContents.setZoomFactor(1);
  mainWindow.webContents.setZoomLevel(0);
  mainWindow.webContents.on("before-input-event", (_event, input) => {
    if (
      input.meta &&
      !input.shift &&
      (input.key === "=" || input.key === "-" || input.key === "0")
    ) {
      _event.preventDefault();
    }
  });

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("app://") || url.startsWith("http://127.0.0.1")) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("app://") && !url.startsWith("http://127.0.0.1")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // In production, use app:// for stable origin so localStorage persists with random ports.
  // In dev, port 3000 is fixed so load directly.
  const origin = isDev ? `http://127.0.0.1:${port}` : "app://itsyconnect";
  mainWindow.loadURL(`${origin}/`);

  ipcMain.once("app-ready", () => {
    mainWindow?.show();
  });

  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  const debouncedSave = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      if (mainWindow) saveWindowState(mainWindow);
    }, 300);
  };

  mainWindow.on("resize", debouncedSave);
  mainWindow.on("move", debouncedSave);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// --- App lifecycle ---

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    process.env.ELECTRON = "1";
    ensureMasterKey();
    setDatabasePath();
    app.name = "Itsyconnect";

    const port = isDev ? await startDevServer() : await startProdServer();
    if (!isDev) registerProtocolProxy(port);
    createWindow(port);
    setupMenu();
    setupAutoUpdater();

    // --- Update IPC handlers ---

    ipcMain.on("check-for-updates", () => {
      checkSource = "settings";
      autoUpdater.checkForUpdates();
    });

    ipcMain.handle("get-auto-check-updates", () => {
      return loadSettings().autoCheckUpdates;
    });

    ipcMain.on("set-auto-check-updates", (_, enabled: boolean) => {
      const settings = loadSettings();
      settings.autoCheckUpdates = enabled;
      saveSettings(settings);
      if (enabled) {
        startUpdateInterval();
      } else {
        stopUpdateInterval();
      }
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(port);
      }
    });
  });

  app.on("will-quit", () => {
    if (nextProcess) nextProcess.kill();
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}
