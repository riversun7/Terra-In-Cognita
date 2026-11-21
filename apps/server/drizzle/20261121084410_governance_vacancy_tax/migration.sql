CREATE TABLE "governance_share_fixups" (
	"city_id" bigint PRIMARY KEY,
	"house_key" text NOT NULL,
	"shares" bigint NOT NULL,
	"done_at_ms" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "governance_state" ADD COLUMN "vacant_since_ms" bigint;--> statement-breakpoint
ALTER TABLE "governance_agendas" DROP CONSTRAINT "governance_agendas_kind", ADD CONSTRAINT "governance_agendas_kind" CHECK ("kind" in ('leader_election', 'leader_removal', 'regime_change', 'war_declaration', 'tax_change'));