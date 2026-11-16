CREATE TABLE "house_policies" (
	"faction_id" bigint PRIMARY KEY,
	"tax_pm" integer DEFAULT 0 NOT NULL,
	"set_at_ms" bigint NOT NULL,
	"set_by" uuid,
	CONSTRAINT "house_policies_tax_pm" CHECK ("tax_pm" between 0 and 1000)
);
--> statement-breakpoint
ALTER TABLE "city_policies" ADD COLUMN "house_build" boolean;--> statement-breakpoint
ALTER TABLE "house_policies" ADD CONSTRAINT "house_policies_faction_id_factions_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "factions"("id") ON DELETE CASCADE;