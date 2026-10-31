// 거래창 시안 자료 — 가짜 주문을 sim 물자 거래소(createGoodsMarket, 연속 체결 D-125·R2 ADR 4절)에 넣어 호가·체결을 만든다.
// 서버가 거래소를 아직 열지 않아(주문 표·복원 없음, R2 ADR "결과") 화면 모양을 보려는 것이다. dev·admin 시안 자료에서만 쓴다.
// 게임 앱은 sim을 가져오지 않으므로(AGENTS 4장) 호가·체결·봉은 모두 여기서 계산해 보낸다.
// - 지난 24시간을 10분 칸으로 나눠 칸마다 시드 난수(칸 번호·시장 번호)로 주문을 만든다: 양쪽에 걸어 두는 주문 2개 + 70%로
//   바로 체결되는 주문 1개. 기준 값은 시간에 따라 천천히 움직인다(격자 값 잡음, 칸마다 상태 없이 계산).
// - "내" 주문(PREVIEW_ME)은 정한 칸에 넣는다(걸린 것·체결된 것·만료된 것이 함께 보이게).
// - 같은 10분 칸 안에서는 같은 결과다(캐시). 칸이 넘어가면 창이 밀려 값이 조금씩 바뀐다(살아 있는 듯이).
// - 값은 모두 [임시]다(거래 판단은 게임 규칙이 아니다, R2 ADR 8절 대리 판단과 같은 성격).
import { createRng } from "@terra/shared";
import { type BookOrder, type Side, createGoodsMarket, createLedgerBook } from "@terra/sim";
import { PREVIEW_ME } from "./previewWorld.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 주문을 만드는 칸 길이 */
export const PREVIEW_BUCKET_MS = 10 * MINUTE;
/** 되돌려 만드는 칸 수(24시간) */
export const PREVIEW_WINDOW_BUCKETS = 144;
/** 봉 하나의 길이 */
export const PREVIEW_CANDLE_MS = 30 * MINUTE;
/** 가짜 거래자 수(주체 1~6) */
const TRADERS = 6;
/** 넉넉한 처음 몫(모자라 거절되지 않게) */
const ENDOW_GOODS = 1_000_000_000n;
const ENDOW_CASH = 1_000_000_000_000_000n;

/** 32비트 섞기(시드 만들기). 정수 연산만 쓴다 */
export function mix32(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ b;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** 격자점 값 −1000~1000 */
function lattice(seed: number, index: number): number {
  return (mix32(seed, index) % 2001) - 1000;
}

/** 칸 b에서 격자 간격 span의 부드러운 잡음(−1000~1000) */
function smoothNoise(seed: number, bucket: number, span: number): number {
  const i0 = Math.floor(bucket / span);
  const frac = (bucket - i0 * span) / span;
  const f = frac * frac * (3 - 2 * frac);
  const a = lattice(seed, i0);
  const b = lattice(seed, i0 + 1);
  return a + (b - a) * f;
}

/** 칸 b의 기준 값(천분율 배율): 12시간 물결 ±7% + 1시간 물결 ±2.5% */
export function fairPermille(seed: number, bucket: number): number {
  const slow = smoothNoise(seed, bucket, 72);
  const fast = smoothNoise(seed ^ 0x5bd1e995, bucket, 6);
  return Math.round(1000 + (70 * slow) / 1000 + (25 * fast) / 1000);
}

/** 값 × 천분율(1 아래로 내려가지 않는다) */
function scalePm(value: bigint, permille: number): bigint {
  const scaled = (value * BigInt(Math.max(1, Math.round(permille)))) / 1000n;
  return scaled > 0n ? scaled : 1n;
}

/** 시안 "내" 주문 계획: 창 끝에서 몇 칸 전에, 그때 기준 값의 몇 천분율로 */
export interface MyOrderPlan {
  readonly bucketsAgo: number;
  readonly side: Side;
  readonly pricePm: number;
  readonly qty: bigint;
  readonly lifeMs: number;
}

export interface PreviewMarketSpec {
  /** 시장 시드(도시·물건마다 다르게) */
  readonly seed: number;
  /** 거래소가 있는 도시(창고 위치, 장부용 정수) */
  readonly location: number;
  readonly item: string;
  readonly currency: string;
  readonly basePrice: bigint;
  readonly taxBp: number;
  readonly mine: readonly MyOrderPlan[];
}

export interface PreviewTrade {
  readonly at: number;
  readonly price: bigint;
  readonly qty: bigint;
  /** 들어온 주문의 쪽 */
  readonly side: Side;
  /** 내 주문이 낀 체결인지 */
  readonly mine: boolean;
}

export interface PreviewMyOrder {
  readonly id: number;
  readonly side: Side;
  readonly price: bigint;
  readonly qty: bigint;
  remaining: bigint;
  readonly placedAt: number;
  readonly expiresAt: number;
  status: "open" | "filled" | "expired";
  /** 끝난 시각(체결·만료). 걸려 있으면 null */
  doneAt: number | null;
}

export interface PreviewMarketState {
  /** 창 끝 칸 번호(이 칸까지 만들었다) */
  readonly bucket: number;
  /** 체결(오래된 차례) */
  readonly trades: readonly PreviewTrade[];
  /** 걸린 주문(건 차례) */
  readonly orders: readonly BookOrder[];
  readonly mine: readonly PreviewMyOrder[];
}

/** 지금 시각의 칸 번호 */
export function bucketOf(nowMs: number): number {
  return Math.floor(nowMs / PREVIEW_BUCKET_MS);
}

/** 시장 하나를 창 끝(nowMs가 든 칸)까지 돌린다 */
export function simulatePreviewMarket(spec: PreviewMarketSpec, nowMs: number): PreviewMarketState {
  const end = bucketOf(nowMs);
  const start = end - PREVIEW_WINDOW_BUCKETS + 1;
  let accountId = 1;
  let txId = 1;
  const book = createLedgerBook({ nextAccountId: () => accountId++, nextTxId: () => txId++ });
  const goodsAsset = `item:${spec.item}`;
  const cashAsset = `cur:${spec.currency}`;
  for (const owner of [...Array.from({ length: TRADERS }, (_, index) => index + 1), PREVIEW_ME]) {
    book.post({
      kind: "endow",
      atMs: start * PREVIEW_BUCKET_MS,
      entries: [
        {
          account: book.systemAccount(`source:${goodsAsset}`, goodsAsset, spec.location),
          amount: -ENDOW_GOODS,
        },
        { account: book.ownerAccount(owner, goodsAsset, spec.location), amount: ENDOW_GOODS },
        { account: book.systemAccount(`issue:${cashAsset}`, cashAsset), amount: -ENDOW_CASH },
        { account: book.ownerAccount(owner, cashAsset), amount: ENDOW_CASH },
      ],
    });
  }
  let orderId = 1;
  const market = createGoodsMarket(
    {
      id: 1,
      location: spec.location,
      item: goodsAsset,
      currency: cashAsset,
      taxBp: spec.taxBp,
      treasuryOwner: TRADERS + 1,
    },
    book,
    () => orderId++,
  );
  const trades: PreviewTrade[] = [];
  const mine = new Map<number, PreviewMyOrder>();

  const place = (owner: number, side: Side, price: bigint, qty: bigint, at: number, expiresAt: number) => {
    const result = market.place(owner, side, price, qty, at, expiresAt);
    if (!result.ok) return undefined;
    if (owner === PREVIEW_ME) {
      mine.set(result.orderId, {
        id: result.orderId,
        side,
        price,
        qty,
        remaining: qty,
        placedAt: at,
        expiresAt,
        status: "open",
        doneAt: null,
      });
    }
    for (const fill of result.fills) {
      const involved = fill.makerOwner === PREVIEW_ME || fill.takerOwner === PREVIEW_ME;
      trades.push({ at, price: fill.price, qty: fill.qty, side: fill.takerSide, mine: involved });
      for (const id of [fill.makerId, fill.takerId]) {
        const order = mine.get(id);
        if (!order) continue;
        order.remaining -= fill.qty;
        if (order.remaining === 0n) {
          order.status = "filled";
          order.doneAt = at;
        }
      }
    }
    return result.orderId;
  };

  for (let bucket = start; bucket <= end; bucket += 1) {
    const t0 = bucket * PREVIEW_BUCKET_MS;
    if (market.expire(t0) > 0) {
      const resting = new Set(market.orders().map((order) => order.id));
      for (const order of mine.values()) {
        if (order.status === "open" && !resting.has(order.id)) {
          order.status = "expired";
          order.doneAt = order.expiresAt;
        }
      }
    }
    const rng = createRng(mix32(spec.seed, bucket));
    const fair = scalePm(spec.basePrice, fairPermille(spec.seed, bucket));
    // 양쪽에 걸어 두는 주문(기준 값에서 0.2~3.2% 떨어져서)
    for (const side of ["buy", "sell"] as const) {
      const offset = 2 + rng.nextInt(31);
      const price = scalePm(fair, side === "buy" ? 1000 - offset : 1000 + offset);
      const qty = BigInt(5 + rng.nextInt(56));
      const owner = 1 + rng.nextInt(TRADERS);
      const at = t0 + (side === "buy" ? 1 : 2) * MINUTE;
      place(owner, side, price, qty, at, at + (2 + rng.nextInt(7)) * HOUR);
    }
    // 바로 체결되는 주문(70%)
    if (rng.nextInt(10) < 7) {
      const side: Side = rng.nextInt(2) === 0 ? "buy" : "sell";
      const price = scalePm(fair, side === "buy" ? 1025 : 975);
      const qty = BigInt(3 + rng.nextInt(33));
      const at = t0 + (4 + rng.nextInt(5)) * MINUTE;
      place(1 + rng.nextInt(TRADERS), side, price, qty, at, at + HOUR);
    }
    for (const plan of spec.mine) {
      if (end - plan.bucketsAgo !== bucket) continue;
      const at = t0 + 9 * MINUTE;
      place(PREVIEW_ME, plan.side, scalePm(fair, plan.pricePm), plan.qty, at, at + plan.lifeMs);
    }
  }
  return { bucket: end, trades, orders: market.orders(), mine: [...mine.values()] };
}

/** 시안 내 주문 계획 표: "도시|물건" → 계획 [임시] */
export const PREVIEW_MY_PLANS: Readonly<Record<string, readonly MyOrderPlan[]>> = {
  "101|iron_ore": [{ bucketsAgo: 50, side: "sell", pricePm: 1120, qty: 40n, lifeMs: 7 * DAY }],
  "101|grain": [{ bucketsAgo: 20, side: "buy", pricePm: 950, qty: 500n, lifeMs: 3 * DAY }],
  "101|timber": [{ bucketsAgo: 8, side: "buy", pricePm: 965, qty: 25n, lifeMs: DAY }],
  "103|iron_ingot": [{ bucketsAgo: 90, side: "buy", pricePm: 1040, qty: 30n, lifeMs: 7 * DAY }],
  "102|ration": [{ bucketsAgo: 130, side: "sell", pricePm: 1150, qty: 100n, lifeMs: 4 * HOUR }],
};
