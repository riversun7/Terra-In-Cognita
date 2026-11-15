CREATE TABLE "house_units" (
	"unit_id" bigint PRIMARY KEY,
	"faction_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"set_at_ms" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "house_units_faction_idx" ON "house_units" ("faction_id");--> statement-breakpoint
CREATE INDEX "house_units_user_idx" ON "house_units" ("user_id");--> statement-breakpoint
ALTER TABLE "house_units" ADD CONSTRAINT "house_units_faction_id_factions_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "factions"("id") ON DELETE CASCADE;--> statement-breakpoint
-- D-569 1744: 유닛 단위 가문. 이 표 전에는 가문 소속이 사람 단위였다(그 사람 유닛이 모두 그 가문 유닛) — 가문원이 가진 유닛(사이보그 본체 빼고)을
-- 그 가문 줄로 채워 지금 보이는 소속을 그대로 잇는다. 무소속 사람의 유닛은 줄이 없다(무소속). 멱등(ON CONFLICT). 직전 판 앱은 이 표를 모른 채 돈다.
INSERT INTO "house_units" ("unit_id", "faction_id", "user_id", "set_at_ms")
SELECT u."id", m."faction_id", m."user_id", 0
  FROM "world_units" u
  JOIN "world_owners" o ON o."id" = u."owner_id"
  JOIN "house_members" m ON m."user_id" = o."user_id"
  JOIN "factions" f ON f."id" = m."faction_id" AND f."kind" = 'player' AND f."dissolved_at_ms" IS NULL
 WHERE NOT EXISTS (SELECT 1 FROM "cyborgs" c WHERE c."unit_id" = u."id")
ON CONFLICT ("unit_id") DO NOTHING;
