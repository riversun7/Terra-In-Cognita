// 배후지 칸 재고 표(docs/adr/2026-11-11-city-catchment.md "바뀜 (2026-11-12, 칸 재고 저장)", 질문 1061 나) — schema.ts가 다시 내보낸다
import { sql } from "drizzle-orm";
import { bigint, check, integer, pgTable, primaryKey } from "drizzle-orm/pg-core";
import { planetIdColumn } from "./planetColumns.ts";

/**
 * 1차맵 칸(면 레벨 F9 = 2차맵 하나)의 배후지 원자재 재고(@terra/shared/catchment stepCatchmentSupply — 원자재 여섯, CATCHMENT_MATERIALS 차례).
 * 상한(= 처음 값)과 다른 칸만 둔다(상한으로 돌아오면 지운다 — 없는 칸은 상한으로 친다). NPC 사회 런타임이 하루 끝 뒤 바뀐 칸만 쓴다
 * (npc/catchmentStore.ts). 세계 표라 세계 새로 시작이 비운다
 */
export const catchmentCellStock = pgTable(
  "catchment_cell_stock",
  {
    planetId: planetIdColumn(),
    cellKey: bigint("cell_key", { mode: "number" }).notNull(),
    ore: integer("ore").notNull(),
    wood: integer("wood").notNull(),
    herb: integer("herb").notNull(),
    crop: integer("crop").notNull(),
    livestock: integer("livestock").notNull(),
    fish: integer("fish").notNull(),
    updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.planetId, table.cellKey] }),
    check(
      "catchment_cell_stock_range",
      sql`${table.ore} between 0 and 1000000 and ${table.wood} between 0 and 1000000 and ${table.herb} between 0 and 1000000
        and ${table.crop} between 0 and 1000000 and ${table.livestock} between 0 and 1000000 and ${table.fish} between 0 and 1000000`,
    ),
    check("catchment_cell_stock_planet_id_format", sql`${table.planetId} ~ '^[a-z][a-z0-9_]{1,47}$'`),
  ],
);
