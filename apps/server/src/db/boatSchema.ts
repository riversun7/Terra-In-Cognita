// 배 만들기 작업 표(docs/adr/2026-11-13-boats.md "바뀜 (2026-11-14, B2)", 기획 D-541 1271 나) — schema.ts가 다시 내보낸다(drizzle-kit 진입점은 schema.ts).
// 배 하나 = 줄 하나. 부두에서 [배 만들기]를 누르면 재료를 빼고 줄을 넣고, 끝 시각(done_at_ms)에 배가 부두 옆 물에 뜨면 줄을 지운다.
// id = 다 되면 쓸 배 유닛 ID(만들기 때 미리 받는다 — 다시 켜도 같은 ID). 쓰기는 월드 쓰기 대기열(src/world/persist/writer.ts) 하나다.
// 부두·소유 주체에 외래 키를 두지 않는다(부두가 부서지거나 치워지면 배 서비스가 줄을 지운다 — 노동 계약·이동 줄과 같은 까닭).
// 직전 판 앱은 이 표를 모른 채 그대로 돈다(더하기만).
// 배 체계 개편(기획 D-545·D-547·D-548, docs/adr/2026-11-15-shipyard-harbor.md): 작업 줄에 종류(만들기·수리)·배 종류·수리 배·수리 끝 내구도 열을 더하고(옛 줄 = 만들기),
// 배마다 상태(boat_states — 종류·내구도·집 정박장·정박료·교역 부두 머묾), 배 시설마다 주인 설정(boat_facilities — 받기 범위·요금·조선소 모듈),
// 옛 배·부두 지우기 표지(boat_resets — 기획 D-547 1499 "배·부두만 지움", 행성마다 한 번)를 더한다. 모두 더하기만 해서 직전 판 앱은 그대로 돈다.
import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { planetIdColumn } from "./planetColumns.ts";

/** 배 만들기 작업 한 줄(materials = 뺀 재료 [{item, qty}] — 기록·화면용) */
export const boatJobs = pgTable(
  "boat_jobs",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    ownerId: bigint("owner_id", { mode: "number" }).notNull(),
    buildingId: bigint("building_id", { mode: "number" }).notNull(),
    planetId: planetIdColumn(),
    materials: jsonb("materials").notNull(),
    startedAtMs: bigint("started_at_ms", { mode: "number" }).notNull(),
    doneAtMs: bigint("done_at_ms", { mode: "number" }).notNull(),
    /** build = 배 만들기, repair = 배 수리(D-547 1494). 옛 줄은 build */
    kind: text("kind").notNull().default("build"),
    /** 만드는 배 종류(조선소 boats 칸 ID). 옛 줄은 null */
    typeId: text("type_id"),
    /** 수리하는 배(유닛 ID). 만들기는 null */
    boatId: bigint("boat_id", { mode: "number" }),
  },
  (table) => [
    index("boat_jobs_building_idx").on(table.buildingId),
    check("boat_jobs_time", sql`${table.doneAtMs} >= ${table.startedAtMs}`),
    check("boat_jobs_kind", sql`${table.kind} in ('build', 'repair')`),
  ],
);

/**
 * 배 하나의 상태(배 유닛 ID = 키). 유닛 줄(world_units)은 2차맵이 쓰고, 이 줄은 배 서비스가 쓴다(외래 키 없음 — 배가 지워지면 서비스가 줄을 지운다).
 * 내구도는 hull_at_ms 때의 값(ppm)이고 그 뒤 닳음은 서비스가 정시에 셈해 적는다. 집 정박장(home_id)은 정박장 건물 ID(없으면 집 없음 — 더 빨리 닳는다).
 * 정박료는 남의 정박장에 든 배만 fee_paid_to_ms까지 냈다(그 뒤 하루마다 낸다, 못 낸 날 = arrears). 교역 부두는 trade_id·trade_until_ms(산 시간 끝)·
 * trade_charged_to_ms(초과 요금을 낸 시각)
 */
export const boatStates = pgTable(
  "boat_states",
  {
    boatId: bigint("boat_id", { mode: "number" }).primaryKey(),
    planetId: planetIdColumn(),
    typeId: text("type_id").notNull(),
    hullPpm: integer("hull_ppm").notNull(),
    hullAtMs: bigint("hull_at_ms", { mode: "number" }).notNull(),
    homeId: bigint("home_id", { mode: "number" }),
    feePaidToMs: bigint("fee_paid_to_ms", { mode: "number" }),
    arrears: integer("arrears").notNull().default(0),
    tradeId: bigint("trade_id", { mode: "number" }),
    tradeUntilMs: bigint("trade_until_ms", { mode: "number" }),
    tradeChargedToMs: bigint("trade_charged_to_ms", { mode: "number" }),
  },
  (table) => [
    index("boat_states_home_idx").on(table.homeId),
    check("boat_states_hull", sql`${table.hullPpm} between 0 and 1000000`),
    check("boat_states_arrears", sql`${table.arrears} >= 0`),
  ],
);

/**
 * 배 시설(조선소·정박장·교역 부두) 주인 설정(건물 ID = 키). 줄이 없으면 처음 값(받기 범위 nation, 요금 = 설정 칸 처음 값, 모듈 없음).
 * fee = 정박장 하루 정박료 / 교역 부두 한 시간 요금(화폐 최소 단위). module = 조선소 모듈(docks·build·repair, D-547 1483)
 */
export const boatFacilities = pgTable(
  "boat_facilities",
  {
    buildingId: bigint("building_id", { mode: "number" }).primaryKey(),
    planetId: planetIdColumn(),
    access: text("access").notNull(),
    fee: bigint("fee", { mode: "number" }).notNull(),
    module: text("module"),
  },
  (table) => [
    check("boat_facilities_access", sql`${table.access} in ('owner', 'nation', 'peace')`),
    check(
      "boat_facilities_module",
      sql`${table.module} is null or ${table.module} in ('docks', 'build', 'repair')`,
    ),
    check("boat_facilities_fee", sql`${table.fee} >= 0`),
  ],
);

/** 옛 배·부두 지우기 표지(D-547 1499, 행성마다 한 줄 — 있으면 다시 지우지 않는다). report = 지운 배·부두·작업·내린 승객 */
export const boatResets = pgTable("boat_resets", {
  planetId: text("planet_id").primaryKey(),
  appliedAtMs: bigint("applied_at_ms", { mode: "number" }).notNull(),
  report: jsonb("report").notNull(),
});
