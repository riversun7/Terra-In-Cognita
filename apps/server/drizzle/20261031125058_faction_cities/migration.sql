CREATE TABLE "world_cities" (
	"id" bigint PRIMARY KEY,
	"faction_id" bigint NOT NULL,
	"planet_id" text DEFAULT 's2_test_planet' NOT NULL,
	"map_key" bigint NOT NULL,
	"cell_x" integer NOT NULL,
	"cell_y" integer NOT NULL,
	"start" boolean DEFAULT false NOT NULL,
	"housing" integer DEFAULT 0 NOT NULL,
	"research_level" smallint DEFAULT 0 NOT NULL,
	"founded_at_ms" bigint NOT NULL,
	CONSTRAINT "world_cities_research" CHECK ("research_level" between 0 and 5),
	CONSTRAINT "world_cities_planet_id_format" CHECK ("planet_id" ~ '^[a-z][a-z0-9_]{1,47}$')
);
--> statement-breakpoint
ALTER TABLE "factions" ADD COLUMN "regime" text DEFAULT 'democracy' NOT NULL;--> statement-breakpoint
ALTER TABLE "factions" ADD COLUMN "fixed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "factions" ADD COLUMN "tech_level" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "factions" ADD COLUMN "tech_blueprint" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX "world_cities_map_idx" ON "world_cities" ("map_key");--> statement-breakpoint
CREATE INDEX "world_cities_faction_idx" ON "world_cities" ("faction_id");--> statement-breakpoint
ALTER TABLE "world_cities" ADD CONSTRAINT "world_cities_faction_id_factions_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "factions"("id");--> statement-breakpoint
ALTER TABLE "factions" ADD CONSTRAINT "factions_regime" CHECK ("regime" in ('dictatorship', 'democracy', 'capitalism'));--> statement-breakpoint
ALTER TABLE "factions" ADD CONSTRAINT "factions_tech" CHECK ("tech_level" >= 1 and "tech_blueprint" >= "tech_level");