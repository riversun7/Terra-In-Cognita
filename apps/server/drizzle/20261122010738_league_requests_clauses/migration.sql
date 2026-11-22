CREATE TABLE "house_league_clauses" (
	"league_id" bigint,
	"clause" text,
	"at_ms" bigint NOT NULL,
	CONSTRAINT "house_league_clauses_pkey" PRIMARY KEY("league_id","clause")
);
--> statement-breakpoint
CREATE TABLE "house_league_requests" (
	"league_id" bigint,
	"house_key" text,
	"kind" text NOT NULL,
	"at_ms" bigint NOT NULL,
	CONSTRAINT "house_league_requests_pkey" PRIMARY KEY("league_id","house_key"),
	CONSTRAINT "house_league_requests_house_key" CHECK ("house_key" ~ '^[pn]:[1-9][0-9]*$'),
	CONSTRAINT "house_league_requests_kind" CHECK ("kind" in ('invite', 'apply'))
);
--> statement-breakpoint
CREATE INDEX "house_league_requests_house_idx" ON "house_league_requests" ("house_key");--> statement-breakpoint
ALTER TABLE "house_league_clauses" ADD CONSTRAINT "house_league_clauses_league_id_house_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "house_leagues"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "house_league_requests" ADD CONSTRAINT "house_league_requests_league_id_house_leagues_id_fkey" FOREIGN KEY ("league_id") REFERENCES "house_leagues"("id") ON DELETE CASCADE;