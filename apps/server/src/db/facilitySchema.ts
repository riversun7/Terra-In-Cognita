// 건물(시설) 상태·작업 표(docs/adr/2026-11-07-buildings-runtime.md, 기획 49 N50·M14·M15·N54) — schema.ts가 다시 내보낸다
// (drizzle-kit 진입점은 schema.ts). 쓰기는 월드 쓰기 대기열(재료를 빼는 원장 거래와 같은 커밋)이다. 새 표라 직전 판 앱은 모른 채 돈다.
// 건물 행(world_buildings)·유닛·물건에 외래 키를 두지 않는다: 건물은 관리자가 지우고 유닛은 NPC 런타임이 지운다 → 건물 서비스가
// 부팅·분마다 사라진 건물의 시설 줄과 작업 줄을 지운다(작업에 쓴 재료는 돌려주지 않는다 — 다 쓴 것으로 친다).
import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgTable, smallint, text, uuid } from "drizzle-orm/pg-core";

/**
 * 시설 한 줄(2차맵 건물 하나 = 시설 하나). facility_id = 팩 시설 ID, level = 다 지은 레벨(처음 짓는 동안 0).
 * condition_ppm = 상태(가득 1,000,000, @terra/shared/facilityRuntime), condition_at_ms = 그 값의 시각(분마다 노화·사용 닳음을 더한다).
 * built_by = 지은 사용자(관리자 시험 건물에는 시설 줄이 없다)
 */
export const worldFacilities = pgTable(
  "world_facilities",
  {
    buildingId: bigint("building_id", { mode: "number" }).primaryKey(),
    facilityId: text("facility_id").notNull(),
    level: smallint("level").notNull(),
    conditionPpm: integer("condition_ppm").notNull(),
    conditionAtMs: bigint("condition_at_ms", { mode: "number" }).notNull(),
    builtAtMs: bigint("built_at_ms", { mode: "number" }).notNull(),
    builtBy: uuid("built_by"),
  },
  (table) => [
    check("world_facilities_level", sql`${table.level} between 0 and 5`),
    check("world_facilities_condition", sql`${table.conditionPpm} between 0 and 1000000`),
    check("world_facilities_id_format", sql`${table.facilityId} ~ '^[a-z][a-z0-9_]{1,47}$'`),
  ],
);

/**
 * 시간이 걸리는 작업 한 줄(끝나면 지운다): kind = build(처음 짓기) | upgrade(레벨업) | repair(건물 수리) | beacon_repair(비콘 수리) |
 * equipment(장비 수리). 비콘 짓기는 비콘 줄의 ready_at_ms가 맡는다(territorySchema.ts). 대상 = building_id(시설) | beacon_id(영토 비콘) | holding_id + building_id(공방).
 * target_level = 짓기·레벨업의 올라갈 레벨, restore_ppm = 수리로 더할 상태, unit_ids = 일하는 유닛(건축가·장인), materials = 시작할 때 뺀 재료
 * [{item, qty}](기록·화면용). owner_id = 명령한 소유 주체
 */
export const facilityJobs = pgTable(
  "facility_jobs",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    kind: text("kind").notNull(),
    ownerId: bigint("owner_id", { mode: "number" }).notNull(),
    buildingId: bigint("building_id", { mode: "number" }),
    beaconId: bigint("beacon_id", { mode: "number" }),
    holdingId: bigint("holding_id", { mode: "number" }),
    targetLevel: smallint("target_level"),
    restorePpm: integer("restore_ppm"),
    unitIds: bigint("unit_ids", { mode: "number" }).array().notNull(),
    materials: jsonb("materials").notNull(),
    startedAtMs: bigint("started_at_ms", { mode: "number" }).notNull(),
    doneAtMs: bigint("done_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    index("facility_jobs_building_idx").on(table.buildingId),
    check(
      "facility_jobs_kind",
      sql`${table.kind} in ('build', 'upgrade', 'repair', 'beacon_repair', 'equipment')`,
    ),
    check("facility_jobs_done", sql`${table.doneAtMs} >= ${table.startedAtMs}`),
  ],
);
