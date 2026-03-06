import fs from "node:fs";
import path from "node:path";

const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB
const LOG_FILE_NAME = "itsyconnect.log";

let logPath = "";

export function getLogPath(): string {
  return logPath;
}

export function getLogDir(): string {
  return path.dirname(logPath);
}

function timestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function rotateIfNeeded(): void {
  try {
    const stats = fs.statSync(logPath);
    if (stats.size >= MAX_LOG_SIZE) {
      const backup = logPath + ".1";
      if (fs.existsSync(backup)) fs.unlinkSync(backup);
      fs.renameSync(logPath, backup);
    }
  } catch {
    // File doesn't exist yet – nothing to rotate
  }
}

function writeToFile(level: string, args: unknown[]): void {
  const message = args
    .map((a) => serialiseForLog(a))
    .join(" ");
  const line = `[${timestamp()}] [${level}] ${message}\n`;

  try {
    rotateIfNeeded();
    fs.appendFileSync(logPath, line);
  } catch {
    // Silently ignore write errors – don't break the app
  }
}

function serialiseError(error: Error): string {
  const extra: Record<string, unknown> = {};
  const errorRecord = error as unknown as Record<string, unknown>;
  for (const key of Object.keys(error)) {
    extra[key] = errorRecord[key];
  }
  return JSON.stringify(
    {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: (error as Error & { cause?: unknown }).cause,
      ...extra,
    },
    null,
    2,
  );
}

function serialiseForLog(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return serialiseError(value);
  if (value == null) return String(value);
  if (typeof value !== "object") return String(value);

  const seen = new WeakSet<object>();
  return JSON.stringify(
    value,
    (_key, v: unknown) => {
      if (v instanceof Error) {
        return {
          name: v.name,
          message: v.message,
          stack: v.stack,
          cause: (v as Error & { cause?: unknown }).cause,
        };
      }
      if (typeof v === "object" && v !== null) {
        if (seen.has(v)) return "[Circular]";
        seen.add(v);
      }
      return v;
    },
    2,
  );
}

export function initLogger(logDir?: string): void {
  if (!logDir) logDir = require("electron").app.getPath("logs");
  fs.mkdirSync(logDir!, { recursive: true });
  logPath = path.join(logDir!, LOG_FILE_NAME);
  // Start each app session with a fresh log file.
  fs.writeFileSync(logPath, "");

  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    originalLog(...args);
    writeToFile("info", args);
  };

  console.warn = (...args: unknown[]) => {
    originalWarn(...args);
    writeToFile("warn", args);
  };

  console.error = (...args: unknown[]) => {
    originalError(...args);
    writeToFile("error", args);
  };

  console.log(`--- App starting (log: ${logPath}) ---`);
}
