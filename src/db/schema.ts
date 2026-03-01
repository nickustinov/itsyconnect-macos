import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { ulid } from "@/lib/ulid";

// --- ASC credentials ---

export const ascCredentials = sqliteTable("asc_credentials", {
  id: text("id").primaryKey().$defaultFn(ulid),
  name: text("name"),
  issuerId: text("issuer_id").notNull(),
  keyId: text("key_id").notNull(),
  encryptedPrivateKey: text("encrypted_private_key").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  encryptedDek: text("encrypted_dek").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// --- AI settings ---

export const aiSettings = sqliteTable("ai_settings", {
  id: text("id").primaryKey().$defaultFn(ulid),
  provider: text("provider").notNull(),
  modelId: text("model_id").notNull(),
  encryptedApiKey: text("encrypted_api_key").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  encryptedDek: text("encrypted_dek").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// --- Cache ---

export const cacheEntries = sqliteTable("cache_entries", {
  resource: text("resource").primaryKey(),
  data: text("data").notNull(),
  fetchedAt: integer("fetched_at").notNull(),
  ttlMs: integer("ttl_ms").notNull(),
});

// --- Feedback completed tracking ---

export const feedbackCompleted = sqliteTable("feedback_completed", {
  feedbackId: text("feedback_id").primaryKey(),
  appId: text("app_id").notNull(),
  completedAt: text("completed_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});
