CREATE TABLE "city_share_orders" (
	"id" bigint PRIMARY KEY,
	"city_id" bigint NOT NULL,
	"planet_id" text DEFAULT 's2_test_planet' NOT NULL,
	"holder" text NOT NULL,
	"side" text NOT NULL,
	"price" bigint NOT NULL,
	"shares" bigint NOT NULL,
	"asset" text NOT NULL,
	"locked" bigint NOT NULL,
	"seq" integer NOT NULL,
	"placed_at_ms" bigint NOT NULL,
	"state" text NOT NULL,
	"filled" bigint DEFAULT 0 NOT NULL,
	"clear_price" bigint,
	"done_at_ms" bigint,
	"agenda_id" bigint,
	CONSTRAINT "city_share_orders_side" CHECK ("side" in ('buy', 'sell')),
	CONSTRAINT "city_share_orders_state" CHECK ("state" in ('open', 'done', 'cancelled')),
	CONSTRAINT "city_share_orders_amounts" CHECK ("price" > 0 and "shares" > 0 and "locked" >= 0)
);
--> statement-breakpoint
CREATE TABLE "city_share_rounds" (
	"id" bigint PRIMARY KEY,
	"city_id" bigint NOT NULL,
	"planet_id" text DEFAULT 's2_test_planet' NOT NULL,
	"at_ms" bigint NOT NULL,
	"price" bigint,
	"shares" bigint NOT NULL,
	"asset" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "city_share_orders_open" ON "city_share_orders" ("state","city_id");--> statement-breakpoint
CREATE INDEX "city_share_orders_holder" ON "city_share_orders" ("holder","id");--> statement-breakpoint
CREATE INDEX "city_share_rounds_city" ON "city_share_rounds" ("city_id","at_ms");