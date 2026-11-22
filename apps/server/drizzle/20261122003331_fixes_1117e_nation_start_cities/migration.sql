CREATE TABLE "nation_start_cities" (
	"faction_id" bigint,
	"planet_id" text DEFAULT 's2_test_planet',
	"founded" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "nation_start_cities_pkey" PRIMARY KEY("faction_id","planet_id"),
	CONSTRAINT "nation_start_cities_founded" CHECK ("founded" >= 0)
);
--> statement-breakpoint
ALTER TABLE "nation_start_cities" ADD CONSTRAINT "nation_start_cities_faction_id_factions_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "factions"("id") ON DELETE CASCADE;