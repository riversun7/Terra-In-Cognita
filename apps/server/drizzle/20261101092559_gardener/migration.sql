CREATE TABLE "gardener_waves" (
	"id" bigint PRIMARY KEY,
	"planet_id" text DEFAULT 's2_test_planet' NOT NULL,
	"city_id" bigint NOT NULL,
	"cell_key" bigint NOT NULL,
	"faction_id" bigint,
	"strength" integer NOT NULL,
	"physical" integer NOT NULL,
	"created_at_ms" bigint NOT NULL,
	"arrive_at_ms" bigint NOT NULL,
	"state" text NOT NULL,
	"battle_id" bigint,
	"resolved_at_ms" bigint,
	CONSTRAINT "gardener_waves_state" CHECK ("state" in ('marching', 'fighting', 'won', 'repelled', 'disbanded'))
);
--> statement-breakpoint
CREATE TABLE "planet_pollution" (
	"planet_id" text DEFAULT 's2_test_planet',
	"cell_key" bigint,
	"value" integer NOT NULL,
	"updated_at_ms" bigint NOT NULL,
	CONSTRAINT "planet_pollution_pkey" PRIMARY KEY("planet_id","cell_key"),
	CONSTRAINT "planet_pollution_value" CHECK ("value" between 1 and 100000),
	CONSTRAINT "planet_pollution_planet_id_format" CHECK ("planet_id" ~ '^[a-z][a-z0-9_]{1,47}$')
);
--> statement-breakpoint
ALTER TABLE "npc_society" ADD COLUMN "gardener" jsonb;--> statement-breakpoint
ALTER TABLE "world_cities" ADD COLUMN "wave_cooldown_until_ms" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "world_humans" ALTER COLUMN "city_id" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "gardener_waves_state_idx" ON "gardener_waves" ("state");--> statement-breakpoint
CREATE INDEX "gardener_waves_city_idx" ON "gardener_waves" ("city_id");