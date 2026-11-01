CREATE TABLE "tuning_overrides" (
	"id" text PRIMARY KEY,
	"value" bigint NOT NULL,
	"pack_value" bigint NOT NULL,
	"unit" text,
	"content_version" text NOT NULL,
	"note" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tuning_overrides_id_format" CHECK ("id" ~ '^[a-z][a-z0-9_]{1,47}$'),
	CONSTRAINT "tuning_overrides_note_length" CHECK ("note" is null or char_length("note") <= 200)
);
--> statement-breakpoint
CREATE TABLE "tuning_revision" (
	"id" smallint PRIMARY KEY,
	"revision" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tuning_revision_single" CHECK ("id" = 1),
	CONSTRAINT "tuning_revision_nonnegative" CHECK ("revision" >= 0)
);
--> statement-breakpoint
ALTER TABLE "tuning_overrides" ADD CONSTRAINT "tuning_overrides_updated_by_users_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL;