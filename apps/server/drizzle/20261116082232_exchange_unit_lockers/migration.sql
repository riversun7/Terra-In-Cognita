CREATE TABLE "exchange_unit_lockers" (
	"city_id" bigint,
	"unit_id" bigint,
	"steps" integer NOT NULL,
	"updated_at_ms" bigint NOT NULL,
	CONSTRAINT "exchange_unit_lockers_pkey" PRIMARY KEY("city_id","unit_id"),
	CONSTRAINT "exchange_unit_lockers_steps" CHECK ("steps" >= 0)
);
--> statement-breakpoint
-- D-571 1943(질문 2081, 줄기 exchange-3): 거래소 개인 창고가 주인마다 → 유닛마다로 바뀌었다. 옛 주인마다 넓힌 칸(exchange_lockers)을 그 주인의 대표
-- 유닛 창고로 한 번 옮긴다: 사이보그 본체(kind 3) 먼저, 없으면 가장 작은 휴먼(4)·사이보그 유닛(5) ID. 유닛이 하나도 없는 주인의 칸은 옮기지 않는다
-- (옛 표에 남는다). 물건은 옮기지 않는다(원장 계정이 주인마다 그대로 — 쓸 수 있는 자리만 유닛 창고 합으로 센다). 멱등(ON CONFLICT).
-- 옛 표는 그대로 둔다(직전 판 앱이 쓴다) — 다음 배포에서 지운다.
INSERT INTO "exchange_unit_lockers" ("city_id", "unit_id", "steps", "updated_at_ms")
SELECT l."city_id", r."id", l."steps", l."updated_at_ms"
  FROM "exchange_lockers" l
  JOIN LATERAL (
    SELECT u."id"
      FROM "world_units" u
     WHERE u."owner_id" = l."owner_id" AND u."kind" IN (3, 4, 5)
     ORDER BY (u."kind" = 3) DESC, u."id"
     LIMIT 1
  ) r ON true
 WHERE l."steps" > 0
ON CONFLICT ("city_id", "unit_id") DO NOTHING;
