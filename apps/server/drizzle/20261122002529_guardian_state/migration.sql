ALTER TABLE "world_units" ADD COLUMN "guardian" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- 유닛 종류는 넷으로 고정(사용자 결정 2026-11-22, 기획 D-589): 옛 수호신 종류(6)를 휴먼(4) + 수호신 상태로 바꾼다. 도시·버프는 temple_guardians 행 그대로.
-- 직전 판 앱이 배포 사이에 다시 쓴 6은 새 앱 부팅 읽기가 같은 꼴로 읽는다(src/world/persist/load.ts)
UPDATE "world_units" SET "kind" = 4, "guardian" = true WHERE "kind" = 6;
