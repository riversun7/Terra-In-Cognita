ALTER TABLE "world_facilities" ADD COLUMN "seeded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- 이미 선 세계: 세계 씨앗은 한 도시의 기본 시설을 같은 시각에 짓는 사람 없이(built_by null) 세운다 → 그 도시 행정 건물과 같은 시각에 선 시설을 씨앗으로 적는다(질문 1131 나)
UPDATE "world_facilities" AS f SET "seeded" = true
WHERE f."built_by" IS NULL AND f."city_id" IS NOT NULL AND EXISTS (
  SELECT 1 FROM "world_facilities" AS g
  WHERE g."city_id" = f."city_id" AND g."facility_id" = 'government_hall' AND g."built_by" IS NULL
    AND g."built_at_ms" = f."built_at_ms"
);
