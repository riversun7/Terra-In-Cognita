CREATE TABLE "house_league_members" (
	"league_id" bigint,
	"house_key" text,
	"joined_at_ms" bigint NOT NULL,
	CONSTRAINT "house_league_members_pkey" PRIMARY KEY("league_id","house_key"),
	CONSTRAINT "house_league_members_house_key" CHECK ("house_key" ~ '^[pn]:[1-9][0-9]*$')
);
--> statement-breakpoint
CREATE TABLE "house_league_votes" (
	"league_id" bigint,
	"voter_key" text,
	"candidate_key" text NOT NULL,
	"at_ms" bigint NOT NULL,
	CONSTRAINT "house_league_votes_pkey" PRIMARY KEY("league_id","voter_key"),
	CONSTRAINT "house_league_votes_voter_key" CHECK ("voter_key" ~ '^[pn]:[1-9][0-9]*$'),
	CONSTRAINT "house_league_votes_candidate_key" CHECK ("candidate_key" ~ '^[pn]:[1-9][0-9]*$')
);
--> statement-breakpoint
CREATE TABLE "house_leagues" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "house_leagues_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"founder_key" text NOT NULL,
	"representative_key" text NOT NULL,
	"created_at_ms" bigint NOT NULL,
	"ended_at_ms" bigint,
	CONSTRAINT "house_leagues_founder_key" CHECK ("founder_key" ~ '^[pn]:[1-9][0-9]*$'),
	CONSTRAINT "house_leagues_representative_key" CHECK ("representative_key" ~ '^[pn]:[1-9][0-9]*$')
);
--> statement-breakpoint
CREATE INDEX "house_league_members_house_idx" ON "house_league_members" ("house_key");--> statement-breakpoint
ALTER TABLE "house_league_members" ADD CONSTRAINT "house_league_members_league_id_house_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "house_leagues"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "house_league_votes" ADD CONSTRAINT "house_league_votes_league_id_house_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "house_leagues"("id") ON DELETE CASCADE;