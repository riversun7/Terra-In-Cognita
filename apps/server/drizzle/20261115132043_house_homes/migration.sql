CREATE TABLE "house_homes" (
	"faction_id" bigint PRIMARY KEY,
	"city_id" bigint NOT NULL,
	"set_at_ms" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "house_homes" ADD CONSTRAINT "house_homes_faction_id_factions_id_fkey" FOREIGN KEY ("faction_id") REFERENCES "factions"("id") ON DELETE CASCADE;--> statement-breakpoint
-- D-565: 이 표 전에 창설한 가문은 가문장 사이보그의 내 도시를 소속 도시로 채운다(가문 나라 born_of는 그대로 — 가문장 시민권이라 그 도시의 나라와 같다).
-- set_at_ms = 0이라 가문장이 바로 다시 고를 수 있다. 해산한 가문·가문장 사이보그가 없는 가문은 건너뛴다(가문장이 고르면 그때 생긴다).
INSERT INTO "house_homes" ("faction_id", "city_id", "set_at_ms")
SELECT f."id", c."start_city_id", 0
  FROM "factions" f
  JOIN "house_members" m ON m."faction_id" = f."id" AND m."role" = 'leader'
  JOIN "cyborgs" c ON c."user_id" = m."user_id"
 WHERE f."kind" = 'player' AND f."dissolved_at_ms" IS NULL
ON CONFLICT ("faction_id") DO NOTHING;
