// 정원사 표(docs/adr/2026-11-01-gardener-r5b.md 5절) — schema.ts가 다시 내보낸다(drizzle-kit 표 정의 진입점은 schema.ts)
import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { planetIdColumn } from "./planetColumns.ts";

/**
 * 1차맵 칸 오염(docs/adr/2026-11-01-gardener-r5b.md 1절, D-115·D-460 200): 행성·칸 키(면 레벨 F9 = 2차맵 하나)마다 정수.
 * 값이 있는 칸만 둔다(0이 되면 지운다). 하루마다 NPC 사회 런타임이 바뀐 칸만 쓴다
 */
export const planetPollution = pgTable(
  "planet_pollution",
  {
    planetId: planetIdColumn(),
    cellKey: bigint("cell_key", { mode: "number" }).notNull(),
    value: integer("value").notNull(),
    updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.planetId, table.cellKey] }),
    check("planet_pollution_value", sql`${table.value} between 1 and 100000`),
    check("planet_pollution_planet_id_format", sql`${table.planetId} ~ '^[a-z][a-z0-9_]{1,47}$'`),
  ],
);

/**
 * 정원사 도시 웨이브(docs/adr/2026-11-01-gardener-r5b.md 2·5절, D-188·D-192·D-196·D-230): 예고(생성)부터 결과까지 한 줄.
 * state = marching(진군, 도착 예약) | fighting(전투 서비스 battle_id) | won | repelled | disbanded. 끝난 줄은 기록으로 남긴다.
 * 도시가 폐허가 되면 도시 행이 지워지므로 city_id에 외래 키를 두지 않는다
 */
export const gardenerWaves = pgTable(
  "gardener_waves",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    planetId: planetIdColumn(),
    cityId: bigint("city_id", { mode: "number" }).notNull(),
    cellKey: bigint("cell_key", { mode: "number" }).notNull(),
    /** 생길 때 그 도시 주인 세력(행 ID) */
    factionId: bigint("faction_id", { mode: "number" }),
    strength: integer("strength").notNull(),
    physical: integer("physical").notNull(),
    createdAtMs: bigint("created_at_ms", { mode: "number" }).notNull(),
    arriveAtMs: bigint("arrive_at_ms", { mode: "number" }).notNull(),
    state: text("state").notNull(),
    battleId: bigint("battle_id", { mode: "number" }),
    resolvedAtMs: bigint("resolved_at_ms", { mode: "number" }),
  },
  (table) => [
    index("gardener_waves_state_idx").on(table.state),
    index("gardener_waves_city_idx").on(table.cityId),
    check(
      "gardener_waves_state",
      sql`${table.state} in ('marching', 'fighting', 'won', 'repelled', 'disbanded')`,
    ),
  ],
);
