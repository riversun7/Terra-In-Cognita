CREATE TABLE "currency_profiles" (
	"asset" text PRIMARY KEY,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"ticker" text NOT NULL UNIQUE,
	"source" text NOT NULL,
	"updated_at_ms" bigint NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "currency_profiles_name" CHECK (char_length("name") between 1 and 24),
	CONSTRAINT "currency_profiles_symbol" CHECK (char_length("symbol") between 1 and 3),
	CONSTRAINT "currency_profiles_ticker" CHECK ("ticker" ~ '^[A-Z]{3}$'),
	CONSTRAINT "currency_profiles_source" CHECK ("source" in ('preset', 'default', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "faction_profiles" (
	"faction_id" bigint PRIMARY KEY,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"color" text NOT NULL,
	"source" text NOT NULL,
	"updated_at_ms" bigint NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "faction_profiles_name" CHECK (char_length("name") between 1 and 24),
	CONSTRAINT "faction_profiles_short" CHECK (char_length("short_name") between 2 and 5),
	CONSTRAINT "faction_profiles_color" CHECK ("color" ~ '^#[0-9a-f]{6}$'),
	CONSTRAINT "faction_profiles_source" CHECK ("source" in ('preset', 'default', 'admin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "faction_profiles_short_idx" ON "faction_profiles" (lower("short_name"));--> statement-breakpoint
ALTER TABLE "faction_profiles" ADD CONSTRAINT "faction_profiles_faction_id_factions_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "factions"("id") ON DELETE CASCADE;