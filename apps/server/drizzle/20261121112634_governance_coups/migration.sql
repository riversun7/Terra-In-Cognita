CREATE TABLE "governance_coup_sides" (
	"coup_id" bigint,
	"joiner_key" text,
	"user_id" uuid,
	"side" text NOT NULL,
	"power" integer DEFAULT 0 NOT NULL,
	"joined_at_ms" bigint NOT NULL,
	CONSTRAINT "governance_coup_sides_pkey" PRIMARY KEY("coup_id","joiner_key"),
	CONSTRAINT "governance_coup_sides_side" CHECK ("side" in ('rebel', 'government'))
);
--> statement-breakpoint
CREATE TABLE "governance_coups" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "governance_coups_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"nation_id" bigint NOT NULL,
	"house_key" text NOT NULL,
	"user_id" uuid,
	"opened_at_ms" bigint NOT NULL,
	"gather_until_ms" bigint NOT NULL,
	"status" text DEFAULT 'gathering' NOT NULL,
	"result" jsonb,
	"decided_at_ms" bigint,
	CONSTRAINT "governance_coups_status" CHECK ("status" in ('gathering', 'won', 'lost', 'cancelled')),
	CONSTRAINT "governance_coups_house" CHECK ("house_key" ~ '^[pn]:[1-9][0-9]{0,15}$')
);
--> statement-breakpoint
CREATE TABLE "governance_share_houses" (
	"nation_id" bigint PRIMARY KEY,
	"house_key" text,
	"treasury_kept" boolean DEFAULT false NOT NULL,
	"updated_at_ms" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "governance_coups_nation_idx" ON "governance_coups" ("nation_id","status");--> statement-breakpoint
CREATE INDEX "governance_coups_house_idx" ON "governance_coups" ("house_key","opened_at_ms");--> statement-breakpoint
ALTER TABLE "governance_coup_sides" ADD CONSTRAINT "governance_coup_sides_coup_id_governance_coups_id_fkey" FOREIGN KEY ("coup_id") REFERENCES "governance_coups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "governance_coups" ADD CONSTRAINT "governance_coups_nation_id_factions_id_fkey" FOREIGN KEY ("nation_id") REFERENCES "factions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "governance_share_houses" ADD CONSTRAINT "governance_share_houses_nation_id_factions_id_fkey" FOREIGN KEY ("nation_id") REFERENCES "factions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "governance_agendas" DROP CONSTRAINT "governance_agendas_kind", ADD CONSTRAINT "governance_agendas_kind" CHECK ("kind" in ('leader_election', 'leader_removal', 'regime_change', 'war_declaration', 'tax_change', 'city_independence', 'treasury_share_sale'));