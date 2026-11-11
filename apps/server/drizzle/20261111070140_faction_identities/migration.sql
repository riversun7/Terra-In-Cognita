CREATE TABLE "faction_identities" (
	"user_id" uuid PRIMARY KEY,
	"name" text NOT NULL,
	"name_key" text NOT NULL UNIQUE,
	"short_name" text NOT NULL,
	"color" text NOT NULL,
	"emblem_shape" text NOT NULL,
	"emblem_division" text NOT NULL,
	"emblem_charge" text NOT NULL,
	"emblem_scheme" smallint NOT NULL,
	"emblem_png" bytea,
	"emblem_sha256" text,
	"emblem_bytes" integer,
	"emblem_uploaded_at_ms" bigint,
	"upload_blocked" boolean DEFAULT false NOT NULL,
	"notice_kind" text,
	"notice_reason" text,
	"notice_at_ms" bigint,
	"created_at_ms" bigint NOT NULL,
	"updated_at_ms" bigint NOT NULL,
	"name_changed_at_ms" bigint NOT NULL,
	CONSTRAINT "faction_identities_name" CHECK (char_length("name") between 1 and 24),
	CONSTRAINT "faction_identities_short" CHECK (char_length("short_name") between 2 and 5),
	CONSTRAINT "faction_identities_color" CHECK ("color" ~ '^#[0-9a-f]{6}$'),
	CONSTRAINT "faction_identities_scheme" CHECK ("emblem_scheme" between 0 and 15),
	CONSTRAINT "faction_identities_upload" CHECK (num_nonnulls("emblem_png", "emblem_sha256", "emblem_bytes", "emblem_uploaded_at_ms") in (0, 4)),
	CONSTRAINT "faction_identities_sha256_format" CHECK ("emblem_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "faction_identities_bytes" CHECK ("emblem_bytes" is null or ("emblem_bytes" > 0 and "emblem_bytes" <= 200000)),
	CONSTRAINT "faction_identities_notice" CHECK ("notice_kind" is null or "notice_kind" = 'emblem_removed')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "faction_identities_short_idx" ON "faction_identities" (lower("short_name"));--> statement-breakpoint
CREATE INDEX "faction_identities_sha256" ON "faction_identities" ("emblem_sha256");--> statement-breakpoint
ALTER TABLE "faction_identities" ADD CONSTRAINT "faction_identities_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;