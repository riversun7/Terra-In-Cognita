// 휴먼·구인 카드 표(docs/adr/2026-11-01-npc-brain-r5.md 7절, D-469 docs/adr/2026-10-31-faction-society-core.md "바뀜 (D-469 구인 카드)") —
// schema.ts가 다시 내보낸다(drizzle-kit 표 정의 진입점은 schema.ts). world_units·world_cities·world_owners는 schema.ts에서 오고,
// 참조는 함수 안에서만 읽어 순환 가져오기가 문제되지 않는다. 쓰기는 월드 쓰기 대기열(src/world/persist/writer.ts) 하나다.
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
} from "drizzle-orm/pg-core";
import { worldCities, worldOwners, worldUnits } from "./schema.ts";

/**
 * 휴먼(docs/adr/2026-11-01-npc-brain-r5.md 7절): 유닛 하나 = 휴먼 하나. NPC 나라의 휴먼(시험 봇) + 유저가 구인 카드로 고용한 휴먼
 * (D-469, 유닛 종류 4). 사는 도시·만족도(D-219, 밀리점)·태어난 시각(구인 = 고용한 때)·수명(T4)·환생 수, 구인 카드로 온 휴먼의
 * 레벨·스탯·속성. 유닛이 지워지면 함께 지워진다. NPC 사회 런타임은 시험 봇 휴먼만 돌린다(유저 휴먼의 수명·만족도는 아직 안 돈다)
 */
export const worldHumans = pgTable(
  "world_humans",
  {
    unitId: bigint("unit_id", { mode: "number" })
      .primaryKey()
      .references((): AnyPgColumn => worldUnits.id, { onDelete: "cascade" }),
    /** 사는 도시. null = 노숙(도시를 모두 잃은 떠도는 세력의 휴먼, D-294·D-296·D-464 217) */
    cityId: bigint("city_id", { mode: "number" }).references(() => worldCities.id),
    satisfactionMilli: integer("satisfaction_milli").notNull(),
    bornAtMs: bigint("born_at_ms", { mode: "number" }).notNull(),
    lifespanMs: bigint("lifespan_ms", { mode: "number" }).notNull(),
    rebirths: smallint("rebirths").notNull().default(0),
    /** 레벨(구인 휴먼은 1에서 시작, 49 N45). 처음부터 있던 휴먼(시험 봇)도 1 */
    level: smallint("level").notNull().default(1),
    /** 구인 카드의 1차 스탯 STR·DEX·AGI·VIT·INT·WIS(사이보그 스탯 배열과 같은 차례). null = 처음부터 있던 휴먼(구인 전) */
    stats: smallint("stats").array(),
    /** 구인 카드의 속성값 12칸(@terra/shared ELEMENT_IDS 차례, 칸마다 0~10). null = 처음부터 있던 휴먼 */
    elements: smallint("elements").array(),
    /**
     * 성장 K(‰, 1차 스탯 6칸 — 스탯 배열과 같은 차례). 신전 환생 어드밴티지(D-520)로 처음 생긴다. null = K 없음(성장 없음, 저장된 스탯 그대로).
     * 쓰기 대기열 humans 행은 이 칸을 쓰지 않는다(humanGrowth만 — 다른 쓰기가 덮지 않게)
     */
    kPm: smallint("k_pm").array(),
  },
  (table) => [
    index("world_humans_city_idx").on(table.cityId),
    check("world_humans_satisfaction", sql`${table.satisfactionMilli} between 0 and 100000`),
    check("world_humans_level", sql`${table.level} >= 1`),
    check("world_humans_stats", sql`${table.stats} is null or cardinality(${table.stats}) = 6`),
    check("world_humans_k_pm", sql`${table.kPm} is null or cardinality(${table.kPm}) = 6`),
    check(
      "world_humans_elements",
      sql`${table.elements} is null or (cardinality(${table.elements}) = 12 and 0 <= all(${table.elements}) and 10 >= all(${table.elements}))`,
    ),
  ],
);

/**
 * 구인 카드 산 칸(D-469, 49 N45): 고용 주체(소유 주체 = 유저 또는 NPC 세력) × 도시마다 한 줄, 지금 창과 그 창에 산 칸 비트.
 * 카드 묶음은 (세계 시드, 도시, 고용 주체, 창)으로 정해져 저장하지 않는다(@terra/sim recruitCards). 창이 지나면 산 칸은 0으로 본다
 * (쌓이지 않음). 도시가 지워지면 함께 지운다
 */
export const recruitDraws = pgTable(
  "recruit_draws",
  {
    ownerId: bigint("owner_id", { mode: "number" })
      .notNull()
      .references(() => worldOwners.id),
    cityId: bigint("city_id", { mode: "number" })
      .notNull()
      .references(() => worldCities.id, { onDelete: "cascade" }),
    /** 갱신 창 = ⌊시각 ÷ 갱신 주기⌋ */
    windowIndex: bigint("window_index", { mode: "number" }).notNull(),
    /** 그 창에 산 칸(자리 k = 1 << k) */
    taken: integer("taken").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.cityId] }),
    check("recruit_draws_taken", sql`${table.taken} >= 0`),
  ],
);
