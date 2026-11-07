// 전투 표(docs/adr/2026-10-31-combat-core.md "서버") — schema.ts가 다시 내보낸다(drizzle-kit 표 정의 진입점은 schema.ts).
// 폐허 복원 줄기(docs/adr/2026-11-07-ruins-restoration.md)가 schema.ts 1,000줄 상한 때문에 옮겼다(표 정의는 그대로 — 마이그레이션 없음).
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
} from "drizzle-orm/pg-core";

/**
 * 전투 인스턴스(docs/adr/2026-10-31-combat-core.md "서버"). 시작 자료(init)·입력 기록·결과를 둔다.
 * 판정은 결정적이라 시작 자료 + 입력으로 다시 계산한다(ADR 35 "복구"). 예약(결과 적용 시각)은 ends_at_ms 열이다(S3 ADR 1절).
 */
export const worldBattles = pgTable(
  "world_battles",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    kind: text("kind").notNull(),
    /** running(진행·결과 예약) · ended(결과 적용됨) */
    status: text("status").notNull(),
    seed: bigint("seed", { mode: "number" }).notNull(),
    simVersion: integer("sim_version").notNull(),
    war: boolean("war").notNull().default(false),
    startedAtMs: bigint("started_at_ms", { mode: "number" }).notNull(),
    /** 실시간으로 했을 때 끝나는 시각(빨리감기 결과를 이때 적용, D-189) */
    endsAtMs: bigint("ends_at_ms", { mode: "number" }).notNull(),
    init: jsonb("init").notNull(),
    inputs: jsonb("inputs").notNull().default(sql`'[]'::jsonb`),
    result: jsonb("result"),
  },
  (table) => [
    index("world_battles_status_idx").on(table.status),
    check("world_battles_status", sql`${table.status} in ('running', 'ended')`),
  ],
);

/** 전투 스냅숏(30초마다). 다시 켤 때 가장 가까운 스냅숏 + 그 뒤 입력으로 이어 계산한다(ADR 35) */
export const worldBattleSnapshots = pgTable(
  "world_battle_snapshots",
  {
    battleId: bigint("battle_id", { mode: "number" })
      .notNull()
      .references(() => worldBattles.id, { onDelete: "cascade" }),
    tick: integer("tick").notNull(),
    /** 판정 상태 JSON 그대로(바이트를 지킨다: jsonb는 칸 차례를 바꾼다) */
    state: text("state").notNull(),
  },
  (table) => [primaryKey({ columns: [table.battleId, table.tick] })],
);

/**
 * 전투 결과를 세계에 적용한 기록(전투마다 한 줄, 두 번 적용 없음). 유닛 바뀜·탈취 거래와 같은 쓰기 묶음에 들어간다
 * (docs/adr/2026-10-31-combat-core.md 8절). world_battles.status는 그 뒤에 고치는 캐시다.
 */
export const worldBattleResults = pgTable("world_battle_results", {
  battleId: bigint("battle_id", { mode: "number" })
    .primaryKey()
    .references(() => worldBattles.id),
  appliedAtMs: bigint("applied_at_ms", { mode: "number" }).notNull(),
  result: jsonb("result").notNull(),
});
