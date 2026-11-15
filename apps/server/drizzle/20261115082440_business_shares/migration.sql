CREATE TABLE "business_share_orders" (
	"id" bigint PRIMARY KEY,
	"building_id" bigint NOT NULL,
	"planet_id" text DEFAULT 's2_test_planet' NOT NULL,
	"owner_id" bigint NOT NULL,
	"side" text NOT NULL,
	"price" bigint NOT NULL,
	"shares" bigint NOT NULL,
	"locked" bigint NOT NULL,
	"seq" integer NOT NULL,
	"placed_at_ms" bigint NOT NULL,
	"state" text NOT NULL,
	"filled" bigint DEFAULT 0 NOT NULL,
	"clear_price" bigint,
	"done_at_ms" bigint,
	CONSTRAINT "business_share_orders_side" CHECK ("side" in ('buy', 'sell')),
	CONSTRAINT "business_share_orders_state" CHECK ("state" in ('open', 'done', 'cancelled')),
	CONSTRAINT "business_share_orders_amounts" CHECK ("price" > 0 and "shares" > 0)
);
--> statement-breakpoint
CREATE TABLE "business_share_rounds" (
	"id" bigint PRIMARY KEY,
	"building_id" bigint NOT NULL,
	"planet_id" text DEFAULT 's2_test_planet' NOT NULL,
	"at_ms" bigint NOT NULL,
	"price" bigint,
	"shares" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "business_share_orders_open" ON "business_share_orders" ("state","building_id");--> statement-breakpoint
CREATE INDEX "business_share_orders_owner" ON "business_share_orders" ("owner_id","id");--> statement-breakpoint
CREATE INDEX "business_share_rounds_building" ON "business_share_rounds" ("building_id","at_ms");