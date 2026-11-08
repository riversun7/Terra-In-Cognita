CREATE TABLE "world_nation_placements" (
	"planet_id" text DEFAULT 's2_test_planet',
	"faction_code" text,
	"map_key" bigint NOT NULL,
	"placed_by" uuid,
	"placed_at_ms" bigint NOT NULL,
	"applied_at_ms" bigint,
	"blocked" jsonb,
	CONSTRAINT "world_nation_placements_pkey" PRIMARY KEY("planet_id","faction_code"),
	CONSTRAINT "world_nation_placements_code_format" CHECK ("faction_code" ~ '^[a-z][a-z0-9_]{1,47}$')
);
--> statement-breakpoint
ALTER TABLE "factions" ADD COLUMN "capital_city_id" bigint;--> statement-breakpoint
ALTER TABLE "world_nation_placements" ADD CONSTRAINT "world_nation_placements_placed_by_users_id_fkey" FOREIGN KEY ("placed_by") REFERENCES "users"("id") ON DELETE SET NULL;