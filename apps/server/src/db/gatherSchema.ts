// 원자재 오브젝트 상태 표(docs/adr/2026-11-07-gather-objects.md 4절, 기획 D-112 "채집 지점마다 다시 자라는 시각만 있으면 된다") — schema.ts가
// 다시 내보낸다(drizzle-kit 표 정의 진입점은 schema.ts). 쓰기는 월드 쓰기 대기열(src/world/persist/writer.ts) 하나다: 채집 거래(원장)와 같은 커밋.
// 손댄 오브젝트만 줄이 있다(줄이 없으면 가득 = 팩 uses). 오브젝트 자리는 2차맵 지형에서 다시 계산하므로 저장하지 않는다(번호 = 기준 배치 칸 차례).
// 직전 판 앱은 이 표를 모른 채 그대로 돈다(더하기만).
import { sql } from "drizzle-orm";
import { bigint, check, integer, pgTable, primaryKey } from "drizzle-orm/pg-core";
import { planetIdColumn } from "./planetColumns.ts";

/**
 * 오브젝트 하나의 남은 번수와 다시 자라는 시각. regrow_at_ms = 0이면 자라는 중이 아니다(남은 번수만큼 캘 수 있다).
 * regrow_at_ms가 지나면 가득(팩 uses)으로 본다
 */
export const gatherObjectStates = pgTable(
  "gather_object_states",
  {
    planetId: planetIdColumn(),
    mapKey: bigint("map_key", { mode: "number" }).notNull(),
    objectId: integer("object_id").notNull(),
    usesLeft: integer("uses_left").notNull(),
    regrowAtMs: bigint("regrow_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.planetId, table.mapKey, table.objectId] }),
    check("gather_object_states_object", sql`${table.objectId} between 0 and 65535`),
    check("gather_object_states_uses", sql`${table.usesLeft} >= 0`),
    check("gather_object_states_regrow", sql`${table.regrowAtMs} >= 0`),
  ],
);
