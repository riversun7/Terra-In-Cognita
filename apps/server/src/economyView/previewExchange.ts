// 환전 시안 자료 — 기준 통화 짝마다 가짜 주문을 모아 sim 동시호가(clearCallAuction, D-125·R2 ADR 6절)로 예상 체결가를 낸다.
// 서버가 환전을 아직 돌리지 않아 화면 모양을 보려는 것이다(dev·admin 시안 자료에서만).
// - 짝 = (화폐 X, 기준 통화). 값 = 로트(X 최소 단위 FX_LOT_SIZE개)당 기준 통화 최소 단위. 회차는 한 시간(E8 기존 값).
// - 지난 회차 체결가는 시간에 따라 천천히 움직이는 기준 값이다(previewMarket.ts의 잡음). 이번 회차 주문은 시드 난수로 만든다.
// - 값은 모두 [임시]다.
import type { EconomyCatalogResponse, FxLevel, FxPairView } from "@terra/shared/economy";
import { createRng } from "@terra/shared";
import { type AuctionOrder, clearCallAuction } from "@terra/sim";
import { changeBp } from "./marketShape.ts";
import { fairPermille, mix32 } from "./previewMarket.ts";
import { previewCash } from "./previewWorld.ts";

const HOUR = 3_600_000;

/** 환전 회차 길이(E8, 기존 환율 1시간) */
export const FX_INTERVAL_MS = HOUR;
/** [임시] 로트 크기(X 최소 단위) */
export const FX_LOT_SIZE = 1000n;
/** 보내는 지난 회차 수 */
const FX_HISTORY = 24;
/** 보내는 호가 단계 수(쪽마다) */
const FX_DEPTH = 8;
/** 짝으로 보이는 화폐 수(기준 통화 빼고) */
const FX_PAIRS = 3;
/** 나라 차례별 [임시] 1로트 값(기준 통화 최소 단위) */
const FX_LEVEL: readonly bigint[] = [1000n, 312n, 2083n, 666n];

/** 다음 회차 시각 */
export function nextAuctionAt(nowMs: number): number {
  return (Math.floor(nowMs / FX_INTERVAL_MS) + 1) * FX_INTERVAL_MS;
}

function levelAt(seed: number, base: bigint, round: number): bigint {
  // 회차 하나 = 잡음 6칸(1시간 물결이 회차마다 한 번 바뀌게)
  const value = (base * BigInt(fairPermille(seed, round * 6))) / 1000n;
  return value > 0n ? value : 1n;
}

/** 같은 값끼리 로트를 합친 단계(살 쪽은 높은 값 차례, 팔 쪽은 낮은 값 차례) */
function fxLevels(orders: readonly AuctionOrder[], descending: boolean): FxLevel[] {
  const byPrice = new Map<bigint, bigint>();
  for (const order of orders) byPrice.set(order.price, (byPrice.get(order.price) ?? 0n) + order.lots);
  return [...byPrice.keys()]
    .toSorted((a, b) => {
      const ascending = a < b ? -1 : a > b ? 1 : 0;
      return descending ? -ascending : ascending;
    })
    .slice(0, FX_DEPTH)
    .map((price) => ({ price: String(price), lots: String(byPrice.get(price) ?? 0n) }));
}

/** 짝 하나의 시안 자료 */
export function previewFxPair(
  catalog: EconomyCatalogResponse,
  currency: string,
  index: number,
  nowMs: number,
): FxPairView {
  const seed = mix32(0x46582000, index);
  const base = FX_LEVEL[index % FX_LEVEL.length] ?? 1000n;
  const round = Math.floor(nowMs / FX_INTERVAL_MS);
  const history = Array.from({ length: FX_HISTORY }, (_, offset) => {
    const at = (round - FX_HISTORY + offset) * FX_INTERVAL_MS;
    return { at, price: levelAt(seed, base, round - FX_HISTORY + offset) };
  });
  const last = history.at(-1)?.price;
  const fair = levelAt(seed, base, round);
  const rng = createRng(mix32(seed, round));
  const buys: AuctionOrder[] = [];
  const sells: AuctionOrder[] = [];
  let seq = 1;
  for (let count = 0; count < 12; count += 1) {
    for (const side of ["buy", "sell"] as const) {
      const offset = BigInt(rng.nextInt(41));
      const price =
        side === "buy" ? (fair * (1000n + 15n - offset)) / 1000n : (fair * (1000n - 15n + offset)) / 1000n;
      const order = {
        id: seq,
        owner: 1 + rng.nextInt(6),
        price: price > 0n ? price : 1n,
        lots: BigInt(1 + rng.nextInt(40)),
        seq,
      };
      seq += 1;
      (side === "buy" ? buys : sells).push(order);
    }
  }
  const result = clearCallAuction(buys, sells, last);
  return {
    currency,
    lotSize: String(FX_LOT_SIZE),
    last: last === undefined ? null : String(last),
    indicative: result.price === undefined ? null : String(result.price),
    indicativeLots: String(result.lots),
    changeBp: changeBp(last, history[0]?.price),
    buys: fxLevels(buys, true),
    sells: fxLevels(sells, false),
    history: history.map((entry) => ({ at: entry.at, price: String(entry.price) })),
    balance: String(previewCash(catalog, currency)),
  };
}

/** 기준 통화를 뺀 앞 화폐들의 짝 */
export function previewFxPairs(catalog: EconomyCatalogResponse, nowMs: number): FxPairView[] {
  return catalog.currencies
    .slice(1, 1 + FX_PAIRS)
    .map((currency, offset) => previewFxPair(catalog, currency.code, offset + 1, nowMs));
}
