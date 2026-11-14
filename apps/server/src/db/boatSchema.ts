// 배 만들기 작업 표(docs/adr/2026-11-13-boats.md "바뀜 (2026-11-14, B2)", 기획 D-541 1271 나) — schema.ts가 다시 내보낸다(drizzle-kit 진입점은 schema.ts).
// 배 하나 = 줄 하나. 부두에서 [배 만들기]를 누르면 재료를 빼고 줄을 넣고, 끝 시각(done_at_ms)에 배가 부두 옆 물에 뜨면 줄을 지운다.
// id = 다 되면 쓸 배 유닛 ID(만들기 때 미리 받는다 — 다시 켜도 같은 ID). 쓰기는 월드 쓰기 대기열(src/world/persist/writer.ts) 하나다.
// 부두·소유 주체에 외래 키를 두지 않는다(부두가 부서지거나 치워지면 배 서비스가 줄을 지운다 — 노동 계약·이동 줄과 같은 까닭).
// 직전 판 앱은 이 표를 모른 채 그대로 돈다(더하기만).
import { sql } from "drizzle-orm";
import { bigint, check, index, jsonb, pgTable } from "drizzle-orm/pg-core";
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
  },
  (table) => [
    index("boat_jobs_building_idx").on(table.buildingId),
    check("boat_jobs_time", sql`${table.doneAtMs} >= ${table.startedAtMs}`),
  ],
);
