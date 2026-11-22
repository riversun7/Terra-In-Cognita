CREATE TABLE "residence_rents" (
	"building_id" bigint PRIMARY KEY,
	"owner_id" bigint NOT NULL,
	"rent" bigint NOT NULL,
	"set_at_ms" bigint NOT NULL,
	CONSTRAINT "residence_rents_values" CHECK ("building_id" > 0 and "rent" >= 0)
);
--> statement-breakpoint
ALTER TABLE "unit_residences" ADD COLUMN "paid_until_ms" bigint;--> statement-breakpoint
ALTER TABLE "world_facilities" ADD COLUMN "floors" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "world_facilities" ADD CONSTRAINT "world_facilities_floors" CHECK ("floors" between 1 and 100);--> statement-breakpoint
ALTER TABLE "facility_jobs" DROP CONSTRAINT "facility_jobs_kind", ADD CONSTRAINT "facility_jobs_kind" CHECK ("kind" in ('build', 'upgrade', 'repair', 'beacon_repair', 'equipment', 'plot', 'floor'));--> statement-breakpoint
-- 이미 있던 숙소(주거 건물 — 팩 생활 단계 시설은 lodging 하나)는 층 = 레벨로 채운다: 옛 정원(레벨 × 4)을 그대로 남겨 아무도 쉬지 않게(D-591 1, 줄기 residence-3).
UPDATE "world_facilities" SET "floors" = greatest(1, least("level", 100)) WHERE "facility_id" = 'lodging' AND "level" >= 1;
