CREATE TABLE "house_city_tax_state" (
	"faction_id" bigint PRIMARY KEY,
	"city_id" bigint NOT NULL,
	"last_billed_at_ms" bigint NOT NULL,
	"debt" bigint DEFAULT 0 NOT NULL,
	"debt_asset" text,
	"missed_cycles" integer DEFAULT 0 NOT NULL,
	"updated_at_ms" bigint NOT NULL,
	CONSTRAINT "house_city_tax_state_nonneg" CHECK ("debt" >= 0 and "missed_cycles" >= 0)
);
--> statement-breakpoint
ALTER TABLE "city_policies" ADD COLUMN "house_city_tax_amount" bigint;--> statement-breakpoint
ALTER TABLE "city_policies" ADD COLUMN "house_city_tax_period_days" integer;--> statement-breakpoint
ALTER TABLE "city_policies" ADD COLUMN "house_city_tax_setter" text;--> statement-breakpoint
CREATE INDEX "house_city_tax_state_city_idx" ON "house_city_tax_state" ("city_id");--> statement-breakpoint
ALTER TABLE "house_city_tax_state" ADD CONSTRAINT "house_city_tax_state_faction_id_factions_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "factions"("id") ON DELETE CASCADE;