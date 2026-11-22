// 도시(정부) 지분 시장 표(기획 D-583 — 질문 2438 답, docs/adr/2026-11-21-share-market.md) — schema.ts가 다시 내보낸다(drizzle-kit 진입점은 schema.ts).
// 지분 자체는 원장 자산 share_<도시>(D-130)이고 사는 돈 에스크로는 시스템 계정 escrow:cityshare:<도시>:<화폐>다. 여기는 원장에 없는 주문·회차만:
// - city_share_orders: 회차에 낸 주문(open은 부팅 때 같은 차례로 되살린다). holder = 낸 쪽(o:<소유 주체> | h:<가문 꼬리> — 가문 지분 계정·가문 금고),
//   asset = 값을 매기는 화폐(낸 때 그 도시 주인 나라 화폐), locked = 묶인 돈(사기만 — 팔 지분은 묶지 않는다, ADR 2절), agenda_id = 승인된 국고 지분
//   팔기 안건(국고 주문만). 회차가 끝나면 done(체결 주 수·체결가), 거두면 cancelled로 남긴다.
// - city_share_rounds: 회차 결과(추가만, 지난 체결가·차트).
// 도시·안건에 외래 키를 두지 않는다(도시가 폐허가 되어도 기록은 남는다 — 사업장 지분 표와 같은 까닭). 새 표만 더해 직전 판 앱은 그대로 돈다.
import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { planetIdColumn } from "./planetColumns.ts";

export const cityShareOrders = pgTable(
  "city_share_orders",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    cityId: bigint("city_id", { mode: "number" }).notNull(),
    planetId: planetIdColumn(),
    /** 낸 쪽: o:<소유 주체 ID> | h:<가문 꼬리>("12:" · "npc:5:") */
    holder: text("holder").notNull(),
    side: text("side").notNull(),
    /** 1주 값(asset 최소 단위) */
    price: bigint("price", { mode: "bigint" }).notNull(),
    shares: bigint("shares", { mode: "bigint" }).notNull(),
    /** 값을 매기는 화폐(원장 자산) */
    asset: text("asset").notNull(),
    /** 지금 묶인 돈(사기 = 값 × 주). 팔기·끝난 주문은 0 */
    locked: bigint("locked", { mode: "bigint" }).notNull(),
    /** 낸 차례(같은 값 안의 시간 우선, 부팅 복원) */
    seq: integer("seq").notNull(),
    placedAtMs: bigint("placed_at_ms", { mode: "number" }).notNull(),
    /** open·done·cancelled */
    state: text("state").notNull(),
    filled: bigint("filled", { mode: "bigint" }).notNull().default(0n),
    clearPrice: bigint("clear_price", { mode: "bigint" }),
    doneAtMs: bigint("done_at_ms", { mode: "number" }),
    /** 승인된 국고 지분 팔기 안건(국고 주문만, 질문 2438 답 D-583) */
    agendaId: bigint("agenda_id", { mode: "number" }),
    /** 주문을 낸 증권 거래소 건물(그 거래소 판에서 냈을 때 — 이용료를 받는다, gov-fix-4 D-591 2523). null = 거래소를 거치지 않음. 직전 판 앱은 쓰지 않는다 */
    exchangeId: bigint("exchange_id", { mode: "number" }),
  },
  (table) => [
    check("city_share_orders_side", sql`${table.side} in ('buy', 'sell')`),
    check("city_share_orders_state", sql`${table.state} in ('open', 'done', 'cancelled')`),
    check(
      "city_share_orders_amounts",
      sql`${table.price} > 0 and ${table.shares} > 0 and ${table.locked} >= 0`,
    ),
    index("city_share_orders_open").on(table.state, table.cityId),
    index("city_share_orders_holder").on(table.holder, table.id),
  ],
);

export const cityShareRounds = pgTable(
  "city_share_rounds",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    cityId: bigint("city_id", { mode: "number" }).notNull(),
    planetId: planetIdColumn(),
    atMs: bigint("at_ms", { mode: "number" }).notNull(),
    /** 체결가(1주 값). 체결이 없었으면 null */
    price: bigint("price", { mode: "bigint" }),
    shares: bigint("shares", { mode: "bigint" }).notNull(),
    /** 값을 매긴 화폐 */
    asset: text("asset").notNull(),
  },
  (table) => [index("city_share_rounds_city").on(table.cityId, table.atMs)],
);

/**
 * 국고 지분 안건 집행(줄기 gov-fix-4 — 사용자 결정 D-591 2526 "돈이없으면 못사는거고 취득량만 정하는거다. 통과된안건은 주-월 단위 기간이 있고 실행되지못하면 취소할지
 * 계속할지 재투표"). 승인된 국고 지분 사기·팔기 안건마다 한 줄(agenda_id): side = buy | sell, target = 정한 수량, price = 한 주 가장 높은(사기)·낮은(팔기) 값,
 * done = 지금까지 체결한 주, ends_at_ms = 집행 기간 끝(설정 칸 gov_share_exec_ms). state = active(회차마다 국고 돈·주가 있는 만큼 주문을 채운다) | filled(다 채움) |
 * expired(기간 끝 — 남은 수량은 재투표 revote_agenda_id로) | cancelled(지도자가 국고 주문을 거둠). 쓰는 곳은 cityShares/treasuryRuns.ts 하나다.
 * 새 표만 더해 직전 판 앱은 그대로 돈다(직전 판은 승인 때 한 번 주문만 건다)
 */
export const treasuryShareRuns = pgTable(
  "treasury_share_runs",
  {
    agendaId: bigint("agenda_id", { mode: "number" }).primaryKey(),
    nationId: bigint("nation_id", { mode: "number" }).notNull(),
    side: text("side").notNull(),
    cityId: bigint("city_id", { mode: "number" }).notNull(),
    target: bigint("target", { mode: "bigint" }).notNull(),
    price: bigint("price", { mode: "bigint" }).notNull(),
    done: bigint("done", { mode: "bigint" }).notNull().default(0n),
    startedAtMs: bigint("started_at_ms", { mode: "number" }).notNull(),
    endsAtMs: bigint("ends_at_ms", { mode: "number" }).notNull(),
    state: text("state").notNull(),
    /** 기간이 끝나 연 재투표 안건(없으면 null — 독재 나라는 열지 않는다) */
    revoteAgendaId: bigint("revote_agenda_id", { mode: "number" }),
  },
  (table) => [
    check("treasury_share_runs_side", sql`${table.side} in ('buy', 'sell')`),
    check("treasury_share_runs_state", sql`${table.state} in ('active', 'filled', 'expired', 'cancelled')`),
    check(
      "treasury_share_runs_amounts",
      sql`${table.target} > 0 and ${table.price} > 0 and ${table.done} >= 0`,
    ),
    index("treasury_share_runs_active").on(table.state),
  ],
);
