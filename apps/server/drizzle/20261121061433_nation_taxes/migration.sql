CREATE TABLE "nation_taxes" (
	"faction_id" bigint PRIMARY KEY,
	"income_tax_bp" integer,
	"resident_tax_pm" integer,
	"resident_every_days" integer,
	"resident_nation_pm" integer,
	"set_at_ms" bigint NOT NULL,
	"set_by" uuid,
	CONSTRAINT "nation_taxes_income_tax_bp" CHECK ("income_tax_bp" between 0 and 10000),
	CONSTRAINT "nation_taxes_resident_tax_pm" CHECK ("resident_tax_pm" between 0 and 1000),
	CONSTRAINT "nation_taxes_resident_every_days" CHECK ("resident_every_days" between 1 and 365),
	CONSTRAINT "nation_taxes_resident_nation_pm" CHECK ("resident_nation_pm" between 0 and 1000)
);
--> statement-breakpoint
ALTER TABLE "nation_taxes" ADD CONSTRAINT "nation_taxes_faction_id_factions_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "factions"("id") ON DELETE CASCADE;