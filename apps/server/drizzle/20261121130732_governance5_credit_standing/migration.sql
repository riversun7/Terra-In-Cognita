CREATE TABLE "credit_standings" (
	"owner_id" bigint PRIMARY KEY,
	"nation_id" bigint NOT NULL,
	"since_ms" bigint NOT NULL,
	"rise" integer DEFAULT 0 NOT NULL,
	"rose_day" integer NOT NULL,
	"updated_at_ms" bigint NOT NULL,
	CONSTRAINT "credit_standings_rise" CHECK ("rise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "governance_approval" (
	"nation_id" bigint PRIMARY KEY,
	"house_key" text,
	"approval" integer NOT NULL,
	"set_at_ms" bigint NOT NULL,
	CONSTRAINT "governance_approval_range" CHECK ("approval" between 0 and 1000)
);
--> statement-breakpoint
CREATE TABLE "nation_monetary" (
	"nation_id" bigint PRIMARY KEY,
	"mode" text NOT NULL,
	"rate_bp" integer DEFAULT 0 NOT NULL,
	"set_at_ms" bigint NOT NULL,
	"set_by" uuid,
	CONSTRAINT "nation_monetary_mode" CHECK ("mode" in ('formula', 'manual')),
	CONSTRAINT "nation_monetary_rate" CHECK ("rate_bp" between -10000 and 10000)
);
--> statement-breakpoint
ALTER TABLE "nation_taxes" ADD COLUMN "trade_tax_bp" integer;--> statement-breakpoint
ALTER TABLE "governance_coup_sides" ADD COLUMN "units" jsonb;--> statement-breakpoint
ALTER TABLE "governance_approval" ADD CONSTRAINT "governance_approval_nation_id_factions_id_fkey" FOREIGN KEY ("nation_id") REFERENCES "factions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "nation_monetary" ADD CONSTRAINT "nation_monetary_nation_id_factions_id_fkey" FOREIGN KEY ("nation_id") REFERENCES "factions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "nation_taxes" ADD CONSTRAINT "nation_taxes_trade_tax_bp" CHECK ("trade_tax_bp" between 0 and 10000);--> statement-breakpoint
ALTER TABLE "governance_agendas" DROP CONSTRAINT "governance_agendas_kind", ADD CONSTRAINT "governance_agendas_kind" CHECK ("kind" in ('leader_election', 'leader_removal', 'regime_change', 'war_declaration', 'tax_change', 'city_independence', 'treasury_share_sale', 'peace', 'currency_stage', 'house_independence'));--> statement-breakpoint
ALTER TABLE "credit_marks" DROP CONSTRAINT "credit_marks_kind", ADD CONSTRAINT "credit_marks_kind" CHECK ("kind" in ('resident', 'business', 'upkeep', 'coup_join', 'same_nation_attack'));