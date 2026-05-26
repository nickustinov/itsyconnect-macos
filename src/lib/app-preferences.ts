import { db } from "@/db";
import { appPreferences } from "@/db/schema";
import { eq } from "drizzle-orm";

const REVIEW_BEFORE_SAVING_KEY = "review_before_saving";

/** Distinct guidance buckets – translation tone vs review-reply voice are unrelated. */
export type GuidanceScope = "translation" | "reviews";

function guidanceKey(scope: GuidanceScope): string {
  return `ai_guidance_${scope}`;
}

/** Read the saved AI guidance for a scope (standing instructions appended to its prompts). */
export function getAIGuidance(scope: GuidanceScope): string {
  try {
    const row = db
      .select({ value: appPreferences.value })
      .from(appPreferences)
      .where(eq(appPreferences.key, guidanceKey(scope)))
      .get();
    return row?.value ?? "";
  } catch {
    return "";
  }
}

export function setAIGuidance(scope: GuidanceScope, guidance: string): void {
  const key = guidanceKey(scope);
  db.insert(appPreferences)
    .values({ key, value: guidance })
    .onConflictDoUpdate({
      target: appPreferences.key,
      set: { value: guidance },
    })
    .run();
}

export function getReviewBeforeSaving(): boolean {
  try {
    const row = db
      .select({ value: appPreferences.value })
      .from(appPreferences)
      .where(eq(appPreferences.key, REVIEW_BEFORE_SAVING_KEY))
      .get();
    return row?.value === "true";
  } catch {
    return false;
  }
}

export function setReviewBeforeSaving(enabled: boolean): void {
  db.insert(appPreferences)
    .values({ key: REVIEW_BEFORE_SAVING_KEY, value: String(enabled) })
    .onConflictDoUpdate({
      target: appPreferences.key,
      set: { value: String(enabled) },
    })
    .run();
}
