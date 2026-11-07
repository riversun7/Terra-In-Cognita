// 노동 계약 표(docs/adr/2026-11-03-labor-contracts.md, 기획 D-479·49 N48) — schema.ts가 다시 내보낸다(drizzle-kit 진입점은 schema.ts)
// 쓰기는 월드 쓰기 대기열(원장 거래와 같은 커밋)이다. 유닛·건물·소유 주체에 외래 키를 두지 않는다: 유닛은 NPC 런타임이 지우고
// 건물은 관리자가 지운다 → 계약은 정산할 때 "사라짐"으로 끝낸다(남은 보증금은 돌려준다). 새 표라 직전 판 앱은 모른 채 돈다.
import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, text } from "drizzle-orm/pg-core";

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
    /**
     * 유예가 끝나 시설에 남은 임차인 물건이 시설 주인 창고로 넘어간 시각(기획 341, 옛 StorageUtils expireGraceStorage).
     * 시설 창고가 아직 없어 넘어간 물건은 없다(기록만). null = 유예를 거치지 않았거나 아직. 직전 판 앱은 이 열을 모른다(쓰지 않음)
     */
    leftoversMovedAtMs: bigint("leftovers_moved_at_ms", { mode: "number" }),
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
    check(
      "labor_contracts_leftovers",
      sql`${table.leftoversMovedAtMs} is null or (${table.state} = 'ended' and ${table.kind} = 'lease')`,
    ),
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

/**
 * 구인 게시(남의 유닛을 임금형으로 고용, 기획 D-479 기획 정리 338~342·D-432): 시설 주인이 직무·고용주 조정 ‰(N28)·자리 수·기간을
 * 내고, 유닛 주인이 받으면 임금형 계약(labor_contracts)이 된다. 옛 production_building_config의 모집 중 여부·기본 임금과 같은 자리.
 * 서버는 시설마다 열린 게시를 하나만 둔다(메모리에서 지킨다, 다시 내면 앞 게시는 withdrawn). state = open | filled | withdrawn | gone.
 * 닫힌 줄은 기록으로 남긴다(서버는 열린 줄만 읽는다). 건물·주체에 외래 키 없음(계약 표와 같은 까닭)
 */
export const laborPostings = pgTable(
  "labor_postings",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    buildingId: bigint("building_id", { mode: "number" }).notNull(),
    ownerId: bigint("owner_id", { mode: "number" }).notNull(),
    job: text("job").notNull(),
    asset: text("asset").notNull(),
    adjustPm: integer("adjust_pm").notNull(),
    slots: integer("slots").notNull(),
    filled: integer("filled").notNull().default(0),
    termHours: integer("term_hours"),
    state: text("state").notNull(),
    postedAtMs: bigint("posted_at_ms", { mode: "number" }).notNull(),
    closedAtMs: bigint("closed_at_ms", { mode: "number" }),
  },
  (table) => [
    index("labor_postings_building_idx").on(table.buildingId),
    index("labor_postings_owner_idx").on(table.ownerId),
    check("labor_postings_job", sql`${table.job} in ('gather')`),
    check("labor_postings_state", sql`${table.state} in ('open', 'filled', 'withdrawn', 'gone')`),
    check(
      "labor_postings_counts",
      sql`${table.slots} > 0 and ${table.filled} >= 0 and ${table.filled} <= ${table.slots} and ${table.adjustPm} >= 0`,
    ),
    check("labor_postings_term", sql`${table.termHours} is null or ${table.termHours} > 0`),
    check("labor_postings_closed", sql`(${table.state} = 'open') = (${table.closedAtMs} is null)`),
    check("labor_postings_asset_format", sql`${table.asset} ~ '^[a-z][a-z0-9_]{1,47}$'`),
  ],
);
