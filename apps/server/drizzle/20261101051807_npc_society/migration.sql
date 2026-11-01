CREATE TABLE "faction_wars" (
	"faction_a" bigint,
	"faction_b" bigint,
	"state" text NOT NULL,
	"at_ms" bigint NOT NULL,
	CONSTRAINT "faction_wars_pkey" PRIMARY KEY("faction_a","faction_b"),
	CONSTRAINT "faction_wars_order" CHECK ("faction_a" < "faction_b"),
	CONSTRAINT "faction_wars_state" CHECK ("state" in ('war', 'truce'))
);
--> statement-breakpoint
CREATE TABLE "npc_society" (
	"id" smallint PRIMARY KEY,
	"seed" bigint NOT NULL,
	"day" integer DEFAULT 0 NOT NULL,
	"updated_at_ms" bigint NOT NULL,
	CONSTRAINT "npc_society_single" CHECK ("id" = 1)
);
--> statement-breakpoint
CREATE TABLE "world_humans" (
	"unit_id" bigint PRIMARY KEY,
	"city_id" bigint NOT NULL,
	"satisfaction_milli" integer NOT NULL,
	"born_at_ms" bigint NOT NULL,
	"lifespan_ms" bigint NOT NULL,
	"rebirths" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "world_humans_satisfaction" CHECK ("satisfaction_milli" between 0 and 100000)
);
--> statement-breakpoint
ALTER TABLE "factions" ADD COLUMN "research_progress" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "factions" ADD COLUMN "traits" smallint[];--> statement-breakpoint
ALTER TABLE "factions" ADD COLUMN "ai_step" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "factions" ADD COLUMN "dissolved_at_ms" bigint;--> statement-breakpoint
ALTER TABLE "factions" ADD COLUMN "rebel_of" bigint;--> statement-breakpoint
ALTER TABLE "world_cities" ADD COLUMN "development" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "world_cities" ADD COLUMN "next_rebellion_ms" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "world_humans_city_idx" ON "world_humans" ("city_id");--> statement-breakpoint
ALTER TABLE "faction_wars" ADD CONSTRAINT "faction_wars_faction_a_factions_id_fkey" FOREIGN KEY ("faction_a") REFERENCES "factions"("id");--> statement-breakpoint
ALTER TABLE "faction_wars" ADD CONSTRAINT "faction_wars_faction_b_factions_id_fkey" FOREIGN KEY ("faction_b") REFERENCES "factions"("id");--> statement-breakpoint
ALTER TABLE "factions" ADD CONSTRAINT "factions_rebel_of_factions_id_fkey" FOREIGN KEY ("rebel_of") REFERENCES "factions"("id");--> statement-breakpoint
ALTER TABLE "world_humans" ADD CONSTRAINT "world_humans_unit_id_world_units_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "world_units"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "world_humans" ADD CONSTRAINT "world_humans_city_id_world_cities_id_fkey" FOREIGN KEY ("city_id") REFERENCES "world_cities"("id");--> statement-breakpoint
ALTER TABLE "factions" ADD CONSTRAINT "factions_traits" CHECK ("traits" is null or cardinality("traits") = 4);