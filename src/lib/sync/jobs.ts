import { listApps } from "@/lib/asc/apps";
import { buildAnalyticsData } from "@/lib/asc/analytics";
import { hasCredentials } from "@/lib/asc/client";

export async function syncApps(): Promise<void> {
  if (!hasCredentials()) return;
  await listApps(true);
}

export async function syncAnalytics(): Promise<void> {
  if (!hasCredentials()) return;
  const apps = await listApps();
  for (const app of apps) {
    await buildAnalyticsData(app.id, true);
  }
}
