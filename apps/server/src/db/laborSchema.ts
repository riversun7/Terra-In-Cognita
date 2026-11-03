// 노동 계약 표(docs/adr/2026-11-03-labor-contracts.md, 기획 D-479·49 N48) — schema.ts가 다시 내보낸다(drizzle-kit 진입점은 schema.ts)
// 쓰기는 월드 쓰기 대기열(원장 거래와 같은 커밋)이다. 유닛·건물·소유 주체에 외래 키를 두지 않는다: 유닛은 NPC 런타임이 지우고
// 건물은 관리자가 지운다 → 계약은 정산할 때 "사라짐"으로 끝낸다(남은 보증금은 돌려준다). 새 표라 직전 판 앱은 모른 채 돈다.
import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text } from "drizzle-orm/pg-core";

/**
 * 계약 한 줄. kind = wage(임금형) | lease(임대형). owner_id = 시설(건물) 주인 주체(임금형 고용주·임대형 임대인),
 * worker_owner_id = 일하는 유닛의 소유 주체(임대형 임차인). rate = 임금형 주기당 임금 | 임대형 시간당 임대료(화폐 최소 단위).
 * deposit = 임금형 보증금 잔액(= 원장 escrow:labor:<id> 잔고, 불변 조건 I14). state = active | paused | grace | ended.
 * 끝난 줄은 기록으로 남긴다(서버는 끝난 지 7일 안의 줄만 읽는다)
 */
export const laborContracts = pgTable(
  "labor_contracts",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    kind: text("kind").notNull(),
    ownerId: bigint("owner_id", { mode: "number" }).notNull(),
    workerOwnerId: bigint("worker_owner_id", { mode: "number" }).notNull(),
    unitId: bigint("unit_id", { mode: "number" }).notNull(),
    buildingId: bigint("building_id", { mode: "number" }).notNull(),
    asset: text("asset").notNull(),
    rate: bigint("rate", { mode: "bigint" }).notNull(),
    deposit: bigint("deposit", { mode: "bigint" }).notNull().default(0n),
    startedAtMs: bigint("started_at_ms", { mode: "number" }).notNull(),
    /** 기간 끝(선택). null = 기간 없음 */
    endsAtMs: bigint("ends_at_ms", { mode: "number" }),
    settledAtMs: bigint("settled_at_ms", { mode: "number" }).notNull(),
    nextDueMs: bigint("next_due_ms", { mode: "number" }).notNull(),
    state: text("state").notNull(),
    graceUntilMs: bigint("grace_until_ms", { mode: "number" }),
    endedAtMs: bigint("ended_at_ms", { mode: "number" }),
    endReason: text("end_reason"),
    paidTotal: bigint("paid_total", { mode: "bigint" }).notNull().default(0n),
  },
  (table) => [
    index("labor_contracts_owner_idx").on(table.ownerId),
    index("labor_contracts_worker_owner_idx").on(table.workerOwnerId),
    index("labor_contracts_unit_idx").on(table.unitId),
    check("labor_contracts_kind", sql`${table.kind} in ('wage', 'lease')`),
    check("labor_contracts_state", sql`${table.state} in ('active', 'paused', 'grace', 'ended')`),
    check("labor_contracts_rate", sql`${table.rate} > 0`),
    check(
      "labor_contracts_deposit",
      sql`${table.deposit} >= 0 and (${table.kind} = 'wage' or ${table.deposit} = 0)`,
    ),
    check(
      "labor_contracts_end",
      sql`(${table.state} in ('active', 'paused')) = (${table.endReason} is null) and (${table.state} = 'grace') = (${table.graceUntilMs} is not null)`,
    ),
    check("labor_contracts_asset_format", sql`${table.asset} ~ '^[a-z][a-z0-9_]{1,47}$'`),
  ],
);

/**
 * 시설 임대 조건(임대형, D-479 "임대료는 시간당 고정이고 오너가 정한다"): 건물마다 한 줄. 임차인은 이 값으로 빌린다.
 * 오너가 바꾸면 그 건물의 열린 임대 계약도 다음 시간부터 이 값이다. rent_per_hour = 0이면 새로 빌려주지 않는다
 */
export const laborRents = pgTable(
  "labor_rents",
  {
    buildingId: bigint("building_id", { mode: "number" }).primaryKey(),
    ownerId: bigint("owner_id", { mode: "number" }).notNull(),
    asset: text("asset").notNull(),
    rentPerHour: bigint("rent_per_hour", { mode: "bigint" }).notNull(),
    updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    check("labor_rents_nonnegative", sql`${table.rentPerHour} >= 0`),
    check("labor_rents_asset_format", sql`${table.asset} ~ '^[a-z][a-z0-9_]{1,47}$'`),
  ],
);
