CREATE TABLE "content_override_revision" (
	"id" smallint PRIMARY KEY,
	"revision" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_override_revision_single" CHECK ("id" = 1),
	CONSTRAINT "content_override_revision_nonnegative" CHECK ("revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "content_overrides" (
	"category" text,
	"id" text,
	"entry" jsonb NOT NULL,
	"pack_hash" text,
	"content_version" text NOT NULL,
	"note" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_overrides_pkey" PRIMARY KEY("category","id"),
	CONSTRAINT "content_overrides_category" CHECK ("category" in ('skills', 'items', 'unit_kinds')),
	CONSTRAINT "content_overrides_id_format" CHECK ("id" ~ '^[a-z][a-z0-9_]{1,47}$'),
	CONSTRAINT "content_overrides_note_length" CHECK ("note" is null or char_length("note") <= 200)
);
--> statement-breakpoint
ALTER TABLE "content_overrides" ADD CONSTRAINT "content_overrides_updated_by_users_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL;