// 2차맵 사이 이동 표(docs/adr/2026-11-07-play-flow.md "WP9 2차맵 사이 이동", 기획 D-197·질문 571 가) — schema.ts가 다시 내보낸다
// (drizzle-kit 표 정의 진입점은 schema.ts). 쓰기는 월드 쓰기 대기열(src/world/persist/writer.ts) 하나다: 2차맵을 넘을 때 유닛 행(새 2차맵 키)과
// 이 행(다음 구간)이 같은 커밋에 든다. 직전 판 앱은 이 표를 모른 채 그대로 돈다(더하기만 — 유닛은 걷던 경로 끝에 선다).
// 유닛·소유 주체에 외래 키를 두지 않는다(노동 계약과 같은 까닭: 유닛은 NPC 런타임이 지운다 → 부팅·확인 때 유닛이 없으면 줄을 지운다).
// 끝난 길(도착·멈춤)은 지운다(기록으로 남기지 않는다).
// WP11 이동 2(같은 ADR "WP11"): 칸 더하기만(모두 null 허용 — 직전 판 앱은 칸을 모른 채 돈다). user_id = 보낸 사용자(탐사 기록),
// origin_* = 출발 자리(정찰이 돌아올 곳, 질문 591 나), scouted_map_key = 정찰한 2차맵(값이 있으면 돌아오는 중 — route·target은 돌아오는 길),
// hidden_until_ms = 띄우지 않은 2차맵을 건너뛰는 중이면 나타나는 시각(질문 593 나 — 그동안 유닛 행은 사라진 2차맵의 변 끝에 그대로 있다).
import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, smallint, text } from "drizzle-orm/pg-core";
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
    userId: text("user_id"),
    originMapKey: bigint("origin_map_key", { mode: "number" }),
    originX: integer("origin_x"),
    originY: integer("origin_y"),
    scoutedMapKey: bigint("scouted_map_key", { mode: "number" }),
    hiddenUntilMs: bigint("hidden_until_ms", { mode: "number" }),
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
    check(
      "world_travels_origin",
      sql`(${table.originX} is null or ${table.originX} between 0 and 255) and (${table.originY} is null or ${table.originY} between 0 and 255)`,
    ),
  ],
);

/**
 * 유닛 AI 작전(기획 D-5039·D-5040, encounter-4 — 질문 2021·2023 답: 플레이어 유닛의 조우 판단 입력, @terra/shared/aiTactics). 유닛당 한 줄,
 * 없으면 기본 프리셋(균형 — 질문 2132). preset = 마지막으로 고른 프리셋, 슬라이더 ①~⑥ 0~10, ⑦ 퇴각 기준 = 파티 HP %(0~100), target = 목표 우선순위.
 * world_travels와 같은 까닭으로 유닛에 외래 키를 두지 않는다(유닛이 사라진 줄은 읽을 때 무시 — 유닛 화면은 유닛 행과 잇고, 조우는 있는 유닛만 묻는다).
 * 쓰기는 월드 쓰기 대기열 하나(src/tactics/store.ts). 직전 판 앱은 이 표를 모른 채 그대로 돈다(더하기만)
 */
export const unitTactics = pgTable(
  "unit_tactics",
  {
    unitId: bigint("unit_id", { mode: "number" }).primaryKey(),
    preset: text("preset").notNull(),
    engage: smallint("engage").notNull(),
    pursue: smallint("pursue").notNull(),
    cover: smallint("cover").notNull(),
    escort: smallint("escort").notNull(),
    saveSkill: smallint("save_skill").notNull(),
    spread: smallint("spread").notNull(),
    retreatPct: smallint("retreat_pct").notNull(),
    target: text("target").notNull(),
    updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    check("unit_tactics_preset", sql`${table.preset} in ('aggressive', 'balanced', 'defensive', 'hold')`),
    check("unit_tactics_target", sql`${table.target} in ('nearest', 'weakest', 'threat')`),
    check(
      "unit_tactics_sliders",
      sql`${table.engage} between 0 and 10 and ${table.pursue} between 0 and 10 and ${table.cover} between 0 and 10 and ${table.escort} between 0 and 10 and ${table.saveSkill} between 0 and 10 and ${table.spread} between 0 and 10`,
    ),
    check("unit_tactics_retreat", sql`${table.retreatPct} between 0 and 100`),
  ],
);

/**
 * 유닛 생활 규칙(사용자 결정 2026-11-26 — docs/adr/2026-11-26-unit-life-rules.md, @terra/shared/unitLife): 일하다 피로가 rest_at에 닿으면 쉬러 가고,
 * 쉬다 resume_at까지 풀리면 다시 일한다. 유닛당 한 줄, 없으면 성향 기본값(life/store.ts). unit_tactics와 같은 까닭으로 유닛에 외래 키를 두지 않는다.
 * 쓰기는 월드 쓰기 대기열 하나. 직전 판 앱은 이 표를 모른 채 그대로 돈다(더하기만)
 */
export const unitLifeRules = pgTable(
  "unit_life_rules",
  {
    unitId: bigint("unit_id", { mode: "number" }).primaryKey(),
    restAt: smallint("rest_at").notNull(),
    resumeAt: smallint("resume_at").notNull(),
    updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    check(
      "unit_life_rules_range",
      sql`${table.restAt} between 1 and 120 and ${table.resumeAt} >= 0 and ${table.resumeAt} < ${table.restAt}`,
    ),
  ],
);

/**
 * 유닛 경험치(유닛 성장 — docs/adr/2026-11-26-unit-growth.md, src/growth/store.ts): 휴먼·사이보그 유닛의 지금 레벨 구간 안 경험치. 레벨은 그 유닛
 * 표(world_humans.level·cyborg_units.level)에 있다. 유닛당 한 줄, 없으면 0. 유닛에 외래 키를 두지 않는다(유닛이 사라진 줄은 읽을 때 무시).
 * 직전 판 앱은 이 표를 모른 채 그대로 돈다(더하기만)
 */
export const unitExp = pgTable(
  "unit_exp",
  {
    unitId: bigint("unit_id", { mode: "number" }).primaryKey(),
    exp: integer("exp").notNull(),
    updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [check("unit_exp_nonnegative", sql`${table.exp} >= 0`)],
);

/**
 * 그 밖 유닛의 저장된 스탯·레벨(docs/adr/2026-11-27-all-units-have-stats.md, src/growth/store.ts): 휴먼(world_humans)·사이보그 유닛
 * (cyborg_units)·사이보그 본체(cyborgs)가 아닌 유닛(NPC 지도자·봇 등)의 1차 스탯 6칸(STR·DEX·AGI·VIT·INT·WIS)·속성값·레벨. 처음 읽힐 때 구인 카드
 * 규칙으로 굴려 쓴다. 유닛당 한 줄, 유닛에 외래 키를 두지 않는다(유닛이 사라지면 서버가 지운다). 직전 판 앱은 이 표를 모른 채 그대로 돈다(더하기만)
 */
export const unitStats = pgTable(
  "unit_stats",
  {
    unitId: bigint("unit_id", { mode: "number" }).primaryKey(),
    level: integer("level").notNull(),
    stats: smallint("stats").array().notNull(),
    elements: smallint("elements").array(),
    updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    check("unit_stats_six", sql`cardinality(${table.stats}) = 6`),
    check("unit_stats_level", sql`${table.level} >= 1`),
  ],
);
