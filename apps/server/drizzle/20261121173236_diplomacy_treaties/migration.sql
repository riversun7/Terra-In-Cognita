CREATE TABLE "diplomacy_treaties" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "diplomacy_treaties_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"nation_a" bigint NOT NULL,
	"nation_b" bigint NOT NULL,
	"author_nation" bigint NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"clauses" jsonb NOT NULL,
	"days" integer NOT NULL,
	"state" text NOT NULL,
	"author_ready" boolean DEFAULT false NOT NULL,
	"agenda_id" bigint,
	"agenda_nation" bigint,
	"respond_by_ms" bigint,
	"created_at_ms" bigint NOT NULL,
	"updated_at_ms" bigint NOT NULL,
	"activated_at_ms" bigint,
	"expires_at_ms" bigint,
	"ended_at_ms" bigint,
	"next_tribute_ms" bigint,
	CONSTRAINT "diplomacy_treaties_state" CHECK ("state" in ('proposed', 'negotiating', 'active', 'expired', 'broken', 'declined', 'lapsed')),
	CONSTRAINT "diplomacy_treaties_pair" CHECK ("nation_a" <> "nation_b"),
	CONSTRAINT "diplomacy_treaties_days" CHECK ("days" between 1 and 3650)
);
--> statement-breakpoint
CREATE TABLE "diplomacy_war_joins" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "diplomacy_war_joins_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"treaty_id" bigint NOT NULL,
	"requester_nation" bigint NOT NULL,
	"joiner_nation" bigint NOT NULL,
	"enemy_nation" bigint NOT NULL,
	"state" text NOT NULL,
	"auto" boolean DEFAULT false NOT NULL,
	"created_at_ms" bigint NOT NULL,
	"respond_by_ms" bigint NOT NULL,
	"decided_at_ms" bigint,
	"note" jsonb,
	CONSTRAINT "diplomacy_war_joins_state" CHECK ("state" in ('requested', 'joined', 'declined', 'lapsed'))
);
--> statement-breakpoint
CREATE INDEX "diplomacy_treaties_a_idx" ON "diplomacy_treaties" ("nation_a","state");--> statement-breakpoint
CREATE INDEX "diplomacy_treaties_b_idx" ON "diplomacy_treaties" ("nation_b","state");--> statement-breakpoint
CREATE INDEX "diplomacy_war_joins_treaty_idx" ON "diplomacy_war_joins" ("treaty_id","state");--> statement-breakpoint
CREATE INDEX "diplomacy_war_joins_joiner_idx" ON "diplomacy_war_joins" ("joiner_nation","state");--> statement-breakpoint
ALTER TABLE "diplomacy_treaties" ADD CONSTRAINT "diplomacy_treaties_nation_a_factions_id_fkey" FOREIGN KEY ("nation_a") REFERENCES "factions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "diplomacy_treaties" ADD CONSTRAINT "diplomacy_treaties_nation_b_factions_id_fkey" FOREIGN KEY ("nation_b") REFERENCES "factions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "diplomacy_treaties" ADD CONSTRAINT "diplomacy_treaties_agenda_id_governance_agendas_id_fkey" FOREIGN KEY ("agenda_id") REFERENCES "governance_agendas"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "diplomacy_war_joins" ADD CONSTRAINT "diplomacy_war_joins_treaty_id_diplomacy_treaties_id_fkey" FOREIGN KEY ("treaty_id") REFERENCES "diplomacy_treaties"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "governance_agendas" DROP CONSTRAINT "governance_agendas_kind", ADD CONSTRAINT "governance_agendas_kind" CHECK ("kind" in ('leader_election', 'leader_removal', 'regime_change', 'war_declaration', 'tax_change', 'city_independence', 'treasury_share_sale', 'peace', 'currency_stage', 'house_independence', 'treaty'));