CREATE TABLE "balance_presets" (
	"id" text PRIMARY KEY,
	"data" jsonb NOT NULL,
	"pack_entry" jsonb,
	"content_version" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "balance_presets_id_format" CHECK ("id" ~ '^[a-z][a-z0-9_]{1,47}$'),
	CONSTRAINT "balance_presets_version_positive" CHECK ("version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "balance_presets" ADD CONSTRAINT "balance_presets_updated_by_users_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL;