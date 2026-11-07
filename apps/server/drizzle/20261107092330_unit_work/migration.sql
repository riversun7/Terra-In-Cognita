CREATE TABLE "unit_work" (
	"unit_id" bigint PRIMARY KEY,
	"owner_id" bigint NOT NULL,
	"building_id" bigint,
	"assigned_at_ms" bigint,
	"gather_building_id" bigint,
	"gather_points" bigint DEFAULT 0 NOT NULL,
	"gather_seq" bigint DEFAULT 0 NOT NULL,
	"updated_at_ms" bigint NOT NULL,
	CONSTRAINT "unit_work_assigned" CHECK (("building_id" is null) = ("assigned_at_ms" is null)),
	CONSTRAINT "unit_work_gather" CHECK ("gather_points" >= 0 and "gather_seq" >= 0)
);
--> statement-breakpoint
CREATE INDEX "unit_work_owner_idx" ON "unit_work" ("owner_id");--> statement-breakpoint
CREATE INDEX "unit_work_building_idx" ON "unit_work" ("building_id");