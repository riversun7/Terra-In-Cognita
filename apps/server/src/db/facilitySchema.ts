// 건물(시설) 상태·작업 표(docs/adr/2026-11-07-buildings-runtime.md, 기획 49 N50·M14·M15·N54) — schema.ts가 다시 내보낸다
// (drizzle-kit 진입점은 schema.ts). 쓰기는 월드 쓰기 대기열(재료를 빼는 원장 거래와 같은 커밋)이다. 새 표라 직전 판 앱은 모른 채 돈다.
// 건물 행(world_buildings)·유닛·물건에 외래 키를 두지 않는다: 건물은 관리자가 지우고 유닛은 NPC 런타임이 지운다 → 건물 서비스가
// 부팅·분마다 사라진 건물의 시설 줄과 작업 줄을 지운다(작업에 쓴 재료는 돌려주지 않는다 — 다 쓴 것으로 친다).
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * 시설 한 줄(2차맵 건물 하나 = 시설 하나). facility_id = 팩 시설 ID, level = 다 지은 레벨(처음 짓는 동안 0).
 * condition_ppm = 상태(가득 1,000,000, @terra/shared/facilityRuntime), condition_at_ms = 그 값의 시각(분마다 노화·사용 닳음을 더한다).
 * built_by = 지은 사용자(관리자 시험 건물에는 시설 줄이 없다). city_id = 건물이 선 도시(지을 때 정한다, 같은 2차맵의 가장 가까운 도시 —
 * @terra/shared/goodsPlaces cityOfCell, 재료를 꺼내는 도시 창고·창고 시설이 속한 도시, D-516 361·382). 열 더하기만 했다(직전 판 앱은 null로
 * 넣고, 이 판은 null이면 건물 칸에서 다시 정해 적는다)
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
    cityId: bigint("city_id", { mode: "number" }),
    // 세계 씨앗이 세운 시설(질문 1131 나 — 씨앗 숙소 침대는 인구 상한에 더하지 않는다). 열 더하기만(직전 판 앱은 false로 넣는다)
    seeded: boolean("seeded").notNull().default(false),
    // 붙은 면적 모듈 수(건물 채집소, 기획 D-567). 열 더하기만(직전 판 앱은 이 열을 모른 채 넣고 처음 값 0을 받는다)
    plots: smallint("plots").notNull().default(0),
    // 기르는 티어(건물 채집소, 기획 D-569 1761). null = 기본(최고 티어). 열 더하기만(직전 판 앱은 이 열을 모른 채 넣고 null을 받는다)
    gatherTier: smallint("gather_tier"),
    // 빈 2차맵 알박기 정부 건물의 고르기(D-574 — "nation" | "independent:<체제>", ruins/landClaim.ts). null = 알박기 아님·기본 선택. 열 더하기만
    // (직전 판 앱은 이 열을 모른 채 넣고 null을 받는다 — 그 판에서 지은 알박기는 기본 선택)
    claimChoice: text("claim_choice"),
    // 층 수(주거 건물, D-591 1 — 층 올리기 공사로 는다, 정원 = 층 × 설정 칸 residence_capacity_per_floor, facilities/floors.ts). 주거 건물이 아니면 읽지 않는다.
    // 열 더하기만(직전 판 앱은 이 열을 모른 채 넣고 처음 값 1을 받는다). 이미 있던 숙소는 마이그레이션이 레벨로 채운다(옛 정원 레벨 × 4를 그대로)
    floors: smallint("floors").notNull().default(1),
    // 건물별 접근 권한 범위(ADR 2026-11-25-building-access-and-foreign-build.md):
    // null = 시설 분류 기본값(government = nation_citizen, 그 밖 = anyone). 직전 판 앱은 null로 넣는다
    accessScope: text("access_scope"),
  },
  (table) => [
    check("world_facilities_level", sql`${table.level} between 0 and 5`),
    check("world_facilities_plots", sql`${table.plots} between 0 and 100`),
    check("world_facilities_floors", sql`${table.floors} between 1 and 100`),
    check("world_facilities_gather_tier", sql`${table.gatherTier} between 0 and 9`),
    check(
      "world_facilities_access_scope",
      sql`${table.accessScope} is null or ${table.accessScope} in ('anyone', 'city_resident', 'city_house', 'nation_citizen')`,
    ),
    check(
      "world_facilities_claim_choice",
      sql`${table.claimChoice} ~ '^(nation|independent)(:(dictatorship|democracy|capitalism))?$'`,
    ),
    check("world_facilities_condition", sql`${table.conditionPpm} between 0 and 1000000`),
    check("world_facilities_id_format", sql`${table.facilityId} ~ '^[a-z][a-z0-9_]{1,47}$'`),
  ],
);

/**
 * 시간이 걸리는 작업 한 줄(끝나면 지운다): kind = build(처음 짓기) | upgrade(레벨업) | repair(건물 수리) | beacon_repair(비콘 수리) |
 * equipment(장비 수리) | plot(면적 모듈 붙이기, 기획 D-569 1765 — 직전 판 앱은 이 줄을 읽지 않고 건너뛴다) | floor(주거 건물 층 올리기, D-591 1 — 같다). 비콘 짓기는 비콘 줄의 ready_at_ms가 맡는다(territorySchema.ts). 대상 = building_id(시설) | beacon_id(영토 비콘) | holding_id + building_id(공방).
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
      sql`${table.kind} in ('build', 'upgrade', 'repair', 'beacon_repair', 'equipment', 'plot', 'floor')`,
    ),
    check("facility_jobs_done", sql`${table.doneAtMs} >= ${table.startedAtMs}`),
  ],
);

/**
 * 빈 2차맵 알박기로 선 도시(기획 D-572·D-574·D-575, ruins/landClaim.ts). 정부 건물을 다 지어 세운 도시 하나에 한 줄: founder_owner_id = 최초
 * 설립자(새 도시 주인 세력의 소유 주체 — 가문·1인 독재 도시·NPC 세력). 표지는 D-575 보충("가")에 쓴다: 알박기로 선 도시는 독재 나라에
 * 귀속해도 설립자가 지분을 갖고 독립을 선언할 수 있다(D-302 "독재 = 반란으로만"의 예외 — factionIdentity/houseIndependence.ts). 세계 표라
 * 세계 새로 시작 때 비워진다. 직전 판 앱은 이 표를 모른다(읽지도 쓰지도 않음)
 */
export const claimCities = pgTable("claim_cities", {
  cityId: bigint("city_id", { mode: "number" }).primaryKey(),
  founderOwnerId: bigint("founder_owner_id", { mode: "number" }).notNull(),
  /** 고른 것("nation" | "independent:<체제>" — world_facilities.claim_choice와 같은 글자) */
  choice: text("choice").notNull(),
  foundedAtMs: bigint("founded_at_ms", { mode: "number" }).notNull(),
});
