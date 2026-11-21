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
