CREATE TABLE "labor_contracts" (
	"id" bigint PRIMARY KEY,
	"kind" text NOT NULL,
	"owner_id" bigint NOT NULL,
	"worker_owner_id" bigint NOT NULL,
	"unit_id" bigint NOT NULL,
	"building_id" bigint NOT NULL,
	"asset" text NOT NULL,
	"rate" bigint NOT NULL,
	"deposit" bigint DEFAULT 0 NOT NULL,
	"started_at_ms" bigint NOT NULL,
	"ends_at_ms" bigint,
	"settled_at_ms" bigint NOT NULL,
	"next_due_ms" bigint NOT NULL,
	"state" text NOT NULL,
	"grace_until_ms" bigint,
	"ended_at_ms" bigint,
	"end_reason" text,
	"paid_total" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "labor_contracts_kind" CHECK ("kind" in ('wage', 'lease')),
	CONSTRAINT "labor_contracts_state" CHECK ("state" in ('active', 'paused', 'grace', 'ended')),
	CONSTRAINT "labor_contracts_rate" CHECK ("rate" > 0),
	CONSTRAINT "labor_contracts_deposit" CHECK ("deposit" >= 0 and ("kind" = 'wage' or "deposit" = 0)),
	CONSTRAINT "labor_contracts_end" CHECK (("state" in ('active', 'paused')) = ("end_reason" is null) and ("state" = 'grace') = ("grace_until_ms" is not null)),
	CONSTRAINT "labor_contracts_asset_format" CHECK ("asset" ~ '^[a-z][a-z0-9_]{1,47}$')
);
--> statement-breakpoint
CREATE TABLE "labor_rents" (
	"building_id" bigint PRIMARY KEY,
	"owner_id" bigint NOT NULL,
	"asset" text NOT NULL,
	"rent_per_hour" bigint NOT NULL,
	"updated_at_ms" bigint NOT NULL,
	CONSTRAINT "labor_rents_nonnegative" CHECK ("rent_per_hour" >= 0),
	CONSTRAINT "labor_rents_asset_format" CHECK ("asset" ~ '^[a-z][a-z0-9_]{1,47}$')
);
--> statement-breakpoint
CREATE INDEX "labor_contracts_owner_idx" ON "labor_contracts" ("owner_id");--> statement-breakpoint
CREATE INDEX "labor_contracts_worker_owner_idx" ON "labor_contracts" ("worker_owner_id");--> statement-breakpoint
CREATE INDEX "labor_contracts_unit_idx" ON "labor_contracts" ("unit_id");