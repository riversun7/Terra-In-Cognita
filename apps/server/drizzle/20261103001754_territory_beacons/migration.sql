CREATE TABLE "territory_beacons" (
	"id" bigint PRIMARY KEY,
	"planet_id" text DEFAULT 's2_test_planet' NOT NULL,
	"cell_key" bigint NOT NULL,
	"faction_id" bigint NOT NULL,
	"city_id" bigint,
	"durability" integer NOT NULL,
	"built_at_ms" bigint NOT NULL,
	"built_by" uuid,
	CONSTRAINT "territory_beacons_durability" CHECK ("durability" >= 0),
	CONSTRAINT "territory_beacons_planet_id_format" CHECK ("planet_id" ~ '^[a-z][a-z0-9_]{1,47}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "territory_beacons_cell_idx" ON "territory_beacons" ("planet_id","cell_key");--> statement-breakpoint
CREATE INDEX "territory_beacons_faction_idx" ON "territory_beacons" ("faction_id");