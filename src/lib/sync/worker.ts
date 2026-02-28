import { hasCredentials } from "@/lib/asc/client";
import { syncApps, syncAnalytics } from "./jobs";

interface SyncSchedule {
  name: string;
  intervalMs: number;
  job: () => Promise<void>;
  lastRun: number | null;
  timer: ReturnType<typeof setInterval> | null;
}

const schedules: SyncSchedule[] = [
  { name: "apps", intervalMs: 60 * 60 * 1000, job: syncApps, lastRun: null, timer: null },
  { name: "analytics", intervalMs: 60 * 60 * 1000, job: syncAnalytics, lastRun: null, timer: null },
];

const inFlight = new Map<string, Promise<void>>();

async function runJob(schedule: SyncSchedule): Promise<void> {
  // Deduplication: if already in-flight, wait for existing
  const existing = inFlight.get(schedule.name);
  if (existing) {
    await existing;
    return;
  }

  const promise = schedule
    .job()
    .then(() => {
      schedule.lastRun = Date.now();
    })
    .catch((err) => {
      console.error(`[sync] ${schedule.name} failed:`, err);
    })
    .finally(() => {
      inFlight.delete(schedule.name);
    });

  inFlight.set(schedule.name, promise);
  await promise;
}

let started = false;

export function startSyncWorker(): void {
  if (started) return;
  started = true;

  // Don't start if no credentials
  if (!hasCredentials()) {
    console.log("[sync] No ASC credentials – worker dormant");
    return;
  }

  console.log("[sync] Starting background sync worker");

  for (const schedule of schedules) {
    // Immediate sync on startup
    runJob(schedule);

    // Schedule periodic sync
    schedule.timer = setInterval(() => runJob(schedule), schedule.intervalMs);
    if (schedule.timer.unref) {
      schedule.timer.unref();
    }
  }
}

export function stopSyncWorker(): void {
  for (const schedule of schedules) {
    if (schedule.timer) {
      clearInterval(schedule.timer);
      schedule.timer = null;
    }
  }
  started = false;
}

export function getSyncStatus(): Array<{
  name: string;
  lastRun: number | null;
  intervalMs: number;
  nextRun: number | null;
}> {
  return schedules.map((s) => ({
    name: s.name,
    lastRun: s.lastRun,
    intervalMs: s.intervalMs,
    nextRun: s.lastRun ? s.lastRun + s.intervalMs : null,
  }));
}
