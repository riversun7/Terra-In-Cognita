ALTER TABLE "governance_approval" ADD COLUMN "tax_level_pm" integer;--> statement-breakpoint
ALTER TABLE "governance_approval" ADD COLUMN "cities" integer;--> statement-breakpoint
ALTER TABLE "governance_approval" ADD COLUMN "wars" integer;--> statement-breakpoint
ALTER TABLE "governance_approval" ADD COLUMN "day_at_ms" bigint;--> statement-breakpoint
ALTER TABLE "governance_coups" ADD COLUMN "city_id" bigint;--> statement-breakpoint
ALTER TABLE "nation_monetary" ADD COLUMN "price_cap_milli" integer;--> statement-breakpoint
ALTER TABLE "nation_monetary" ADD CONSTRAINT "nation_monetary_cap" CHECK ("price_cap_milli" is null or "price_cap_milli" between 1 and 1000000);