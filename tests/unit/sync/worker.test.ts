import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockHasCredentials = vi.fn();
const mockSyncApps = vi.fn();

vi.mock("@/lib/asc/client", () => ({
  hasCredentials: (...args: unknown[]) => mockHasCredentials(...args),
}));

vi.mock("@/lib/sync/jobs", () => ({
  syncApps: (...args: unknown[]) => mockSyncApps(...args),
}));

describe("sync worker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    mockHasCredentials.mockReset();
    mockSyncApps.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function getWorker() {
    return await import("@/lib/sync/worker");
  }

  it("starts sync when credentials exist", async () => {
    mockHasCredentials.mockReturnValue(true);
    mockSyncApps.mockResolvedValue(undefined);

    const { startSyncWorker, stopSyncWorker } = await getWorker();
    startSyncWorker();

    // syncApps is called immediately on start
    expect(mockSyncApps).toHaveBeenCalled();

    stopSyncWorker();
  });

  it("stays dormant when no credentials", async () => {
    mockHasCredentials.mockReturnValue(false);

    const { startSyncWorker, stopSyncWorker } = await getWorker();
    startSyncWorker();

    expect(mockSyncApps).not.toHaveBeenCalled();

    stopSyncWorker();
  });

  it("start is idempotent", async () => {
    mockHasCredentials.mockReturnValue(true);
    mockSyncApps.mockResolvedValue(undefined);

    const { startSyncWorker, stopSyncWorker } = await getWorker();
    startSyncWorker();
    startSyncWorker(); // second call should be no-op

    // Still only one immediate call
    expect(mockSyncApps).toHaveBeenCalledTimes(1);

    stopSyncWorker();
  });

  it("stop clears timers and allows restart", async () => {
    mockHasCredentials.mockReturnValue(true);
    mockSyncApps.mockResolvedValue(undefined);

    const { startSyncWorker, stopSyncWorker } = await getWorker();
    startSyncWorker();
    stopSyncWorker();

    mockSyncApps.mockReset();

    // Advance past the interval – no calls should fire
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
    expect(mockSyncApps).not.toHaveBeenCalled();
  });

  it("getSyncStatus returns correct shape", async () => {
    mockHasCredentials.mockReturnValue(false);

    const { getSyncStatus, startSyncWorker, stopSyncWorker } = await getWorker();
    startSyncWorker();

    const status = getSyncStatus();
    expect(status).toBeInstanceOf(Array);
    expect(status.length).toBeGreaterThan(0);
    for (const s of status) {
      expect(s).toHaveProperty("name");
      expect(s).toHaveProperty("lastRun");
      expect(s).toHaveProperty("intervalMs");
      expect(s).toHaveProperty("nextRun");
      expect(typeof s.intervalMs).toBe("number");
    }

    stopSyncWorker();
  });

  it("handles timers without unref method", async () => {
    vi.useRealTimers();
    // Stub setInterval to return a timer without unref
    const realSetInterval = globalThis.setInterval;
    vi.stubGlobal("setInterval", (...args: Parameters<typeof setInterval>) => {
      const id = realSetInterval(...args);
      return Object.assign(id, { unref: undefined });
    });

    mockHasCredentials.mockReturnValue(true);
    mockSyncApps.mockResolvedValue(undefined);

    const { startSyncWorker, stopSyncWorker } = await getWorker();
    startSyncWorker();
    stopSyncWorker();

    vi.stubGlobal("setInterval", realSetInterval);
    vi.useFakeTimers();
  });

  it("catches and logs job errors without crashing", async () => {
    mockHasCredentials.mockReturnValue(true);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockSyncApps.mockRejectedValue(new Error("sync failed"));

    const { startSyncWorker, stopSyncWorker } = await getWorker();
    startSyncWorker();

    // Let the rejected promise settle
    await vi.advanceTimersByTimeAsync(0);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[sync]"),
      expect.any(Error),
    );

    consoleSpy.mockRestore();
    stopSyncWorker();
  });

  it("getSyncStatus shows nextRun after a successful run", async () => {
    mockHasCredentials.mockReturnValue(true);
    mockSyncApps.mockResolvedValue(undefined);

    const { startSyncWorker, stopSyncWorker, getSyncStatus } = await getWorker();
    startSyncWorker();

    // Let the job complete
    await vi.advanceTimersByTimeAsync(0);

    const status = getSyncStatus();
    const apps = status.find((s) => s.name === "apps");
    expect(apps!.lastRun).toBeGreaterThan(0);
    expect(apps!.nextRun).toBe(apps!.lastRun! + apps!.intervalMs);

    stopSyncWorker();
  });

  it("deduplicates in-flight jobs", async () => {
    mockHasCredentials.mockReturnValue(true);
    let resolveJob!: () => void;
    mockSyncApps.mockImplementation(
      () => new Promise<void>((resolve) => { resolveJob = resolve; }),
    );

    const { startSyncWorker, stopSyncWorker } = await getWorker();
    startSyncWorker();

    // The first call is in-flight
    expect(mockSyncApps).toHaveBeenCalledTimes(1);

    // Advance to trigger the interval while first is still in-flight
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    // Should not have created a second call yet (deduplication)
    // The interval fires runJob, which sees inFlight and waits
    expect(mockSyncApps).toHaveBeenCalledTimes(1);

    // Resolve the first job
    resolveJob();
    await vi.advanceTimersByTimeAsync(0);

    stopSyncWorker();
  });
});
