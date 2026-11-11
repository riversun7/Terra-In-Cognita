CREATE TABLE "catchment_cell_stock" (
	"planet_id" text DEFAULT 's2_test_planet',
	"cell_key" bigint,
	"ore" integer NOT NULL,
	"wood" integer NOT NULL,
	"herb" integer NOT NULL,
	"crop" integer NOT NULL,
	"livestock" integer NOT NULL,
	"fish" integer NOT NULL,
	"updated_at_ms" bigint NOT NULL,
	CONSTRAINT "catchment_cell_stock_pkey" PRIMARY KEY("planet_id","cell_key"),
	CONSTRAINT "catchment_cell_stock_range" CHECK ("ore" between 0 and 1000000 and "wood" between 0 and 1000000 and "herb" between 0 and 1000000
        and "crop" between 0 and 1000000 and "livestock" between 0 and 1000000 and "fish" between 0 and 1000000),
	CONSTRAINT "catchment_cell_stock_planet_id_format" CHECK ("planet_id" ~ '^[a-z][a-z0-9_]{1,47}$')
);
--> statement-breakpoint
ALTER TABLE "factions" ADD COLUMN "recruit_auto" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "world_cities" ADD COLUMN "catchment" integer[];