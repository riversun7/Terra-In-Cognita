CREATE TABLE "market_books" (
	"id" bigint PRIMARY KEY,
	"city_id" bigint NOT NULL,
	"item" text NOT NULL,
	"created_at_ms" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_orders" (
	"id" bigint PRIMARY KEY,
	"market_id" bigint NOT NULL,
	"owner_id" bigint NOT NULL,
	"side" text NOT NULL,
	"price" bigint NOT NULL,
	"qty" bigint NOT NULL,
	"remaining" bigint NOT NULL,
	"locked" bigint NOT NULL,
	"seq" integer NOT NULL,
	"placed_at_ms" bigint NOT NULL,
	"expires_at_ms" bigint NOT NULL,
	"state" text NOT NULL,
	"done_at_ms" bigint,
	CONSTRAINT "market_orders_side" CHECK ("side" in ('buy', 'sell')),
	CONSTRAINT "market_orders_state" CHECK ("state" in ('open', 'filled', 'cancelled', 'expired')),
	CONSTRAINT "market_orders_amounts" CHECK ("price" > 0 and "qty" > 0 and "remaining" >= 0 and "remaining" <= "qty" and "locked" >= 0),
	CONSTRAINT "market_orders_done" CHECK (("state" = 'open') = ("done_at_ms" is null))
);
--> statement-breakpoint
CREATE TABLE "market_trades" (
	"id" bigint PRIMARY KEY,
	"market_id" bigint NOT NULL,
	"price" bigint NOT NULL,
	"qty" bigint NOT NULL,
	"taker_side" text NOT NULL,
	"maker_order_id" bigint NOT NULL,
	"taker_order_id" bigint NOT NULL,
	"maker_owner_id" bigint NOT NULL,
	"taker_owner_id" bigint NOT NULL,
	"at_ms" bigint NOT NULL,
	CONSTRAINT "market_trades_side" CHECK ("taker_side" in ('buy', 'sell')),
	CONSTRAINT "market_trades_amounts" CHECK ("price" > 0 and "qty" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "market_books_city_item" ON "market_books" ("city_id","item");--> statement-breakpoint
CREATE INDEX "market_orders_market_idx" ON "market_orders" ("market_id");--> statement-breakpoint
CREATE INDEX "market_orders_owner_idx" ON "market_orders" ("owner_id");--> statement-breakpoint
CREATE INDEX "market_trades_market_at_idx" ON "market_trades" ("market_id","at_ms");--> statement-breakpoint
ALTER TABLE "market_orders" ADD CONSTRAINT "market_orders_market_id_market_books_id_fkey" FOREIGN KEY ("market_id") REFERENCES "market_books"("id");--> statement-breakpoint
ALTER TABLE "market_orders" ADD CONSTRAINT "market_orders_owner_id_world_owners_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "world_owners"("id");--> statement-breakpoint
ALTER TABLE "market_trades" ADD CONSTRAINT "market_trades_market_id_market_books_id_fkey" FOREIGN KEY ("market_id") REFERENCES "market_books"("id");