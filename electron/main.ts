import { app, BrowserWindow, clipboard, dialog, inAppPurchase, Menu, nativeImage, safeStorage, ipcMain, screen, shell, protocol, net } from "electron";
import { spawn, ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { createServer as createNetServer } from "node:net";
import { pathToFileURL } from "node:url";
import http from "node:http";
import { initLogger, getLogPath, getLogDir } from "./logger";

const isDev = !app.isPackaged;
const isMAS = !!(process as NodeJS.Process & { mas?: boolean }).mas || process.env.MAS === "1";
let nextProcess: ChildProcess | null = null;

function installProcessErrorLogging(): void {
  process.on("unhandledRejection", (reason) => {
    console.error("[process] unhandledRejection:", reason);
  });
  process.on("uncaughtException", (error) => {
    console.error("[process] uncaughtException:", error);
  });
}
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

// --- StoreKit In-App Purchase (MAS builds only) ---

const STOREKIT_PRODUCT_ID = "com.itsyconnect.app.pro";

function setupStoreKit(port: number): void {
  if (!isMAS) return;

  inAppPurchase.on("transactions-updated", (_event, transactions) => {
    for (const tx of transactions) {
      switch (tx.transactionState) {
        case "purchased":
        case "restored": {
          const body = JSON.stringify({ transactionId: String(tx.transactionIdentifier) });
          const req = http.request(
            {
              hostname: "127.0.0.1",
              port,
              path: "/api/license/storekit",
              method: "POST",
              headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
            },
            (res) => {
              res.resume();
              if (res.statusCode === 200) {
                mainWindow?.webContents.send("license-updated");
              }
            },
          );
          req.write(body);
          req.end();
          inAppPurchase.finishTransactionByDate(tx.transactionDate);
          break;
        }
        case "failed":
          mainWindow?.webContents.send("storekit-error", tx.errorMessage ?? "Purchase failed");
          inAppPurchase.finishTransactionByDate(tx.transactionDate);
          break;
        case "purchasing":
          // Transaction in progress – no action needed
          break;
      }
    }
  });

  ipcMain.handle("storekit-purchase", () => {
    inAppPurchase.purchaseProduct(STOREKIT_PRODUCT_ID);
  });

  ipcMain.handle("storekit-restore", () => {
    inAppPurchase.restoreCompletedTransactions();
  });

  ipcMain.handle("storekit-product", async () => {
    const products = await inAppPurchase.getProducts([STOREKIT_PRODUCT_ID]);
    const product = products[0];
    if (!product) return null;
    return {
      title: product.localizedTitle,
      price: product.formattedPrice,
    };
  });
}

// --- Auto-updater (direct distribution only – excluded from MAS builds) ---

let checkSource: "menu" | "settings" | "auto" = "auto";
let updateInterval: ReturnType<typeof setInterval> | null = null;
let autoUpdater: Electron.AutoUpdater | null = null;
let lastUpdateStatus: { state: string; message?: string; notes?: string[] } | null = null;

function sendUpdateStatus(status: { state: string; message?: string; notes?: string[] }): void {
  lastUpdateStatus = status;
  console.log(`[updater] sendUpdateStatus: ${status.state}, window=${!!mainWindow}`);
  mainWindow?.webContents.send("update-status", status);
}

function setupAutoUpdater(): void {
  if (isDev || isMAS) return;

  // Lazy-import autoUpdater so MAS builds never touch the module
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const updater: Electron.AutoUpdater = require("electron").autoUpdater;
  autoUpdater = updater;

  const feedURL = `https://update.electronjs.org/nickustinov/itsyconnect-macos/${process.platform}-${process.arch}/${app.getVersion()}`;
  updater.setFeedURL({ url: feedURL });

  updater.on("error", (err) => {
    console.log("[updater] error:", err.message);
    sendUpdateStatus({ state: "error", message: err.message });
    if (checkSource === "menu") {
      dialog.showMessageBox({ message: "Update check failed", detail: err.message });
    }
    checkSource = "auto";
  });

  updater.on("checking-for-update", () => {
    console.log("[updater] checking-for-update");
    sendUpdateStatus({ state: "checking" });
  });

  updater.on("update-available", () => {
    console.log("[updater] update-available");
    sendUpdateStatus({ state: "available" });
    if (checkSource === "menu") {
      dialog.showMessageBox({ message: "A new update is being downloaded." });
    }
    checkSource = "auto";
  });

  updater.on("update-not-available", () => {
    console.log("[updater] update-not-available");
    sendUpdateStatus({ state: "up-to-date" });
    if (checkSource === "menu") {
      dialog.showMessageBox({ message: "You're up to date!" });
    }
    checkSource = "auto";
  });

  updater.on("update-downloaded", (_event, releaseNotes: string) => {
    console.log("[updater] update-downloaded, releaseNotes:", releaseNotes);
    const notes = releaseNotes
      ? releaseNotes.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.replace(/^[-*]\s*/, "").trim())
      : [];
    sendUpdateStatus({ state: "downloaded", notes });
  });

  const settings = loadSettings();
  if (settings.autoCheckUpdates) startUpdateInterval();
}


function startUpdateInterval(): void {
  if (updateInterval || !autoUpdater) return;
  autoUpdater.checkForUpdates();
  updateInterval = setInterval(() => autoUpdater!.checkForUpdates(), 60 * 60 * 1000);
}

function stopUpdateInterval(): void {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

// --- Menu ---

function sfIcon(name: string): Electron.NativeImage {
  return nativeImage.createFromNamedImage(name, [-1, 0, -1]).resize({ width: 12, height: 12 });
}

function setupMenu(): void {
  const appName = "Itsyconnect";
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: appName,
      submenu: [
        { role: "about", label: `About ${appName}` },
        ...(!isMAS
          ? [
              {
                label: "Check for updates\u2026",
                icon: sfIcon("arrow.triangle.2.circlepath"),
                click: () => {
                  checkSource = "menu";
                  autoUpdater?.checkForUpdates();
                },
              },
            ]
          : []),
        {
          label: "Settings\u2026",
          icon: sfIcon("gearshape"),
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
    {
      label: "Help",
      submenu: [
        {
          label: "Copy diagnostics to clipboard",
          icon: sfIcon("doc.on.clipboard"),
          click: () => {
            const logFile = getLogPath();
            let recentLogs = "";
            try {
              const content = fs.readFileSync(logFile, "utf-8");
              const lines = content.split("\n");
              recentLogs = lines.slice(-200).join("\n");
            } catch {
              recentLogs = "(no log file found)";
            }

            const diagnostics = [
              "## Itsyconnect diagnostics",
              "",
              `- **App version:** ${app.getVersion()}`,
              `- **macOS:** ${process.getSystemVersion()}`,
              `- **Electron:** ${process.versions.electron}`,
              `- **Chrome:** ${process.versions.chrome}`,
              `- **Node:** ${process.versions.node}`,
              "",
              "### Recent logs",
              "",
              "```",
              recentLogs.trim(),
              "```",
            ].join("\n");

            clipboard.writeText(diagnostics);
            dialog.showMessageBox({ message: "Diagnostics copied to clipboard." });
          },
        },
        {
          label: "Show log files",
          icon: sfIcon("folder"),
          click: () => {
            shell.openPath(getLogDir());
          },
        },
        { type: "separator" },
        {
          label: "Report an issue",
          icon: sfIcon("exclamationmark.bubble"),
          click: () => {
            shell.openExternal("https://github.com/nickustinov/itsyconnect-macos/issues/new");
          },
        },
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
    // Replay cached update status so the renderer doesn't miss events that
    // fired before it mounted (e.g. update-downloaded on relaunch)
    if (lastUpdateStatus) {
      console.log("[updater] replaying cached status:", lastUpdateStatus.state);
      mainWindow?.webContents.send("update-status", lastUpdateStatus);
    }
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
    initLogger();
    installProcessErrorLogging();
    process.env.ELECTRON = "1";
    ensureMasterKey();
    setDatabasePath();
    app.name = "Itsyconnect";

    const port = isDev ? await startDevServer() : await startProdServer();
    if (!isDev) registerProtocolProxy(port);
    createWindow(port);
    setupMenu();
    setupStoreKit(port);
    setupAutoUpdater();
    console.log(`[main] App started on port ${port} (${isDev ? "dev" : "prod"})`);

    // --- Update IPC handlers (direct distribution only) ---

    if (!isMAS) {
      ipcMain.on("check-for-updates", () => {
        checkSource = "settings";
        autoUpdater?.checkForUpdates();
      });

      ipcMain.handle("get-auto-check-updates", () => {
        return loadSettings().autoCheckUpdates;
      });

      ipcMain.on("install-update", () => {
        autoUpdater?.quitAndInstall();
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
    }

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
