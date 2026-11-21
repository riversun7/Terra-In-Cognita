CREATE TABLE "governance_agendas" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "governance_agendas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"nation_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"regime" text NOT NULL,
	"proposer_key" text,
	"proposer_user" uuid,
	"payload" jsonb DEFAULT '{}' NOT NULL,
	"opened_at_ms" bigint NOT NULL,
	"register_until_ms" bigint,
	"closes_at_ms" bigint NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"result" jsonb,
	"decided_at_ms" bigint,
	"effect_at_ms" bigint,
	"enacted_at_ms" bigint,
	CONSTRAINT "governance_agendas_kind" CHECK ("kind" in ('leader_election', 'leader_removal', 'regime_change', 'war_declaration')),
	CONSTRAINT "governance_agendas_status" CHECK ("status" in ('open', 'passed', 'enacted', 'failed', 'cancelled')),
	CONSTRAINT "governance_agendas_regime" CHECK ("regime" in ('dictatorship', 'democracy', 'capitalism'))
);
--> statement-breakpoint
CREATE TABLE "governance_candidates" (
	"agenda_id" bigint,
	"house_key" text,
	"user_id" uuid,
	"registered_at_ms" bigint NOT NULL,
	CONSTRAINT "governance_candidates_pkey" PRIMARY KEY("agenda_id","house_key"),
	CONSTRAINT "governance_candidates_key" CHECK ("house_key" ~ '^[pn]:[1-9][0-9]{0,15}$')
);
--> statement-breakpoint
CREATE TABLE "governance_state" (
	"nation_id" bigint PRIMARY KEY,
	"ruling_house_key" text,
	"elected_at_ms" bigint,
	"term_ends_at_ms" bigint,
	"share_votes_suspended" boolean DEFAULT false NOT NULL,
	"updated_at_ms" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "governance_votes" (
	"agenda_id" bigint,
	"voter_key" text,
	"user_id" uuid,
	"npc" boolean DEFAULT false NOT NULL,
	"choice" text NOT NULL,
	"weight" bigint NOT NULL,
	"cast_at_ms" bigint NOT NULL,
	CONSTRAINT "governance_votes_pkey" PRIMARY KEY("agenda_id","voter_key"),
	CONSTRAINT "governance_votes_key" CHECK ("voter_key" ~ '^[pno]:[1-9][0-9]{0,15}$')
);
--> statement-breakpoint
CREATE INDEX "governance_agendas_nation_idx" ON "governance_agendas" ("nation_id","status");--> statement-breakpoint
ALTER TABLE "governance_agendas" ADD CONSTRAINT "governance_agendas_nation_id_factions_id_fkey" FOREIGN KEY ("nation_id") REFERENCES "factions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "governance_candidates" ADD CONSTRAINT "governance_candidates_agenda_id_governance_agendas_id_fkey" FOREIGN KEY ("agenda_id") REFERENCES "governance_agendas"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "governance_state" ADD CONSTRAINT "governance_state_nation_id_factions_id_fkey" FOREIGN KEY ("nation_id") REFERENCES "factions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "governance_votes" ADD CONSTRAINT "governance_votes_agenda_id_governance_agendas_id_fkey" FOREIGN KEY ("agenda_id") REFERENCES "governance_agendas"("id") ON DELETE CASCADE;