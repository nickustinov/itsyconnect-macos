const NAV_KEY = "nav-state";

interface NavState {
  lastUrl: string;
  lastAppId?: string;
  apps: Record<string, string>;
}

function read(): NavState {
  try {
    const raw = localStorage.getItem(NAV_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Corrupted or unavailable – start fresh
  }
  return { lastUrl: "", apps: {} };
}

function write(state: NavState): void {
  try {
    localStorage.setItem(NAV_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable – silently skip
  }
}

const APP_PREFIX = "/dashboard/apps/";
const DASHBOARD = "/dashboard";

export function saveNavigation(pathname: string, search: string): void {
  if (!pathname.startsWith(DASHBOARD)) return;

  // Skip transient entry navigation – the redirect will save the real URL
  const params = new URLSearchParams(search);
  if (params.has("entry")) return;

  const suffix = search ? `?${search}` : "";

  const state = read();
  state.lastUrl = pathname + suffix;

  // Per-app sub-path tracking
  if (pathname.startsWith(APP_PREFIX)) {
    const rest = pathname.slice(APP_PREFIX.length);
    const slashIdx = rest.indexOf("/");
    const appId = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
    if (appId) {
      state.lastAppId = appId;
      const subpath = slashIdx === -1 ? "" : rest.slice(slashIdx);
      state.apps[appId] = subpath + suffix;
    }
  }

  write(state);
}

export function getLastUrl(): string | undefined {
  const { lastUrl } = read();
  return lastUrl && lastUrl.startsWith(DASHBOARD) ? lastUrl : undefined;
}

export function getLastAppId(): string | undefined {
  return read().lastAppId || undefined;
}

export function getAppState(appId: string): string | undefined {
  const sub = read().apps[appId];
  return sub !== undefined ? sub : undefined;
}

export function clearNavigation(): void {
  try {
    localStorage.removeItem(NAV_KEY);
  } catch {
    // Storage unavailable – silently skip
  }
}
