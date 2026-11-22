CREATE TABLE "diplomacy_affinity" (
	"nation_a" bigint,
	"nation_b" bigint,
	"score" integer NOT NULL,
	"updated_at_ms" bigint NOT NULL,
	CONSTRAINT "diplomacy_affinity_pkey" PRIMARY KEY("nation_a","nation_b"),
	CONSTRAINT "diplomacy_affinity_order" CHECK ("nation_a" < "nation_b"),
	CONSTRAINT "diplomacy_affinity_range" CHECK ("score" between -100 and 100)
);
--> statement-breakpoint
CREATE TABLE "treasury_share_runs" (
	"agenda_id" bigint PRIMARY KEY,
	"nation_id" bigint NOT NULL,
	"side" text NOT NULL,
	"city_id" bigint NOT NULL,
	"target" bigint NOT NULL,
	"price" bigint NOT NULL,
	"done" bigint DEFAULT 0 NOT NULL,
	"started_at_ms" bigint NOT NULL,
	"ends_at_ms" bigint NOT NULL,
	"state" text NOT NULL,
	"revote_agenda_id" bigint,
	CONSTRAINT "treasury_share_runs_side" CHECK ("side" in ('buy', 'sell')),
	CONSTRAINT "treasury_share_runs_state" CHECK ("state" in ('active', 'filled', 'expired', 'cancelled')),
	CONSTRAINT "treasury_share_runs_amounts" CHECK ("target" > 0 and "price" > 0 and "done" >= 0)
);
--> statement-breakpoint
ALTER TABLE "business_share_orders" ADD COLUMN "exchange_id" bigint;--> statement-breakpoint
ALTER TABLE "city_share_orders" ADD COLUMN "exchange_id" bigint;--> statement-breakpoint
ALTER TABLE "house_members" ADD COLUMN "contribution" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "governance_state" ADD COLUMN "vacancy_cause" text;--> statement-breakpoint
CREATE INDEX "treasury_share_runs_active" ON "treasury_share_runs" ("state");--> statement-breakpoint
ALTER TABLE "diplomacy_affinity" ADD CONSTRAINT "diplomacy_affinity_nation_a_factions_id_fkey" FOREIGN KEY ("nation_a") REFERENCES "factions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "diplomacy_affinity" ADD CONSTRAINT "diplomacy_affinity_nation_b_factions_id_fkey" FOREIGN KEY ("nation_b") REFERENCES "factions"("id") ON DELETE CASCADE;