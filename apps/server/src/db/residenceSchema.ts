// 사는 곳(거주지) 표(줄기 residence — 사용자 답 D-585 1) — schema.ts가 다시 내보낸다(그 파일 줄 수 때문에 따로 둔다). docs/adr/2026-11-15-business-ledger.md
// "바뀜 (residence …)". 세계 표라 시험 세계 새로 시작(reset-world)에서 지운다(남길 표 목록에 넣지 않는다). 더하기만 해서 직전 판 앱은 그대로 돈다(이 표를 모른다).
import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable } from "drizzle-orm/pg-core";

/**
 * 유닛 하나가 고른 사는 곳(한 유닛에 한 줄 — 사는 곳은 하나). apps/server/src/residence/book.ts.
 * - unit_id: 고른 유닛(사이보그 본체 = 플레이어 자신). owner_id: 고를 때의 유닛 주인(소유 주체 — 주인이 바뀌면 고른 것은 쉰다)
 * - building_id: 고른 주거 건물. 외래 키는 두지 않는다(건물·유닛이 사라지면 고른 것이 쉬고 옛 길로 돌아간다 — 읽을 때 본다)
 */
export const unitResidences = pgTable(
  "unit_residences",
  {
    unitId: bigint("unit_id", { mode: "number" }).primaryKey(),
    ownerId: bigint("owner_id", { mode: "number" }).notNull(),
    buildingId: bigint("building_id", { mode: "number" }).notNull(),
    chosenAtMs: bigint("chosen_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    index("unit_residences_owner_idx").on(table.ownerId),
    check("unit_residences_ids", sql`${table.unitId} > 0 and ${table.buildingId} > 0`),
  ],
);
