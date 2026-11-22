// 사업장 장부 표(기획 D-548·D-555, docs/adr/2026-11-15-business-ledger.md) — schema.ts가 다시 내보낸다(drizzle-kit 진입점은 schema.ts).
// 금고·창고 돈과 물건은 원장 계정(건물 위치)에 있고 표를 새로 두지 않는다. 여기는 원장에 없는 것만:
// - business_states: 사업장(건물)마다 적자가 생긴 시각·멈춘 시각·마지막 자동 정산 주기. 갚을 돈 자체는 시스템 계정 debt:business:<건물>:<화폐>.
//   바뀜 (D-564 1623): reserve_pm = 주인이 고른 지급준비율(‰, null = 설정 칸 기본값). 열만 더해 직전 판 앱은 그대로 돈다(모르는 열은 기본값 null).
// - business_prices: 사업장 창고 판매 값(아이템마다 1개 값, D-555 1507).
// 건물에 외래 키를 두지 않는다(건물이 사라지면 서비스가 줄을 지운다 — 시설·배 표와 같은 까닭). 더하기만 해서 직전 판 앱은 그대로 돈다.
import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { planetIdColumn } from "./planetColumns.ts";

export const businessStates = pgTable("business_states", {
  buildingId: bigint("building_id", { mode: "number" }).primaryKey(),
  planetId: planetIdColumn(),
  debtSinceMs: bigint("debt_since_ms", { mode: "number" }),
  suspendedAtMs: bigint("suspended_at_ms", { mode: "number" }),
  settledAtMs: bigint("settled_at_ms", { mode: "number" }),
  reservePm: integer("reserve_pm"),
});

export const businessPrices = pgTable(
  "business_prices",
  {
    buildingId: bigint("building_id", { mode: "number" }).notNull(),
    item: text("item").notNull(),
    planetId: planetIdColumn(),
    price: bigint("price", { mode: "bigint" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.buildingId, table.item] }),
    check("business_prices_price", sql`${table.price} >= 0`),
  ],
);

// 생산시설 지분 동시호가(docs/adr/2026-11-15-building-screen.md, 기획 44 §6·D-125·D-130). 지분 자체는 원장 자산 share:biz_<건물>이고
// 에스크로는 시스템 계정 escrow:share:<건물>:base·quote다(@terra/sim createFxMarket prefix "share"). 여기는 원장에 없는 주문·회차만:
// - business_share_orders: 회차에 낸 주문(open은 부팅 때 같은 차례로 되살린다, locked = 지금 묶인 양). 회차가 끝나면 done(체결 주 수·체결가),
//   거두면 cancelled로 남긴다(내 주문 기록).
// - business_share_rounds: 회차 결과(추가만, 지난 체결가·차트).
// 건물에 외래 키를 두지 않는다(위 표와 같은 까닭). 더하기만 해서 직전 판 앱은 그대로 돈다.
export const businessShareOrders = pgTable(
  "business_share_orders",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    buildingId: bigint("building_id", { mode: "number" }).notNull(),
    planetId: planetIdColumn(),
    ownerId: bigint("owner_id", { mode: "number" }).notNull(),
    side: text("side").notNull(),
    /** 1주 값(값을 매기는 화폐 최소 단위) */
    price: bigint("price", { mode: "bigint" }).notNull(),
    shares: bigint("shares", { mode: "bigint" }).notNull(),
    /** 지금 묶인 양(사기 = 값 × 주의 화폐, 팔기 = 주). 끝난 주문은 0 */
    locked: bigint("locked", { mode: "bigint" }).notNull(),
    /** 낸 차례(같은 값 안의 시간 우선, 부팅 복원) */
    seq: integer("seq").notNull(),
    placedAtMs: bigint("placed_at_ms", { mode: "number" }).notNull(),
    /** open·done·cancelled */
    state: text("state").notNull(),
    filled: bigint("filled", { mode: "bigint" }).notNull().default(0n),
    clearPrice: bigint("clear_price", { mode: "bigint" }),
    doneAtMs: bigint("done_at_ms", { mode: "number" }),
    /** 주문을 낸 증권 거래소 건물(그 거래소 판에서 냈을 때 — 이용료를 받는다, gov-fix-4 D-591 2523). null = 거래소를 거치지 않음 */
    exchangeId: bigint("exchange_id", { mode: "number" }),
  },
  (table) => [
    check("business_share_orders_side", sql`${table.side} in ('buy', 'sell')`),
    check("business_share_orders_state", sql`${table.state} in ('open', 'done', 'cancelled')`),
    check("business_share_orders_amounts", sql`${table.price} > 0 and ${table.shares} > 0`),
    index("business_share_orders_open").on(table.state, table.buildingId),
    index("business_share_orders_owner").on(table.ownerId, table.id),
  ],
);

export const businessShareRounds = pgTable(
  "business_share_rounds",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    buildingId: bigint("building_id", { mode: "number" }).notNull(),
    planetId: planetIdColumn(),
    atMs: bigint("at_ms", { mode: "number" }).notNull(),
    /** 체결가(1주 값). 체결이 없었으면 null */
    price: bigint("price", { mode: "bigint" }),
    shares: bigint("shares", { mode: "bigint" }).notNull(),
  },
  (table) => [index("business_share_rounds_building").on(table.buildingId, table.atMs)],
);
