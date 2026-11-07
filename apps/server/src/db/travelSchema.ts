// 2차맵 사이 이동 표(docs/adr/2026-11-07-play-flow.md "WP9 2차맵 사이 이동", 기획 D-197·질문 571 가) — schema.ts가 다시 내보낸다
// (drizzle-kit 표 정의 진입점은 schema.ts). 쓰기는 월드 쓰기 대기열(src/world/persist/writer.ts) 하나다: 2차맵을 넘을 때 유닛 행(새 2차맵 키)과
// 이 행(다음 구간)이 같은 커밋에 든다. 직전 판 앱은 이 표를 모른 채 그대로 돈다(더하기만 — 유닛은 걷던 경로 끝에 선다).
// 유닛·소유 주체에 외래 키를 두지 않는다(노동 계약과 같은 까닭: 유닛은 NPC 런타임이 지운다 → 부팅·확인 때 유닛이 없으면 줄을 지운다).
// 끝난 길(도착·멈춤)은 지운다(기록으로 남기지 않는다).
import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { planetIdColumn } from "./planetColumns.ts";

/**
 * 가는 중인 길 한 줄(유닛당 하나). route = 지나는 2차맵 키(출발 포함, 마지막 = 목적 2차맵), leg = 지금 있는 2차맵의 route 차례,
 * target = 마지막 2차맵 안 목표 배치 칸. arrive_at_ms = 보낼 때 잰 도착 예상(보기 값). 2차맵 안 걸음(경로·출발 시각)은 유닛 행에 있다
 */
export const worldTravels = pgTable(
  "world_travels",
  {
    unitId: bigint("unit_id", { mode: "number" }).primaryKey(),
    ownerId: bigint("owner_id", { mode: "number" }).notNull(),
    planetId: planetIdColumn(),
    kind: text("kind").notNull(),
    route: bigint("route", { mode: "number" }).array().notNull(),
    leg: integer("leg").notNull(),
    targetX: integer("target_x").notNull(),
    targetY: integer("target_y").notNull(),
    startedAtMs: bigint("started_at_ms", { mode: "number" }).notNull(),
    arriveAtMs: bigint("arrive_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    index("world_travels_owner_idx").on(table.ownerId),
    check("world_travels_kind", sql`${table.kind} in ('move', 'scout')`),
    check(
      "world_travels_leg",
      sql`cardinality(${table.route}) >= 1 and ${table.leg} >= 0 and ${table.leg} < cardinality(${table.route})`,
    ),
    check(
      "world_travels_target",
      sql`${table.targetX} between 0 and 255 and ${table.targetY} between 0 and 255`,
    ),
  ],
);
