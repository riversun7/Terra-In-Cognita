CREATE TABLE "labor_postings" (
	"id" bigint PRIMARY KEY,
	"building_id" bigint NOT NULL,
	"owner_id" bigint NOT NULL,
	"job" text NOT NULL,
	"asset" text NOT NULL,
	"adjust_pm" integer NOT NULL,
	"slots" integer NOT NULL,
	"filled" integer DEFAULT 0 NOT NULL,
	"term_hours" integer,
	"state" text NOT NULL,
	"posted_at_ms" bigint NOT NULL,
	"closed_at_ms" bigint,
	CONSTRAINT "labor_postings_job" CHECK ("job" in ('gather')),
	CONSTRAINT "labor_postings_state" CHECK ("state" in ('open', 'filled', 'withdrawn', 'gone')),
	CONSTRAINT "labor_postings_counts" CHECK ("slots" > 0 and "filled" >= 0 and "filled" <= "slots" and "adjust_pm" >= 0),
	CONSTRAINT "labor_postings_term" CHECK ("term_hours" is null or "term_hours" > 0),
	CONSTRAINT "labor_postings_closed" CHECK (("state" = 'open') = ("closed_at_ms" is null)),
	CONSTRAINT "labor_postings_asset_format" CHECK ("asset" ~ '^[a-z][a-z0-9_]{1,47}$')
);
--> statement-breakpoint
ALTER TABLE "labor_contracts" ADD COLUMN "leftovers_moved_at_ms" bigint;--> statement-breakpoint
CREATE INDEX "labor_postings_building_idx" ON "labor_postings" ("building_id");--> statement-breakpoint
CREATE INDEX "labor_postings_owner_idx" ON "labor_postings" ("owner_id");--> statement-breakpoint
ALTER TABLE "labor_contracts" ADD CONSTRAINT "labor_contracts_leftovers" CHECK ("leftovers_moved_at_ms" is null or ("state" = 'ended' and "kind" = 'lease'));