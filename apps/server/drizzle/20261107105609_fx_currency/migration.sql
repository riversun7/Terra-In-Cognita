CREATE TABLE "fx_orders" (
	"id" bigint PRIMARY KEY,
	"pair_id" bigint NOT NULL,
	"owner_id" bigint NOT NULL,
	"side" text NOT NULL,
	"price" bigint NOT NULL,
	"lots" bigint NOT NULL,
	"locked" bigint NOT NULL,
	"seq" integer NOT NULL,
	"placed_at_ms" bigint NOT NULL,
	"state" text NOT NULL,
	"filled_lots" bigint NOT NULL,
	"clear_price" bigint,
	"done_at_ms" bigint,
	CONSTRAINT "fx_orders_side" CHECK ("side" in ('buy', 'sell')),
	CONSTRAINT "fx_orders_state" CHECK ("state" in ('open', 'done', 'cancelled')),
	CONSTRAINT "fx_orders_amounts" CHECK ("price" > 0 and "lots" > 0 and "locked" >= 0 and "filled_lots" >= 0 and "filled_lots" <= "lots"),
	CONSTRAINT "fx_orders_done" CHECK (("state" = 'open') = ("done_at_ms" is null))
);
--> statement-breakpoint
CREATE TABLE "fx_pairs" (
	"id" bigint PRIMARY KEY,
	"currency" text NOT NULL,
	"created_at_ms" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_rounds" (
	"id" bigint PRIMARY KEY,
	"pair_id" bigint NOT NULL,
	"at_ms" bigint NOT NULL,
	"price" bigint,
	"lots" bigint NOT NULL,
	CONSTRAINT "fx_rounds_amounts" CHECK (("price" is null or "price" > 0) and "lots" >= 0)
);
--> statement-breakpoint
ALTER TABLE "market_books" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "market_trades" ADD COLUMN "currency" text;--> statement-breakpoint
CREATE INDEX "fx_orders_pair_idx" ON "fx_orders" ("pair_id");--> statement-breakpoint
CREATE INDEX "fx_orders_owner_idx" ON "fx_orders" ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fx_pairs_currency" ON "fx_pairs" ("currency");--> statement-breakpoint
CREATE INDEX "fx_rounds_pair_at_idx" ON "fx_rounds" ("pair_id","at_ms");--> statement-breakpoint
ALTER TABLE "fx_orders" ADD CONSTRAINT "fx_orders_pair_id_fx_pairs_id_fkey" FOREIGN KEY ("pair_id") REFERENCES "fx_pairs"("id");--> statement-breakpoint
ALTER TABLE "fx_orders" ADD CONSTRAINT "fx_orders_owner_id_world_owners_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "world_owners"("id");--> statement-breakpoint
ALTER TABLE "fx_rounds" ADD CONSTRAINT "fx_rounds_pair_id_fx_pairs_id_fkey" FOREIGN KEY ("pair_id") REFERENCES "fx_pairs"("id");