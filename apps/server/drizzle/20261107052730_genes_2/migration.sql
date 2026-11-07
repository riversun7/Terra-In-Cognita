CREATE TABLE "unit_skills" (
	"unit_id" bigint,
	"skill_id" text,
	"grade" smallint DEFAULT 1 NOT NULL,
	"source" text NOT NULL,
	"learned_at_ms" bigint NOT NULL,
	CONSTRAINT "unit_skills_pkey" PRIMARY KEY("unit_id","skill_id"),
	CONSTRAINT "unit_skills_skill_format" CHECK ("skill_id" ~ '^[a-z][a-z0-9_]{1,47}$'),
	CONSTRAINT "unit_skills_grade" CHECK ("grade" between 1 and 10),
	CONSTRAINT "unit_skills_source_format" CHECK ("source" ~ '^[a-z][a-z0-9_]{1,31}$')
);
--> statement-breakpoint
ALTER TABLE "item_holdings" ADD COLUMN "gene" jsonb;--> statement-breakpoint
ALTER TABLE "unit_skills" ADD CONSTRAINT "unit_skills_unit_id_world_units_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "world_units"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "item_holdings" ADD CONSTRAINT "item_holdings_gene" CHECK ("gene" is null or "quantity" = 1);