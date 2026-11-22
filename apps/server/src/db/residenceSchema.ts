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
    /**
     * 고른 집을 쓸 수 없게 된 시각(질문 2485 가 — 쉬면 옛 길(숙소 배정)로 돌아가고 주인에게 처리할 일 residence_paused를 보인다, 줄기 governance-6). 다시 쓸 수
     * 있으면 null. 직전 판 앱은 읽지 않는다
     */
    pausedSinceMs: bigint("paused_since_ms", { mode: "number" }),
    /**
     * 미리 낸 집세·숙박비가 덮는 끝 시각(D-591 2 — 남의 집 세 들기·고른 숙소, residence/rent.ts). 내 집이거나 아직 내지 않았으면 null. 다른 집을 고르면 새로
     * 내고 남은 몫은 돌려받지 않는다(2486 가). 직전 판 앱은 읽지 않는다
     */
    paidUntilMs: bigint("paid_until_ms", { mode: "number" }),
  },
  (table) => [
    index("unit_residences_owner_idx").on(table.ownerId),
    check("unit_residences_ids", sql`${table.unitId} > 0 and ${table.buildingId} > 0`),
  ],
);

/**
 * 주인이 내놓은 집세(D-591 2 — 남의 주거 건물 세 들기, residence/rent.ts). 건물 하나에 한 줄: 한 기간(설정 칸 residence_rent_period_ms) 집세, 화폐는 숙박비와
 * 같은 서버 시험 화폐 [임시]. 줄이 없으면 세를 놓지 않는다. owner_id = 정할 때의 건물 주인(주인이 바뀌면 그 줄은 쓰지 않는다 — 읽을 때 본다). 외래 키 없음.
 * 세계 표라 시험 세계 새로 시작에서 지운다. 새 표라 직전 판 앱은 모른다
 */
export const residenceRents = pgTable(
  "residence_rents",
  {
    buildingId: bigint("building_id", { mode: "number" }).primaryKey(),
    ownerId: bigint("owner_id", { mode: "number" }).notNull(),
    rent: bigint("rent", { mode: "bigint" }).notNull(),
    setAtMs: bigint("set_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [check("residence_rents_values", sql`${table.buildingId} > 0 and ${table.rent} >= 0`)],
);
