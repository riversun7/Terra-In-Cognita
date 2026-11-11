// 고정 NPC 국가 자리 표(docs/adr/2026-11-07-world-layout.md "바뀜 (D-528)") — schema.ts가 다시 내보낸다(drizzle-kit 표 정의 진입점은 schema.ts).
// 개발자·관리자 세계 배치 화면(/dev/world-layout)이 사람이 고른 국가 자리(수도 2차맵)를 적고, 서버가 켤 때 세계 씨앗(src/world/worldBoot.ts)이
// 읽는다. 세력 행 ID가 아니라 세력 코드로 적는다: 시험 세계 새로 시작(reset-world)이 세력 행을 지워도 자리는 남아 새 세계가 처음부터 그 자리에
// 선다(이 표는 WORLD_RESET_KEEP — 사람이 만든 세계 밖 설정).
import { sql } from "drizzle-orm";
import { bigint, check, jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { planetIdColumn } from "./planetColumns.ts";
import { users } from "./schema.ts";

/**
 * 국가 하나의 자리(행성 × 세력 코드 하나에 한 줄). map_key = 수도 2차맵(면 레벨 F 칸 키). applied_at_ms = 마지막으로 세계에 든 시각
 * (null = 다음 켤 때 들 차례). blocked = 들지 못한 까닭 코드 목록(플레이어 것이 걸림 등, 없으면 null). placed_by = 놓은 사람(지워진 계정이면 null)
 */
export const worldNationPlacements = pgTable(
  "world_nation_placements",
  {
    planetId: planetIdColumn(),
    factionCode: text("faction_code").notNull(),
    mapKey: bigint("map_key", { mode: "number" }).notNull(),
    placedBy: uuid("placed_by").references(() => users.id, { onDelete: "set null" }),
    placedAtMs: bigint("placed_at_ms", { mode: "number" }).notNull(),
    appliedAtMs: bigint("applied_at_ms", { mode: "number" }),
    blocked: jsonb("blocked").$type<string[]>(),
  },
  (table) => [
    primaryKey({ columns: [table.planetId, table.factionCode] }),
    check("world_nation_placements_code_format", sql`${table.factionCode} ~ '^[a-z][a-z0-9_]{1,47}$'`),
  ],
);

/**
 * 국력 등급 분포를 이미 선 세계에 반영하라는 요청(docs/adr/2026-11-07-world-layout.md "바뀜 (2026-11-11)") — 행성 하나에 한 줄(다시 요청하면
 * 덮어쓴다). 세계 배치 화면(/dev/world-layout)의 운영자 동작이 적고, 서버가 다음에 켤 때 세계 씨앗·NPC 사회 런타임이 든다(모자란 시작 도시·
 * 주거·처음 인구·경비대·기술만 더한다 — 지우거나 옮기지 않는다). applied_at_ms = 든 시각(null = 다음 켤 때 들 차례), report = 든 결과 요약.
 * 세계 자료라 시험 세계 새로 시작(reset-world)이 비운다(새 세계는 처음부터 등급대로 선다)
 */
export const worldTierRequests = pgTable("world_tier_requests", {
  planetId: planetIdColumn().primaryKey(),
  requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
  requestedAtMs: bigint("requested_at_ms", { mode: "number" }).notNull(),
  appliedAtMs: bigint("applied_at_ms", { mode: "number" }),
  report: jsonb("report").$type<Record<string, unknown>>(),
});

/**
 * 이미 선 NPC 도시 건물을 전략 배치로 다시 놓으라는 요청(docs/adr/2026-11-11-city-building-layout.md) — 행성 하나에 한 줄(다시 요청하면
 * 덮어쓴다). 세계 배치 화면(/dev/world-layout)의 운영자 동작이 적고, 서버가 다음에 켤 때(facilities/cityRelayout.ts) NPC 국가 시작 도시의
 * NPC 건물만 옮긴다(건물 ID·시설 줄·창고 물건은 그대로, 플레이어 것·플레이어가 걸린 건물은 건드리지 않는다). applied_at_ms = 든 시각
 * (null = 다음 켤 때 들 차례), report = 든 결과 요약. 세계 자료라 시험 세계 새로 시작(reset-world)이 비운다
 */
export const worldCityLayoutRequests = pgTable("world_city_layout_requests", {
  planetId: planetIdColumn().primaryKey(),
  requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
  requestedAtMs: bigint("requested_at_ms", { mode: "number" }).notNull(),
  appliedAtMs: bigint("applied_at_ms", { mode: "number" }),
  report: jsonb("report").$type<Record<string, unknown>>(),
});
