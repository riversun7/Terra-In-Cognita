// 영토 비콘 표(docs/adr/2026-11-03-territory-layer.md 3절) — schema.ts가 다시 내보낸다(drizzle-kit 표 정의 진입점은 schema.ts)
import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { planetIdColumn } from "./planetColumns.ts";

/**
 * 영토 비콘(D-485·D-486, 49 N42·N51): 1차맵 칸(면 레벨 F 칸 키) 하나에 하나(세력과 상관없이). 꼭짓점이라 영토 도형(볼록 껍질)을
 * 다시 셈하게 한다. city_id = 개수·거리를 센 기준 도시(도시가 폐허가 되면 행이 지워지므로 외래 키를 두지 않는다 — 정원사 웨이브와 같다).
 * 세력 행은 지우지 않으므로(사라진 시각만 적는다) faction_id에도 외래 키를 두지 않는다(schema.ts를 가져오면 순환이 생긴다).
 * durability = 놓을 때 N51 내구도(유지 = 내구도 D-171, 닳는 규칙은 아직 없다). built_by = 놓은 사용자(NPC·개발 시험은 null)
 */
export const territoryBeacons = pgTable(
  "territory_beacons",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    planetId: planetIdColumn(),
    cellKey: bigint("cell_key", { mode: "number" }).notNull(),
    factionId: bigint("faction_id", { mode: "number" }).notNull(),
    cityId: bigint("city_id", { mode: "number" }),
    durability: integer("durability").notNull(),
    builtAtMs: bigint("built_at_ms", { mode: "number" }).notNull(),
    builtBy: uuid("built_by"),
  },
  (table) => [
    uniqueIndex("territory_beacons_cell_idx").on(table.planetId, table.cellKey),
    index("territory_beacons_faction_idx").on(table.factionId),
    check("territory_beacons_durability", sql`${table.durability} >= 0`),
    check("territory_beacons_planet_id_format", sql`${table.planetId} ~ '^[a-z][a-z0-9_]{1,47}$'`),
  ],
);
