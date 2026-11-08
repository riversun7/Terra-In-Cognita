CREATE TABLE "ops_switches" (
	"id" text PRIMARY KEY,
	"enabled" boolean NOT NULL,
	"updated_at_ms" bigint NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "ops_switches_id_format" CHECK ("id" ~ '^[a-z][a-z0-9_]{1,47}$')
);
