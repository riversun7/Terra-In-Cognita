CREATE TABLE "unit_residences" (
	"unit_id" bigint PRIMARY KEY,
	"owner_id" bigint NOT NULL,
	"building_id" bigint NOT NULL,
	"chosen_at_ms" bigint NOT NULL,
	CONSTRAINT "unit_residences_ids" CHECK ("unit_id" > 0 and "building_id" > 0)
);
--> statement-breakpoint
CREATE INDEX "unit_residences_owner_idx" ON "unit_residences" ("owner_id");