// 폐허·복원 사업 표(docs/adr/2026-11-07-ruins-restoration.md, 기획 D-510·D-339·D-343·D-344) — schema.ts가 다시 내보낸다
// (drizzle-kit 표 정의 진입점은 schema.ts). factions·world_owners는 schema.ts에서 오고, 참조는 함수 안에서만 읽어 순환 가져오기가
// 문제되지 않는다. 쓰기는 월드 쓰기 대기열(src/world/persist/writer.ts) 하나다. 직전 판 앱은 이 표를 모른 채 그대로 돈다(더하기만).
// 폐허가 된 도시의 world_cities 행은 지금처럼 지운다(영토를 잃음, D-105). 복원하면 같은 ID로 world_cities 행을 다시 넣고 폐허 행을 지운다.
// 낸 값은 원장 에스크로 계정(escrow:restore:<폐허>:<화폐>)에 있고, 이 표는 누가 얼마를 냈는지만 든다(합 = 에스크로 잔고, 불변 조건).
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
} from "drizzle-orm/pg-core";
import { factions, worldOwners } from "./schema.ts";
import { planetIdColumn } from "./planetColumns.ts";

/**
 * 폐허(웨이브에 무너진 도시, D-105·D-464 217). id = 무너진 도시 ID(복원하면 같은 ID로 도시가 돌아온다 — 도시 지분 share_<ID>가 이어진다).
 * 자리(2차맵 칸)·옛 주인·주거 수와, 정부를 먼저 지은 주인(D-510)·복원 사업(목표·화폐·모금 열림)을 둔다. 주인이 없으면 주인 칸이 모두 비어 있다
 */
export const worldRuins = pgTable(
  "world_ruins",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    planetId: planetIdColumn(),
    mapKey: bigint("map_key", { mode: "number" }).notNull(),
    cellX: integer("cell_x").notNull(),
    cellY: integer("cell_y").notNull(),
    /** 무너지기 전 주인 세력(세력 행은 사라져도 남는다 — dissolved_at_ms) */
    formerFactionId: bigint("former_faction_id", { mode: "number" }).references(
      (): AnyPgColumn => factions.id,
    ),
    ruinedAtMs: bigint("ruined_at_ms", { mode: "number" }).notNull(),
    /** 무너지기 전 주거 수(복원하면 그대로) */
    housing: integer("housing").notNull().default(0),
    /** 정부(행정 건물)를 먼저 지은 주체(유저 또는 세력 소유 주체). null = 주인 없음 */
    claimantOwnerId: bigint("claimant_owner_id", { mode: "number" }).references(
      (): AnyPgColumn => worldOwners.id,
    ),
    /** 복원하면 도시가 드는 세력(NPC 주인 = 그 세력, 유저 주인 = 그 유저의 나라 — 확인 대기 질문 481) */
    joinFactionId: bigint("join_faction_id", { mode: "number" }).references((): AnyPgColumn => factions.id),
    claimedAtMs: bigint("claimed_at_ms", { mode: "number" }),
    /** 유저가 2차맵에 지은 정부 건물(건물이 사라져도 줄은 남는다 — 외래 키 없음) */
    governmentBuildingId: bigint("government_building_id", { mode: "number" }),
    /** 복원 목표(최소 단위)·화폐(원장 자산 코드). 주인이 될 때 정한다 */
    goal: bigint("goal", { mode: "bigint" }),
    currency: text("currency"),
    /** 주인이 모금을 열었나(열면 누구나 넣는다, D-343) */
    open: boolean("open").notNull().default(false),
  },
  (table) => [
    index("world_ruins_map_idx").on(table.mapKey),
    check(
      "world_ruins_claim",
      sql`(${table.claimantOwnerId} is null) = (${table.joinFactionId} is null) and (${table.claimantOwnerId} is null) = (${table.goal} is null)`,
    ),
    check("world_ruins_goal", sql`${table.goal} is null or ${table.goal} > 0`),
    check("world_ruins_planet_id_format", sql`${table.planetId} ~ '^[a-z][a-z0-9_]{1,47}$'`),
  ],
);

/** 복원 사업에 낸 값(폐허 × 소유 주체, 합 = 에스크로 잔고). 폐허 줄이 지워지면(복원) 함께 지워진다 */
export const restorationContributions = pgTable(
  "restoration_contributions",
  {
    ruinId: bigint("ruin_id", { mode: "number" })
      .notNull()
      .references((): AnyPgColumn => worldRuins.id, { onDelete: "cascade" }),
    ownerId: bigint("owner_id", { mode: "number" })
      .notNull()
      .references((): AnyPgColumn => worldOwners.id),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ruinId, table.ownerId] }),
    check("restoration_contributions_amount", sql`${table.amount} > 0`),
  ],
);
