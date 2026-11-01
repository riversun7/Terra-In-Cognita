CREATE TABLE "formula_overrides" (
	"id" text PRIMARY KEY,
	"source" text NOT NULL,
	"pack_source" text NOT NULL,
	"content_version" text NOT NULL,
	"note" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "formula_overrides_id_format" CHECK ("id" ~ '^[a-z][a-z0-9_]{1,47}(\.formula)?$'),
	CONSTRAINT "formula_overrides_source_length" CHECK (char_length("source") between 1 and 2000),
	CONSTRAINT "formula_overrides_pack_source_length" CHECK (char_length("pack_source") <= 4000),
	CONSTRAINT "formula_overrides_note_length" CHECK ("note" is null or char_length("note") <= 200)
);
--> statement-breakpoint
ALTER TABLE "formula_overrides" ADD CONSTRAINT "formula_overrides_updated_by_users_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL;