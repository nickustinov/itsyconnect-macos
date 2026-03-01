CREATE TABLE `ai_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`model_id` text NOT NULL,
	`encrypted_api_key` text NOT NULL,
	`iv` text NOT NULL,
	`auth_tag` text NOT NULL,
	`encrypted_dek` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `asc_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`issuer_id` text NOT NULL,
	`key_id` text NOT NULL,
	`encrypted_private_key` text NOT NULL,
	`iv` text NOT NULL,
	`auth_tag` text NOT NULL,
	`encrypted_dek` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cache_entries` (
	`resource` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`ttl_ms` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `feedback_completed` (
	`feedback_id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`completed_at` text NOT NULL
);
