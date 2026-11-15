CREATE TABLE "business_prices" (
	"building_id" bigint,
	"item" text,
	"planet_id" text DEFAULT 's2_test_planet' NOT NULL,
	"price" bigint NOT NULL,
	CONSTRAINT "business_prices_pkey" PRIMARY KEY("building_id","item"),
	CONSTRAINT "business_prices_price" CHECK ("price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "business_states" (
	"building_id" bigint PRIMARY KEY,
	"planet_id" text DEFAULT 's2_test_planet' NOT NULL,
	"debt_since_ms" bigint,
	"suspended_at_ms" bigint,
	"settled_at_ms" bigint
);
