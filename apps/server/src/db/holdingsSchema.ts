// 보유 물건 표(아이템 인스턴스, docs/adr/2026-11-03-item-holdings.md 2절) — schema.ts가 다시 내보낸다(drizzle-kit 표 정의 진입점은
// schema.ts). world_owners는 schema.ts에서 오고, 참조는 함수 안에서만 읽어 순환 가져오기가 문제되지 않는다.
// 쓰기는 월드 쓰기 대기열(src/world/persist/writer.ts) 하나다. ID는 서버가 정한다(부팅 때 가장 큰 값 + 1부터, S3 ADR 1절).
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
} from "drizzle-orm/pg-core";
import { worldOwners } from "./schema.ts";

/**
 * 보유 물건 한 칸 — 장비 하나(instance), 신선도 묶음(lot), 쌓이는 소모품(stack). 쌓이는 원자재·가공품은 원장 위치 계정이다(경제 ADR 3절).
 * - location: 원장 계정 위치와 같은 뜻(음수 = 유닛이 든 것 −유닛 ID [임시], 양수 = 창고 위치). slot = 그 유닛 칸 배치의 입은 칸 번호(없으면 듦)
 * - stats: 얻는 때 굴린 스탯 [{stat, value, pm}](pm = 범위 안 자리 ‰). 굴린 값은 만들 때 정해지고 그 밖 칸은 실효 아이템 정의를 읽는다(N49·285)
 * - score_pm: 등급 점수(D-5006, 만든 직후 값). durability·max_durability: 내구도가 있는 장비만(수리로 최대가 준다 D-5031)
 * - aged_ms·aged_at_ms: 신선도 묶음의 숙성 상태(실제 시간 ÷ 보존 배율의 합, aged_at_ms까지). 신선도 = 1 − 숙성 ÷ 유통기한(실효 값)
 * - source: 얻은 길(dev_grant·craft·drop·gather·spoil 등, 감사용)
 * - gene: 유전자 하나의 값(D-516, 유전자 아이템만): 스탯 유전자 = 총합·분포(‰)·속성 12칸, 스킬 유전자 = 스킬 ID, 둘 다 종·남긴 유닛
 *   (src/holdings/genePayload.ts). 유전자는 하나하나 값이 달라 수량 1인 인스턴스다
 */
export const itemHoldings = pgTable(
  "item_holdings",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    ownerId: bigint("owner_id", { mode: "number" })
      .notNull()
      .references(() => worldOwners.id),
    itemId: text("item_id").notNull(),
    location: bigint("location", { mode: "number" }).notNull(),
    slot: smallint("slot"),
    quantity: integer("quantity").notNull().default(1),
    stats: jsonb("stats"),
    scorePm: smallint("score_pm"),
    durability: integer("durability"),
    maxDurability: integer("max_durability"),
    agedMs: bigint("aged_ms", { mode: "number" }),
    agedAtMs: bigint("aged_at_ms", { mode: "number" }),
    createdAtMs: bigint("created_at_ms", { mode: "number" }).notNull(),
    source: text("source").notNull(),
    gene: jsonb("gene"),
  },
  (table) => [
    index("item_holdings_owner_idx").on(table.ownerId),
    index("item_holdings_location_idx").on(table.location),
    check("item_holdings_item_format", sql`${table.itemId} ~ '^[a-z][a-z0-9_]{1,47}$'`),
    check("item_holdings_source_format", sql`${table.source} ~ '^[a-z][a-z0-9_]{1,31}$'`),
    check("item_holdings_location", sql`${table.location} <> 0`),
    check("item_holdings_slot", sql`${table.slot} is null or (${table.slot} >= 0 and ${table.location} < 0)`),
    check("item_holdings_quantity", sql`${table.quantity} >= 1`),
    check("item_holdings_gene", sql`${table.gene} is null or ${table.quantity} = 1`),
    check("item_holdings_score", sql`${table.scorePm} is null or ${table.scorePm} between 0 and 1000`),
    check(
      "item_holdings_durability",
      sql`(${table.durability} is null and ${table.maxDurability} is null) or (${table.durability} between 0 and ${table.maxDurability})`,
    ),
    check("item_holdings_age", sql`(${table.agedMs} is null) = (${table.agedAtMs} is null)`),
  ],
);

/**
 * 유닛에 걸린 효과(소모품 사용, D-501·D-472) — 유닛·효과마다 한 줄, 실제 시간으로 끝난다(끝난 줄은 서버가 지운다).
 * exclusive = 배타 묶음(효과 사전). 유닛 행은 옛 시험 2차맵 정리가 지울 수 있어 외래 키를 두지 않는다(사이보그 unit_id와 같다)
 */
export const unitEffects = pgTable(
  "unit_effects",
  {
    unitId: bigint("unit_id", { mode: "number" }).notNull(),
    effectId: text("effect_id").notNull(),
    value: integer("value").notNull(),
    untilMs: bigint("until_ms", { mode: "number" }).notNull(),
    exclusive: text("exclusive"),
    itemId: text("item_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.unitId, table.effectId] }),
    check("unit_effects_effect_format", sql`${table.effectId} ~ '^[a-z][a-z0-9_]{1,47}$'`),
  ],
);

/**
 * 유닛 쓰기 쿨(D-509: 물약은 전투·비전투 상관없이 유닛마다 30초 d509_potion_cooldown, D-510: 요리 5분 d510_food_cooldown).
 * 유닛·종류(potion·food)마다 한 줄, until_ms가 지나면 서버가 지운다. 외래 키는 unit_effects와 같은 까닭으로 두지 않는다
 */
export const unitCooldowns = pgTable(
  "unit_cooldowns",
  {
    unitId: bigint("unit_id", { mode: "number" }).notNull(),
    kind: text("kind").notNull(),
    untilMs: bigint("until_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.unitId, table.kind] }),
    check("unit_cooldowns_kind", sql`${table.kind} in ('potion', 'food')`),
  ],
);
