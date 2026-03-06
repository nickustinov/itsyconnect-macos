import { db } from "@/db";
import { appPreferences } from "@/db/schema";
import { eq } from "drizzle-orm";

const FREE_SELECTED_APP_KEY = "free_selected_app_id";

export function getFreeSelectedAppId(): string | null {
  try {
    const row = db
      .select({ value: appPreferences.value })
      .from(appPreferences)
      .where(eq(appPreferences.key, FREE_SELECTED_APP_KEY))
      .get();
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export function setFreeSelectedAppId(appId: string): void {
  db.insert(appPreferences)
    .values({ key: FREE_SELECTED_APP_KEY, value: appId })
    .onConflictDoUpdate({
      target: appPreferences.key,
      set: { value: appId },
    })
    .run();
}

export function clearFreeSelectedAppId(): void {
  db.delete(appPreferences)
    .where(eq(appPreferences.key, FREE_SELECTED_APP_KEY))
    .run();
}
